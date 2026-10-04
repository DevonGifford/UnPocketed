import { View } from "react-native";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";

/**
 * A destination that exists in the interface before the feature behind it.
 *
 * The target design is being built ahead of v0.1's functionality, so several
 * routes are real navigation targets with nothing behind them yet. Saying so
 * plainly is better than a dead control: §32's principle is that the interface
 * explains itself rather than failing silently.
 */
export function ComingSoonScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Screen>
      <AppHeader />
      <View className="flex-1 justify-center px-4">
        <HudFrame className="gap-2 px-5 py-6">
          <Text variant="title" className="text-primary">
            {title}
          </Text>
          <Text variant="body">{description}</Text>
          <Text variant="caption" className="mt-2">
            Not built yet — the screen exists so the shape of the app is settled
            before the feature lands.
          </Text>
        </HudFrame>
      </View>
    </Screen>
  );
}
