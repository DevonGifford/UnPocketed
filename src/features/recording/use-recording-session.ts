import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { withTimeout, TimeoutError } from "@/lib/with-timeout";
import type { Recording } from "@/types";

import { recordingFailure, type RecordingFailure } from "./errors";
import { ensureRecordingPermissions } from "./permissions";
import { persistRecording } from "./storage";
import { indexRecording } from "@/features/library";

/**
 * The real recording session (§11), replacing PR1's mocked one.
 *
 * `HIGH_QUALITY` is used unchanged: 128 kbps AAC in an `.m4a` container. §12
 * says to prefer reliable, good-quality audio over minimising storage, and the
 * alternative preset (`LOW_QUALITY`) emits `.3gp`/AMR-NB on Android, which no
 * candidate transcription provider accepts. The final bitrate is still open —
 * it depends on which provider ships first, since a 25 MB request cap and a
 * 2 GB one imply different answers.
 */

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

export function useRecordingSession(): RecordingSession {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, STATE_POLL_MS);

  const [status, setStatus] = useState<RecordingSessionStatus>("idle");
  const [failure, setFailure] = useState<RecordingFailure | null>(null);
  const [lastSaved, setLastSaved] = useState<Recording | null>(null);
  const [finalElapsedMs, setFinalElapsedMs] = useState(0);

  // Guards re-entrancy: `toggle` is a press handler, and preparing or saving
  // both await, so a second press must not start a parallel transition.
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    setFailure(null);
    setFinalElapsedMs(0);
    setStatus("preparing");

    const permissionFailure = await ensureRecordingPermissions();
    if (permissionFailure) {
      if (mounted.current) {
        setFailure(permissionFailure);
        setStatus("idle");
      }
      return;
    }

    try {
      await withTimeout(
        recorder.prepareToRecordAsync(),
        PREPARE_TIMEOUT_MS,
        "Preparing the recorder",
      );
    } catch (error) {
      if (mounted.current) {
        setFailure(
          recordingFailure(
            error instanceof TimeoutError ? "prepare-timed-out" : "prepare-failed",
          ),
        );
        setStatus("idle");
      }
      return;
    }

    try {
      recorder.record();
    } catch {
      if (mounted.current) {
        setFailure(recordingFailure("start-failed"));
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
  }, [recorder]);

  const toggle = useCallback(() => {
    if (busy.current) return;
    busy.current = true;

    const transition = status === "recording" ? stop() : start();
    void transition.finally(() => {
      busy.current = false;
    });
  }, [status, start, stop]);

  const dismissFailure = useCallback(() => setFailure(null), []);

  // While saving, the recorder's counter has already been reset, so the frozen
  // value is shown instead of letting the timer snap back to zero mid-save.
  const elapsedMs =
    status === "recording" ? recorderState.durationMillis : finalElapsedMs;

  return { status, elapsedMs, failure, lastSaved, toggle, dismissFailure };
}
