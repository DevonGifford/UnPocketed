import { setAudioModeAsync, type AudioMode } from "expo-audio";

/*
 * The app's audio mode, in one place.
 *
 * `setAudioModeAsync` takes a `Partial<AudioMode>` but **does not merge**.
 * `AudioModule.kt` assigns every field from the incoming record, and the Kotlin
 * record defaults a missing `allowsBackgroundRecording` to `false` — which it
 * then writes to `useForegroundService` on every live recorder. So a partial
 * call from anywhere disables background recording (§13), and nothing says so:
 * a foreground-only test still passes. Verified against expo-audio@57.0.5's
 * `AudioModule.kt` (the `setAudioModeAsync` AsyncFunction) and `AudioRecords.kt`
 * (the `AudioMode` record defaults).
 *
 * Every change therefore goes through `updateAudioMode`, which merges in JS and
 * sends the complete set, so one caller cannot clear another's field.
 */

const current: Partial<AudioMode> = {
  // Voice recordings are speech, so they take the stage rather than ducking
  // under another app's music.
  interruptionMode: "doNotMix",
  playsInSilentMode: true,
  /*
   * §13: recording must continue when the app backgrounds and when the screen
   * locks. `enableBackgroundRecording` in `app.json` is only the manifest half.
   * This is the runtime half, it defaults to **false**, and while it is false
   * `AudioModule` pauses every active recorder the moment the activity
   * backgrounds — so §13 is broken without this line and a foreground-only
   * test still passes.
   */
  allowsBackgroundRecording: true,
};

/**
 * Merges `patch` into the app's audio mode and applies the whole mode.
 *
 * @param patch Only the fields this caller cares about. Fields set by other
 * callers are preserved, which a direct `setAudioModeAsync` call would clear.
 */
export async function updateAudioMode(patch: Partial<AudioMode>): Promise<void> {
  Object.assign(current, patch);
  await setAudioModeAsync(current);
}

/**
 * Applies the app's audio mode. Called once at startup, before any recorder
 * exists: `AudioRecorder`'s constructor reads `allowsBackgroundRecording` to
 * decide whether to use a foreground service, so setting it first means the
 * first recorder is built correctly rather than corrected afterwards.
 */
export async function applyAudioMode(): Promise<void> {
  await setAudioModeAsync(current);
}
