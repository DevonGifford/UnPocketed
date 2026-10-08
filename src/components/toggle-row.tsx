import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";

/**
 * A settings row that turns something on or off (§19).
 *
 * Uses a text indicator rather than a `Switch`: the surrounding rows are
 * text-and-chevron in a monospaced interface, and a stock platform switch is
 * the one control that would not belong. `accessibilityRole="switch"` carries
 * the real state to a screen reader regardless of how it is drawn (§31).
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
      <Text variant="subhead" className={value ? "text-foreground" : ""}>
        {value ? "On" : "Off"}
      </Text>
    </Pressable>
  );
}
