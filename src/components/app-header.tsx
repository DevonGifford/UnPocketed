import { Pressable, View } from "react-native";
import { useScheme } from "@/theme/scheme";
import { Text } from "@/components/ui/text";
import { HudFrame } from "@/components/hud-frame";

/** Draw icons with Views: emoji glyphs ignore the theme colours. */
function SchemeSwitch({ isDark, onPress }: { isDark: boolean; onPress: () => void }) {
  const segment = "h-8 w-8 items-center justify-center rounded-full";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel="Dark mode"
      accessibilityState={{ checked: isDark }}
      accessibilityHint={`Switches to ${isDark ? "light" : "dark"} mode`}
      hitSlop={8}
      className="min-h-[44px] flex-row items-center gap-1 rounded-full border border-border px-1 active:opacity-70"
    >
      <View className={`${segment} ${isDark ? "" : "bg-primary"}`}>
        <View
          className={`h-3 w-3 rounded-full border-2 ${
            isDark ? "border-muted-foreground" : "border-primary-foreground"
          }`}
        />
      </View>

      <View className={`${segment} ${isDark ? "bg-primary" : ""}`}>
        <View className="h-4 w-4 overflow-hidden">
          <View
            className={`absolute h-4 w-4 rounded-full border-2 ${
              isDark ? "border-primary-foreground" : "border-muted-foreground"
            }`}
          />
          <View
            className={`absolute -right-1 h-4 w-4 rounded-full ${
              isDark ? "bg-primary" : "bg-background"
            }`}
          />
        </View>
      </View>
    </Pressable>
  );
}

/** Header from the target designs. Account is visual scaffolding (§6). */
export function AppHeader() {
  const { scheme, toggle } = useScheme();
  const isDark = scheme === "dark";

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <HudFrame className="px-3 py-2">
        <Text variant="headline" className="tracking-[4px]">
          UNPOCKETED
        </Text>
      </HudFrame>

      <View className="flex-row items-center gap-3">
        <SchemeSwitch isDark={isDark} onPress={toggle} />
        <View
          accessibilityRole="image"
          accessibilityLabel="Account"
          className="h-10 w-10 items-center justify-center rounded-full border border-border"
        >
          <Text variant="caption" className="text-primary">
            A
          </Text>
        </View>
      </View>
    </View>
  );
}
