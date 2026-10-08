import { Pressable, View } from "react-native";

import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";

/**
 * A settings row that turns something on or off (§19).
 *
 * The whole row is the touch target, not just the switch — a 48px control at
 * the far edge of a phone is a small target for a setting whose label is the
 * thing you actually read. The switch is not separately focusable for the same
 * reason: one row, one action, one thing announced (§31).
 */
export function ToggleRow({
  label,
  value,
  detail,
  onValueChange,
}: {
  label: string;
  value: boolean;
  /** Shown under the label — the place to say what the setting costs. */
  detail?: string;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={detail}
      className="min-h-[56px] flex-row items-center justify-between gap-4 border-b border-border px-4 py-3 active:bg-card"
    >
      <View className="flex-1 gap-1">
        <Text variant="body">{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
      {/*
        `pointerEvents="none"`: the row above already handles the press, and a
        separately tappable switch inside a tappable row produces two targets
        that do the same thing and one that is much harder to hit.
      */}
      <View pointerEvents="none">
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );
}
