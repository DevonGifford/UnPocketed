import { useCallback, useEffect } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { updateAudioMode } from "@/lib/audio-mode";

/*
 * Playback (§16). Available for every recording whether or not it has been
 * transcribed, which §16 states outright.
 *
 * expo-audio works in seconds; the domain model and the UI work in
 * milliseconds. The conversion lives here so nothing above it has to care.
 */

/** §16 allows ±15s "if they remain simple". */
export const SKIP_SECONDS = 15;

/** Treat a position this close to the end as finished, for replay. */
const END_TOLERANCE_MS = 250;

export interface PlaybackSession {
  /** False until the player has the file open; controls should be inert. */
  isLoaded: boolean;
  isPlaying: boolean;
  positionMs: number;
  /** The player's duration once known, else the caller's stored value. */
  durationMs: number;
  /** Play, pause, or replay from the start once finished. */
  toggle: () => void;
  seekToMs: (ms: number) => void;
  /** Seek relative to the current position. Negative skips back. */
  skip: (seconds: number) => void;
}

function toMs(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/**
 * Drives playback of one recording.
 *
 * @param audioPath The recording's audio URI, or null before it is known.
 * @param knownDurationMs The duration the index holds. Used until the player
 * reports its own, and relied on permanently for a recording whose sidecar was
 * lost, since the index stores 0 for those.
 */
export function usePlayback(
  audioPath: string | null,
  knownDurationMs = 0,
): PlaybackSession {
  const player = useAudioPlayer(audioPath, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    /*
     * Request audio focus: the default is `mixWithOthers`, which on Android
     * asks for no focus at all, so music from another app would keep playing
     * over the recording. A voice recording is speech — it wants the stage.
     *
     * Goes through `updateAudioMode` rather than `setAudioModeAsync`, which
     * would clear every field this call omits — including the background
     * recording flag. See the note in `lib/audio-mode.ts`.
     */
    void updateAudioMode({ interruptionMode: "doNotMix" });
  }, []);

  const reportedDurationMs = toMs(status.duration);
  const durationMs = reportedDurationMs || knownDurationMs;
  const positionMs = toMs(status.currentTime);

  const seekToMs = useCallback(
    (ms: number) => {
      const limit = reportedDurationMs || Number.POSITIVE_INFINITY;
      const target = Math.min(Math.max(0, ms), limit);
      void player.seekTo(target / 1000);
    },
    [player, reportedDurationMs],
  );

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      return;
    }
    // A finished player sits at the end, where play() would resume nothing.
    const finished =
      reportedDurationMs > 0 &&
      positionMs >= reportedDurationMs - END_TOLERANCE_MS;
    if (finished || status.didJustFinish) void player.seekTo(0);
    player.play();
  }, [player, positionMs, reportedDurationMs, status.didJustFinish, status.playing]);

  const skip = useCallback(
    (seconds: number) => seekToMs(positionMs + seconds * 1000),
    [positionMs, seekToMs],
  );

  return {
    isLoaded: status.isLoaded,
    isPlaying: status.playing,
    positionMs,
    durationMs,
    toggle,
    seekToMs,
    skip,
  };
}
