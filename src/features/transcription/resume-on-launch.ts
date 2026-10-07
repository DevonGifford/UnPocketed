import { useEffect, useRef } from "react";

import { resumeOutstandingJobs } from "./transcribe";

/*
 * Re-attaching to transcriptions the app died holding (§18, §21).
 *
 * The same shape and the same place in the lifecycle as
 * `recoverOrphanedRecordings`: run once at startup, above the navigator, so it
 * does not restart with a screen.
 *
 * This is what makes §21's `Transcribing` a fact rather than a local fiction. A
 * transcription runs on the provider's servers and is already paid for; if the
 * only handle on it were a promise in a JavaScript heap, an app death would
 * lose it and the recovery would be a second upload and a second bill. The job
 * reference is on disk from the moment the provider issues it, so relaunching
 * picks the work back up where it was.
 */

/**
 * Resumes outstanding transcription jobs once per app launch.
 *
 * Mounted by `RecordingSessionProvider`'s neighbour above the navigator rather
 * than by a screen — polling must not stop because the user navigated.
 */
export function useResumeTranscriptions(): void {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const controller = new AbortController();
    // Failures are already recorded on the jobs themselves, so nothing here
    // needs to surface: the next screen that reads a job shows its state.
    void resumeOutstandingJobs(controller.signal).catch(() => []);

    return () => controller.abort();
  }, []);
}
