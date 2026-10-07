import { createAudioPlayer, type AudioStatus } from "expo-audio";

/*
 * How long an imported recording is.
 *
 * It is the one field no imported file hands over. A recording Unpocketed made
 * has a duration from the recorder; an imported one has only its container, and
 * reading that means decoding. `recovery.ts` estimates from file size instead,
 * and that must not be reused here: its bitrate is calibrated from this
 * device's own AAC captures, so it would be wrong by whatever margin an
 * arbitrary MP3 or an uncompressed WAV differs by — which for WAV is an order
 * of magnitude. Better to ask a decoder, or store nothing.
 *
 * Why this polls the player's properties rather than listening for a status
 * event: expo-audio's periodic status flow is gated on `if (playing)` in
 * `BaseAudioPlayer.startUpdating()`, so a player that is loaded but never
 * played emits no full status at all. The two events it does emit —
 * `onPlaybackStateUpdated` and `onPlayerError` — each send a *partial* map
 * (`playbackState`, or `error`, and nothing else), so `isLoaded` and `duration`
 * arrive as `undefined` behind a type that promises numbers. The properties on
 * the player object are read through JSI and are always current, so they are
 * the honest source. The listener is kept for the one thing polling cannot
 * see: a decode failure.
 *
 * Nothing is played, so no audio focus is requested and a recording in progress
 * is unaffected — Import is reachable while recording.
 */

/** Long enough for ExoPlayer to open a large local file, short enough to not hang Import. */
const PROBE_TIMEOUT_MS = 8_000;

/** Fine enough that a small file's probe is not dominated by the poll interval. */
const PROBE_POLL_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads a media file's duration by opening it with a decoder.
 *
 * Doubles as a decode check: a file this cannot read is one playback will not
 * be able to read either. It is deliberately **not** a gate on importing —
 * returning 0 lets the file into the library anyway, where `backfillDuration`
 * fills the duration in if playback ever manages to report one.
 *
 * @param uri A `file://` URI. The picker's cache copy is fine; the probe only
 * reads, so the file may be moved afterwards.
 * @param timeoutMs Override for the wait, mainly for callers under test.
 * @returns Milliseconds, or 0 when the file could not be decoded in time.
 */
export async function probeDurationMs(
  uri: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<number> {
  let player: ReturnType<typeof createAudioPlayer>;

  try {
    player = createAudioPlayer(uri);
  } catch {
    return 0;
  }

  let decodeFailed = false;
  // The payload is partial on the error path, so only `error` can be trusted.
  const subscription = player.addListener(
    "playbackStatusUpdate",
    (status: AudioStatus) => {
      if (status?.error) decodeFailed = true;
    },
  );

  try {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (decodeFailed) return 0;

      if (player.isLoaded) {
        const seconds = player.duration;
        return Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : 0;
      }

      await delay(PROBE_POLL_MS);
    }

    return 0;
  } catch {
    // Reading a property off a released player throws; so does a player whose
    // native half never came up. Either way there is no duration to report.
    return 0;
  } finally {
    subscription.remove();
    /*
     * Mandatory, not tidiness: `createAudioPlayer` is the escape hatch from
     * `useAudioPlayer`'s automatic release, so an ExoPlayer instance would leak
     * per import without this.
     */
    try {
      player.release();
    } catch {
      // Already gone.
    }
  }
}
