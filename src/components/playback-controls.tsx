import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { formatDuration } from "@/lib/format";
import { SKIP_SECONDS, type PlaybackSession } from "@/features/playback";

/**
 * The transport for one recording (§16): play, pause, seek, ±15s, position and
 * duration. State is carried by the label as well as the glyph, never by colour
 * alone (§31).
 */
export function PlaybackControls({ playback }: { playback: PlaybackSession }) {
  const { isLoaded, isPlaying, positionMs, durationMs } = playback;
  const [barWidth, setBarWidth] = useState(0);
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

  return (
    <View className="border-y border-border px-4 py-5">
      <View className="flex-row items-center justify-center gap-8">
        <Pressable
          onPress={() => playback.skip(-SKIP_SECONDS)}
          disabled={!isLoaded}
          accessibilityRole="button"
          accessibilityLabel={`Back ${SKIP_SECONDS} seconds`}
          accessibilityState={{ disabled: !isLoaded }}
          className="min-h-[44px] justify-center px-4 active:opacity-60 disabled:opacity-40"
        >
          <Text variant="body">−{SKIP_SECONDS}s</Text>
        </Pressable>

        <Pressable
          onPress={playback.toggle}
          disabled={!isLoaded}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
          accessibilityState={{ disabled: !isLoaded }}
          className="h-16 w-16 items-center justify-center rounded-full border border-border active:opacity-60 disabled:opacity-40"
        >
          <Text variant="headline">{isPlaying ? "❙❙" : "▶"}</Text>
        </Pressable>

        <Pressable
          onPress={() => playback.skip(SKIP_SECONDS)}
          disabled={!isLoaded}
          accessibilityRole="button"
          accessibilityLabel={`Forward ${SKIP_SECONDS} seconds`}
          accessibilityState={{ disabled: !isLoaded }}
          className="min-h-[44px] justify-center px-4 active:opacity-60 disabled:opacity-40"
        >
          <Text variant="body">+{SKIP_SECONDS}s</Text>
        </Pressable>
      </View>

      {/*
        Tap anywhere on the bar to seek there. A drag handle would be the richer
        control, but tap plus ±15s covers §16's seek requirement without a
        gesture handler (§3.6). The padding exists to give a 4px bar a real
        touch target.
      */}
      <Pressable
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          if (barWidth > 0 && durationMs > 0) {
            playback.seekToMs((event.nativeEvent.locationX / barWidth) * durationMs);
          }
        }}
        disabled={!isLoaded}
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{
          min: 0,
          max: Math.round(durationMs / 1000),
          now: Math.round(positionMs / 1000),
          text: `${formatDuration(positionMs)} of ${formatDuration(durationMs)}`,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          playback.skip(
            event.nativeEvent.actionName === "increment" ? SKIP_SECONDS : -SKIP_SECONDS,
          )
        }
        className="mt-4 py-3"
      >
        <View className="h-1 rounded-full bg-border">
          <View
            className="h-1 rounded-full bg-muted-foreground"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
      </Pressable>

      <View className="flex-row justify-between">
        <Text variant="caption" className="tabular-nums">
          {formatDuration(positionMs)}
        </Text>
        <Text variant="caption" className="tabular-nums">
          {formatDuration(durationMs)}
        </Text>
      </View>
    </View>
  );
}
