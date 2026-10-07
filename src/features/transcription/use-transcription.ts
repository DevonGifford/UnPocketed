import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { Transcript, TranscriptionJob, TranscriptionState } from "@/types";

import type { TranscriptionFailure } from "./errors";
import {
  allJobs,
  findTranscript,
  jobFor,
  listAllTranscripts,
  reconcileTranscripts,
  transcriptsFor,
} from "./repository";
import { groupTranscriptsByRecording, transcriptionStateOf } from "./state";
import { resumeJobFor, transcribeRecording } from "./transcribe";

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
   * Stops polling on unmount. A pushed screen can leave this one mounted.
   * TODO(PR7 review): Also stop on blur, and coordinate with startup polling
   * so only one caller polls a given provider job at a time.
   */
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  /*
   * The job reference this screen is currently polling.
   *
   * Unmounting stops this screen's poll; returning re-attaches to the saved job.
   * The ref prevents repeated focus events in this screen from adding a poll.
   */
  const attachedTo = useRef<string | null>(null);

  const refresh = useCallback(() => {
    if (!recordingId) {
      setTranscripts([]);
      setJob(null);
      return;
    }
    ensureReconciled();
    setTranscripts(transcriptsFor(recordingId));

    const current = jobFor(recordingId);
    setJob(current);

    if (
      current?.state === "transcribing" &&
      current.jobRef &&
      attachedTo.current !== current.jobRef
    ) {
      attachedTo.current = current.jobRef;

      const controller = new AbortController();
      abort.current = controller;

      void resumeJobFor(recordingId, controller.signal).then((outcome) => {
        if (!mounted.current) return;
        // Let a later focus try again, whether this attempt finished or was
        // aborted by navigating away mid-poll.
        attachedTo.current = null;
        if (outcome.status === "failed") setFailure(outcome.failure);
        // A detached job is still running; `reason` is set only when the user
        // should be told why Unpocketed stopped watching it.
        if (outcome.status === "detached" && outcome.reason) {
          setFailure(outcome.reason);
        }
        setTranscripts(transcriptsFor(recordingId));
        setJob(jobFor(recordingId));
      });
    }
  }, [recordingId]);

  useFocusEffect(refresh);

  const transcribe = useCallback(() => {
    if (!recordingId || busy) return;

    setFailure(null);
    setBusy(true);

    const controller = new AbortController();
    abort.current = controller;
    attachedTo.current = null;

    void transcribeRecording(recordingId, controller.signal)
      .then((outcome) => {
        if (!mounted.current) return;
        if (outcome.status === "failed") setFailure(outcome.failure);
        // `detached` means the poll stopped, not that the transcription did.
        // A reason is present only when something went wrong while watching.
        if (outcome.status === "detached" && outcome.reason) {
          setFailure(outcome.reason);
        }
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

/** One Recording's transcription summary, for a library row. */
export interface TranscriptionSummary {
  state: TranscriptionState;
  transcriptCount: number;
}

/**
 * Transcription state for every Recording at once, for the library list (§15).
 *
 * One pass over both indexes rather than a query per row: a list of a hundred
 * recordings would otherwise make two hundred calls on every focus.
 *
 * @returns A lookup keyed by recording id, and a `refresh`. Recordings with no
 * transcripts and no job are simply absent — the caller's default covers them.
 */
export function useTranscriptionSummaries() {
  const [summaries, setSummaries] = useState<Map<string, TranscriptionSummary>>(
    new Map(),
  );

  const refresh = useCallback(() => {
    ensureReconciled();

    const byRecording = groupTranscriptsByRecording(listAllTranscripts());
    const jobs = new Map(allJobs().map((job) => [job.recordingId, job]));
    const next = new Map<string, TranscriptionSummary>();

    for (const [recordingId, owned] of byRecording) {
      next.set(recordingId, {
        state: transcriptionStateOf(jobs.get(recordingId) ?? null, owned.length),
        transcriptCount: owned.length,
      });
    }

    // A job with no transcripts yet still has a state worth showing.
    for (const [recordingId, job] of jobs) {
      if (next.has(recordingId)) continue;
      next.set(recordingId, {
        state: transcriptionStateOf(job, 0),
        transcriptCount: 0,
      });
    }

    setSummaries(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { summaries, refresh };
}
