import { Pressable, View } from "react-native";
import { Uniwind, useUniwind } from "uniwind";
import { Text } from "@/components/ui/text";
import { HudFrame } from "@/components/hud-frame";

/**
 * The application header (§29): wordmark, colour-scheme toggle, account.
 *
 * The toggle is real rather than decorative — `Uniwind.setTheme` drives React
 * Native's `Appearance.setColorScheme`, which is what the token layer's
 * `prefers-color-scheme` block responds to. Choosing a scheme explicitly turns
 * off following the system, which matches what the control implies.
 *
 * The account control is scaffolding: §6 keeps accounts out of v0.1, and it is
 * present because the target design has it, not because it does anything yet.
 */
export function AppHeader() {
  const { theme } = useUniwind();
  const isDark = theme === "dark";

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <HudFrame className="px-3 py-2">
        <Text variant="headline" className="tracking-[4px]">
          UNPOCKETED
        </Text>
      </HudFrame>

      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => Uniwind.setTheme(isDark ? "light" : "dark")}
          accessibilityRole="switch"
          accessibilityLabel="Colour scheme"
          accessibilityState={{ checked: isDark }}
          accessibilityHint={`Switches to ${isDark ? "light" : "dark"} mode`}
          className="min-h-[44px] flex-row items-center gap-2 rounded-full border border-border px-3 active:opacity-70"
        >
          {/* Both glyphs stay visible with the active one highlighted, so the
              control reads as a two-state switch rather than a button whose
              label is the thing it will become. */}
          <Text variant="caption" className={isDark ? "text-muted-foreground" : "text-primary"}>
            ☀
          </Text>
          <Text variant="caption" className={isDark ? "text-primary" : "text-muted-foreground"}>
            ☾
          </Text>
        </Pressable>

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
