import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { Brief, Transcript } from "@/types";

import { enrichTranscript } from "./enrich";
import type { EnrichmentFailure } from "./errors";
import { briefsFor, reconcileBriefs } from "./repository";

/*
 * Enrichment's screen state.
 *
 * Much smaller than `useRecordingTranscription`, and for the reason the
 * orchestration is smaller: there is no job to re-attach to, no claim to hold
 * against a second poller, and no way to be billed twice for work still
 * running. One request, one answer, one record.
 *
 * Reconcile runs once per session, like the library's and the transcripts': it
 * parses one sidecar per Brief, which is wasted work when the index is already
 * correct, and a Brief written by this session indexes itself at save time.
 */
let reconciledThisSession = false;

function ensureReconciled(): void {
  if (!reconciledThisSession) {
    reconcileBriefs();
    reconciledThisSession = true;
  }
}

export interface TranscriptEnrichment {
  /** Every Brief for this Transcript, newest first. Several means several models. */
  briefs: Brief[];
  /** True while a Brief is being written in this screen. */
  busy: boolean;
  failure: EnrichmentFailure | null;
  /** Asks the chosen provider for a Brief. Ignored while one is running. */
  enrich: () => void;
  dismissFailure: () => void;
  refresh: () => void;
}

/**
 * One Transcript's Briefs, and the ability to ask for another (§10, §22).
 *
 * @param transcript The Transcript to describe, or null before it is read.
 */
export function useTranscriptEnrichment(
  transcript: Transcript | null,
): TranscriptEnrichment {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<EnrichmentFailure | null>(null);

  const mounted = useRef(true);
  /*
   * Abandons the request on unmount. Unlike transcription, nothing survives
   * this: there is no job left running at the provider, so leaving the screen
   * genuinely stops the work rather than detaching from it.
   *
   * The provider may still have been billed if the answer was already on its
   * way — which is why `enrichTranscript` reports `abandoned` rather than
   * claiming nothing happened.
   */
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  const transcriptId = transcript?.id ?? null;

  const refresh = useCallback(() => {
    if (!transcriptId) {
      setBriefs([]);
      return;
    }
    ensureReconciled();
    setBriefs(briefsFor(transcriptId));
  }, [transcriptId]);

  useFocusEffect(refresh);

  const enrich = useCallback(() => {
    if (!transcript || busy) return;

    setFailure(null);
    setBusy(true);

    const controller = new AbortController();
    abort.current = controller;

    void enrichTranscript(transcript, controller.signal)
      .then((outcome) => {
        if (!mounted.current) return;
        if (outcome.status === "failed") setFailure(outcome.failure);
        // `abandoned` says the user left; there is nothing to report and
        // nothing to recover.
        refresh();
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
  }, [transcript, busy, refresh]);

  const dismissFailure = useCallback(() => setFailure(null), []);

  return { briefs, busy, failure, enrich, dismissFailure, refresh };
}
