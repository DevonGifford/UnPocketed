import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  useAudioRecorder,
  type RecordingStatus,
} from "expo-audio";

import { File } from "expo-file-system";

import { applyAudioMode } from "@/lib/audio-mode";
import { withTimeout, TimeoutError } from "@/lib/with-timeout";
import type { Recording } from "@/types";

import {
  recordingFailure,
  type RecordingFailure,
  type RecordingFailureReason,
} from "./errors";
import { ensureRecordingPermissions } from "./permissions";
import { persistRecording } from "./storage";
import { adoptOrphan, recoverOrphanedRecordings } from "./recovery";
import { indexRecording } from "@/features/library";

/**
 * The real recording session (§11), replacing PR1's mocked one.
 *
 * `HIGH_QUALITY` requests 128 kbps AAC in an `.m4a` container; Android may
 * negotiate a lower bitrate. §12 prefers reliable, good-quality audio over
 * minimising storage. The final encoding parameters still need a device test.
 */

function prepareFailureReason(error: unknown): RecordingFailureReason {
  return error instanceof TimeoutError ? "prepare-timed-out" : "prepare-failed";
}

function startFailureReason(error: unknown): RecordingFailureReason {
  const message = error instanceof Error ? error.message : String(error);
  // AudioRecorder.kt checks the foreground-service binder in record(), after
  // prepareToRecordAsync() has succeeded.
  return message.includes("service connection is not bound")
    ? "service-unavailable"
    : "start-failed";
}

/** How long to wait for `prepareToRecordAsync` before giving up (expo/expo#50706). */
const PREPARE_TIMEOUT_MS = 10_000;

/** Poll frequently enough that the timer does not visibly stutter. */
const STATE_POLL_MS = 250;

export type RecordingSessionStatus = "idle" | "preparing" | "recording" | "saving";

export interface RecordingSession {
  status: RecordingSessionStatus;
  /** Elapsed audio, not wall-clock time — it comes from the recorder itself. */
  elapsedMs: number;
  failure: RecordingFailure | null;
  /** The most recent recording filed in this session, for confirmation in the UI. */
  lastSaved: Recording | null;
  /** Start when idle, stop and file when recording. Ignored while busy. */
  toggle: () => void;
  dismissFailure: () => void;
}

/**
 * The session's state and transitions. Mounted **once**, by
 * `RecordingSessionProvider` — screens consume `useRecordingSession` instead,
 * because a recorder owned by a screen dies with it.
 */
