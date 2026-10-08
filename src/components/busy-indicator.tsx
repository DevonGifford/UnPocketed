import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";

/**
 * Shows that work is running when nothing can say how far along it is.
 *
 * Deliberately **not** a progress bar. A transcription's duration is unknown
 * and unknowable from here: AssemblyAI reports queued or processing and never
 * a percentage, and Deepgram holds one request open for however long it takes.
 * A bar that advanced would be inventing a number, which §3.7 rules out by
 * name — a spinner says "still working", which is the only honest claim.
 *
 * It keeps running while the screen is backgrounded, which costs nothing: the
 * animation is driven on the UI thread by Reanimated, so it never touches JS.
 */
export function BusyIndicator({ label }: { label: string }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    // Stopped explicitly on unmount: an infinite repeat is not cancelled by the
    // shared value going out of scope, and a transcription screen is left often.
    return () => cancelAnimation(spin);
  }, [spin]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View className="flex-row items-center gap-3" accessibilityRole="progressbar">
      <Animated.View style={style}>
        {/*
          Three-quarters of a ring: a full circle gives the eye nothing to
          track, so the gap is what makes the rotation legible.
        */}
        <View className="h-4 w-4 rounded-full border-2 border-border border-t-primary" />
      </Animated.View>
      <Text variant="subhead" accessibilityLiveRegion="polite">
        {label}
      </Text>
    </View>
  );
}
