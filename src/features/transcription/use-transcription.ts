import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { Transcript, TranscriptionJob, TranscriptionState } from "@/types";

import type { TranscriptionFailure } from "./errors";
import {
  findTranscript,
  jobFor,
  listAllTranscripts,
  reconcileTranscripts,
  transcriptsFor,
} from "./repository";
import { transcriptionStateOf } from "./state";
import { transcribeRecording } from "./transcribe";

/*
 * Transcription's screen state.
 *
 * Reconcile runs once per session, like the library's: it parses one sidecar
 * per transcript, which is wasted work when the index is already correct. A
 * transcript written by this session indexes itself at save time.
 */
let reconciledThisSession = false;

function ensureReconciled(force = false): void {
  if (force || !reconciledThisSession) {
    reconcileTranscripts();
    reconciledThisSession = true;
  }
}

export interface RecordingTranscription {
  transcripts: Transcript[];
  job: TranscriptionJob | null;
  /** §21's state for this Recording, derived rather than stored. */
  state: TranscriptionState;
  /** Set while a transcription is running in *this* screen. */
  busy: boolean;
  failure: TranscriptionFailure | null;
  /** Starts, or retries, transcription. Ignored while one is running. */
  transcribe: () => void;
  dismissFailure: () => void;
  refresh: () => void;
}

/**
 * One Recording's transcripts and transcription state (§21).
 *
 * @param recordingId The Recording to describe, or null before it is known.
 */
export function useRecordingTranscription(
  recordingId: string | null,
): RecordingTranscription {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<TranscriptionFailure | null>(null);

  const mounted = useRef(true);
  /*
   * Stops polling when the screen goes away. The provider's job keeps running
   * and its reference is on disk, so the next launch re-attaches — abandoning
   * the poll costs nothing, while leaving it running would poll forever behind
   * a screen nobody is looking at.
   */
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  const refresh = useCallback(() => {
    if (!recordingId) {
      setTranscripts([]);
      setJob(null);
      return;
    }
    ensureReconciled();
    setTranscripts(transcriptsFor(recordingId));
    setJob(jobFor(recordingId));
  }, [recordingId]);

  useFocusEffect(refresh);

  const transcribe = useCallback(() => {
    if (!recordingId || busy) return;

    setFailure(null);
    setBusy(true);

    const controller = new AbortController();
    abort.current = controller;

    void transcribeRecording(recordingId, controller.signal)
      .then((outcome) => {
        if (!mounted.current) return;
        if (outcome.status === "failed") setFailure(outcome.failure);
        // `detached` means the poll stopped, not that anything went wrong —
        // the job is still live and startup will re-attach to it.
        refresh();
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
  }, [recordingId, busy, refresh]);

  const dismissFailure = useCallback(() => setFailure(null), []);

  return {
    transcripts,
    job,
    state: transcriptionStateOf(job, transcripts.length),
    busy,
    failure,
    transcribe,
    dismissFailure,
    refresh,
  };
}

/** Every Transcript across every Recording (§10), re-read on focus. */
export function useTranscripts() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);

  const refresh = useCallback((options?: { rescan?: boolean }) => {
    ensureReconciled(options?.rescan);
    setTranscripts(listAllTranscripts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { transcripts, refresh };
}

/** One Transcript by id, re-read on focus. */
export function useTranscript(id: string) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);

  const refresh = useCallback(() => {
    ensureReconciled();
    setTranscript(findTranscript(id));
  }, [id]);

  useFocusEffect(refresh);

  return { transcript, refresh };
}
