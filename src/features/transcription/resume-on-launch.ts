import { useEffect, useRef } from "react";

import { reconcileTranscripts } from "./repository";
import { resumeOutstandingJobs } from "./transcribe";

/**
 * Re-attaches to transcriptions the app died holding, once per launch (§18).
 *
 * Mounted above the navigator, like the recording session and for the same
 * reason: polling must not stop because the user navigated. This is what makes
 * §21's `Transcribing` outlive the process — see `transcribe.ts` for why the
 * job reference is on disk before any polling starts.
 */
export function useResumeTranscriptions(): void {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const controller = new AbortController();

    /*
     * Reconcile first. The job index can legitimately be empty — a fresh
     * install, or a database dropped and rebuilt — and an empty result is not
     * an error, so the repository's disk fallback never fires. Without this, a
     * rebuild would silently abandon every job on disk.
     */
    reconcileTranscripts();

    // Failures are recorded on the jobs themselves, so nothing surfaces here:
    // the next screen that reads a job shows its state.
    void resumeOutstandingJobs(controller.signal).catch(() => []);

    return () => controller.abort();
  }, []);
}
