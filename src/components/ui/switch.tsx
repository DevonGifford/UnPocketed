import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 22;
const PADDING = 3;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE - PADDING * 2;

/**
 * An on/off control, styled for this interface rather than the platform's.
 *
 * React Native's own `Switch` renders the stock Android control, which is the
 * one element on a settings screen that would not belong in a monospaced HUD.
 * This keeps the platform's *semantics* — `accessibilityRole="switch"` and a
 * checked state, so a screen reader announces it correctly (§31) — while the
 * drawing follows `global.css` tokens like everything else.
 *
 * The 160ms is deliberate: long enough to read as a movement rather than a
 * jump, short enough that a settings toggle never feels like it is waiting.
 */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
}) {
  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, { duration: 160 }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      // Resolved here rather than through className: Reanimated drives these
      // on the UI thread, where a Tailwind class has no value to interpolate.
      ["rgba(125,145,160,0.28)", "rgb(56,189,248)"],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // A 28px track is below the 44px minimum §31 wants, so the touch target
      // is padded out around it rather than the control being drawn larger.
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            padding: PADDING,
            justifyContent: "center",
          },
          trackStyle,
        ]}
      >
        <Animated.View style={thumbStyle}>
          <View
            style={{
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: "rgb(241,245,249)",
            }}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
