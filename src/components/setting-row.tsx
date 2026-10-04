import { Pressable, View } from "react-native";
import { Text } from "./text";

/** A grouped settings row (§19): label on the left, current value on the right. */
export function SettingRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      className="min-h-[56px] flex-row items-center justify-between border-b border-line px-4 py-3 active:bg-surface"
    >
      <Text variant="body">{label}</Text>
      <View className="ml-4 flex-row items-center gap-2">
        <Text variant="subhead" numberOfLines={1}>
          {value}
        </Text>
        <Text variant="subhead">›</Text>
      </View>
    </Pressable>
  );
}
