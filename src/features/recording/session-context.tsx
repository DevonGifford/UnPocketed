import { createContext, useContext, type ReactNode } from "react";

import {
  useRecordingSessionState,
  type RecordingSession,
} from "./use-recording-session";

/*
 * The recording session lives above the navigator, not inside the Record screen.
 *
 * `useAudioRecorder` returns a shared object that `useReleasingSharedObject`
 * releases on unmount, and `AudioRecorder.sharedObjectDidRelease()` calls
 * `reset()`, which calls `MediaRecorder.release()` **without** `stop()`. The
 * container's index is then never written, so the recording is left unplayable
 * — the same damage as a process kill. While the recorder belonged to the
 * Record screen, an ordinary Back press mid-recording therefore destroyed the
 * recording in progress. §14 lists "UI remounts" for exactly this reason.
 *
 * Owning the session here also gives the recorder's status listener a home that
 * outlives navigation, and makes "one recording at a time" a property of the
 * tree rather than a rule to enforce.
 */

const RecordingSessionContext = createContext<RecordingSession | null>(null);

export function RecordingSessionProvider({ children }: { children: ReactNode }) {
  const session = useRecordingSessionState();

  return (
    <RecordingSessionContext.Provider value={session}>
      {children}
    </RecordingSessionContext.Provider>
  );
}

/**
 * The app's single recording session (§11).
 *
 * @throws If called outside {@link RecordingSessionProvider}. That is a wiring
 * mistake rather than a runtime condition: a screen-local fallback session
 * would record into a recorder that dies with the screen.
 */
export function useRecordingSession(): RecordingSession {
  const session = useContext(RecordingSessionContext);

  if (!session) {
    throw new Error(
      "useRecordingSession must be called inside RecordingSessionProvider",
    );
  }

  return session;
}