export function useRecordingSessionState(): RecordingSession {
  /*
   * Indirection so the subscription can reach the real listener.
   * `useAudioRecorder` subscribes once per recorder and captures whatever
   * callback that render passed, while the real listener is declared further
   * down because it needs this component's state setters. The arrow handed to
   * the hook reads this ref, so the captured arrow never goes stale.
   */
  const statusListenerRef = useRef<(status: RecordingStatus) => void>(() => {});

  /*
   * `directory: "document"` overrides the preset's default of `cache`.
   * `AudioRecorder.kt` resolves `options.directory ?: RecordingDirectory.CACHE`,
   * so an in-progress recording would otherwise grow in a directory Android may
   * evict — which §3.2 forbids for original audio, and which matters more now
   * that a recording killed mid-capture is unplayable and the bytes are all
   * that is left of it. `document` is `context.filesDir`, the same directory
   * `Paths.document` resolves to, so a partial lands at `Paths.document/Audio/`
   * where JS can still find it.
   */
  const recorder = useAudioRecorder(
    {
      ...RecordingPresets.HIGH_QUALITY,
      directory: "document",
    },
    // Declared below; stable, so the one captured at subscribe time stays correct.
    (status) => statusListenerRef.current(status),
  );

  const [status, setStatus] = useState<RecordingSessionStatus>("idle");
  const [tickedElapsedMs, setTickedElapsedMs] = useState(0);
  const [failure, setFailure] = useState<RecordingFailure | null>(null);
  const [lastSaved, setLastSaved] = useState<Recording | null>(null);
  const [finalElapsedMs, setFinalElapsedMs] = useState(0);

  // Guards re-entrancy: `toggle` is a press handler, and preparing or saving
  // both await, so a second press must not start a parallel transition.
  const busy = useRef(false);
  const mounted = useRef(true);
  /*
   * Set when *we* ask the recorder to stop, so the status listener can tell our
   * own stop from one we never initiated. Cleared on the next start rather than
   * after `stop()` resolves: the native event is dispatched to the main queue
   * during `stopRecording()`, so clearing it on the way out of `stop()` would
   * race the event it exists to classify.
   */
  const stoppingFromJs = useRef(false);
  /** Mirrors the polled elapsed time for the status listener, which cannot close over state. */
  const tickedElapsedRef = useRef(0);
  /*
   * Startup recovery, held so `start` can wait on it. Adopting an orphan
   * *moves* the file, so it must never overlap a live recorder — and the
   * capture directory is where both live.
   */
  const recovery = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /*
   * §13's runtime half. The recorder already exists when this effect runs;
   * expo-audio updates live recorders when the mode is applied.
   * TODO(v0.0.4 review): Gate Start on this promise so a quick press cannot
   * prepare against the default foreground-only mode.
   */
  useEffect(() => {
    void applyAudioMode();
  }, []);

  /*
   * §14: adopt anything the app died holding, once, at startup. A recording
   * that stopped stays stopped — Android forbids starting a microphone
   * foreground service from the background, so this can only ever mean filing
   * what is already on disk.
   */
  useEffect(() => {
    const pending = recoverOrphanedRecordings()
      .then((recovered) => {
        recovered.forEach(indexRecording);
        return recovered;
      })
      .catch(() => []);

    recovery.current = pending;
  }, []);

  /*
   * Poll the elapsed time, but only while recording.
   *
   * `expo-audio` emits no periodic status — its `recordingTimerJob` serves
   * `forDuration` only — so a ticking timer has to be polled. `useAudioRecorderState`
   * does that, but it polls for the whole life of the component and its `interval`
   * argument is absent from the effect's dependencies, so it cannot be changed
   * afterwards. This session now lives as long as the app does, and a native call
   * four times a second while nothing is recording is not worth paying for.
   */
  useEffect(() => {
    if (status !== "recording") return;

    const interval = setInterval(() => {
      const { durationMillis } = recorder.getStatus();
      tickedElapsedRef.current = durationMillis;
      setTickedElapsedMs(durationMillis);
    }, STATE_POLL_MS);

    return () => clearInterval(interval);
  }, [status, recorder]);

  /**
   * Moves finished audio into the library and indexes it. Shared by our own
   * stop and by a stop we never initiated, so both file identically.
   */
  const fileRecording = useCallback(async (sourceUri: string, durationMs: number) => {
    setFinalElapsedMs(durationMs);
    setStatus("saving");

    try {
      const saved = await persistRecording({ sourceUri, durationMs });
      // Index straight away so the library shows it without a rescan. The
      // sidecar is already written, so this failing costs the row, not the
      // recording.
      indexRecording(saved);
      if (mounted.current) {
        setLastSaved(saved);
        setFinalElapsedMs(0);
        setStatus("idle");
      }
    } catch {
      // The audio exists but is not in the library. §32 requires saying so
      // rather than returning to idle as though nothing had been recorded.
      if (mounted.current) {
        setFailure(recordingFailure("save-failed"));
        setStatus("idle");
      }
    }
  }, []);

  /*
   * The recorder's status listener.
   *
   * Must be stable and must read through refs. `useAudioRecorder` subscribes
   * inside an effect keyed on `recorder.id`, so the callback it captures is the
   * one from the render that created the recorder — a closure over state would
   * be stale for the rest of the recorder's life.
   *
   * Its job is §14's reconciliation: the foreground-service notification's Stop
   * action reaches native `stopRecording()` directly, so JS cannot assume it
   * witnessed every stop. Without this the session would sit at "recording"
   * forever and the next press would call `stop()` on an already-reset recorder.
   */
  const onRecordingStatus = useCallback(
    (status: RecordingStatus) => {
      if (!status.isFinished) return;
      // Our own stop files the recording itself.
      if (stoppingFromJs.current) return;

      if (status.hasError || !status.url) {
        /*
         * `MediaRecorder.onError` fires without a url and without resetting, so
         * the partly written file is still in the capture directory. Adopt that
         * one file rather than scanning the directory: a scan would also move
         * anything else there, and this recorder has not released its own file
         * yet. A move that fails is left for the next launch (§3.2).
         * TODO(v0.0.4 review): Native onError does not reset isRecording. Settle
         * that recorder before accepting another Start, and only claim the file
         * reached the library after adoption succeeds.
         */
        const interruptedUri = recorder.uri;
        if (interruptedUri) {
          void adoptOrphan(new File(interruptedUri)).then((adopted) => {
            if (adopted) indexRecording(adopted);
          });
        }

        if (mounted.current) {
          setFailure(recordingFailure("recording-interrupted"));
          setStatus("idle");
        }
        return;
      }

      /*
       * The recorder's counters are reset before this event is emitted, so
       * `getStatus()` would report zero. The last polled value is the best
       * duration available and is within one poll interval of the truth.
       */
      void fileRecording(status.url, tickedElapsedRef.current);
    },
    // `recorder` rather than `recorder.uri`: the uri must be read when the
    // event arrives, not captured when this callback was built.
    [fileRecording, recorder],
  );

  const start = useCallback(async () => {
    /*
     * §14: refuse to start a second recording. `toggle` already guards a double
     * press, but this catches state drift — if a stop event were ever missed,
     * `status` would read "idle" while the recorder was still running, and
     * preparing it again would lose the recording in progress.
     *
     * Checked before anything is cleared, so a drifted press neither flashes
     * "preparing" nor wipes a failure message the user has not read yet.
     */
    if (recorder.getStatus().isRecording) {
      if (mounted.current) setStatus("recording");
      return;
    }

    setFailure(null);
    setFinalElapsedMs(0);
    setTickedElapsedMs(0);
    tickedElapsedRef.current = 0;
    stoppingFromJs.current = false;
    setStatus("preparing");

    // Recovery moves files out of the capture directory, which is where this
    // recording is about to be created. Let it finish first.
    if (recovery.current) await recovery.current;

    const permissionFailure = await ensureRecordingPermissions();
    if (permissionFailure) {
      if (mounted.current) {
        setFailure(permissionFailure);
        setStatus("idle");
      }
      return;
    }

    // A service-binding failure happens in record(), leaving the recorder
    // prepared. Reuse it on retry; preparing again would throw AlreadyPrepared.
    if (!recorder.getStatus().canRecord) {
      try {
        await withTimeout(
          recorder.prepareToRecordAsync(),
          PREPARE_TIMEOUT_MS,
          "Preparing the recorder",
        );
      } catch (error) {
        if (mounted.current) {
          setFailure(recordingFailure(prepareFailureReason(error)));
          setStatus("idle");
        }
        return;
      }
    }

    try {
      recorder.record();
    } catch (error) {
      if (mounted.current) {
        setFailure(recordingFailure(startFailureReason(error)));
        setStatus("idle");
      }
      return;
    }

    if (mounted.current) setStatus("recording");
  }, [recorder]);

  const stop = useCallback(async () => {
    // Freeze the duration before stopping: the recorder's own counter is reset
    // by `stop()`, and this value is what gets persisted.
    const durationMs = recorder.getStatus().durationMillis;
    // `uri` is assigned at prepare time; read it now in case stopping clears it.
    const uriBeforeStop = recorder.uri;

    stoppingFromJs.current = true;
    setFinalElapsedMs(durationMs);
    setStatus("saving");

    let sourceUri: string | null;
    try {
      await recorder.stop();
      sourceUri = recorder.uri ?? uriBeforeStop;
    } catch {
      if (mounted.current) {
        setFailure(recordingFailure("finalise-failed"));
        setStatus("idle");
      }
      return;
    }

    if (!sourceUri) {
      if (mounted.current) {
        setFailure(recordingFailure("finalise-failed"));
        setStatus("idle");
      }
      return;
    }

    await fileRecording(sourceUri, durationMs);
  }, [recorder, fileRecording]);

  const toggle = useCallback(() => {
    if (busy.current) return;
    busy.current = true;

    const transition = status === "recording" ? stop() : start();
    void transition.finally(() => {
      busy.current = false;
    });
  }, [status, start, stop]);

  useEffect(() => {
    statusListenerRef.current = onRecordingStatus;
  }, [onRecordingStatus]);

  const dismissFailure = useCallback(() => setFailure(null), []);

  // While saving, the recorder's counter has already been reset, so the frozen
  // value is shown instead of letting the timer snap back to zero mid-save.
  const elapsedMs = status === "recording" ? tickedElapsedMs : finalElapsedMs;

  return { status, elapsedMs, failure, lastSaved, toggle, dismissFailure };
}
