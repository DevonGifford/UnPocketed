import { Pressable, View } from "react-native";
import { useScheme } from "@/theme/scheme";
import { Text } from "@/components/ui/text";
import { HudFrame } from "@/components/hud-frame";

/**
 * The colour-scheme control.
 *
 * Drawn from Views rather than ☀/☾ characters: those fall through to the
 * emoji font, which ignores colour classes entirely, so the active side could
 * never be indicated and the control read as decoration. Shapes built from
 * borders take the token colours like everything else.
 *
 * Shaped as a two-segment switch with a filled thumb on the active side, so it
 * is legible as "tap to change" rather than something to be dragged.
 */
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
      {/* Sun: a filled disc with short rays implied by the ring around it. */}
      <View className={`${segment} ${isDark ? "" : "bg-primary"}`}>
        <View
          className={`h-3 w-3 rounded-full border-2 ${
            isDark ? "border-muted-foreground" : "border-primary-foreground"
          }`}
        />
      </View>

      {/* Moon: a disc with a second disc punched out of it to leave a crescent. */}
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

/**
 * The application header (§29): wordmark, colour-scheme toggle, account.
 *
 * The toggle is real. `Uniwind.setTheme` drives React Native's
 * `Appearance.setColorScheme`, and the token layer's `.dark` block responds to
 * it. Choosing a scheme explicitly stops following the system, which is what
 * the control implies.
 *
 * The account control is scaffolding: §6 keeps accounts out of v0.1, and it is
 * present because the target design has it, not because it does anything yet.
 */
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
