import { ScrollView, View } from "react-native";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { SettingRow } from "@/components/setting-row";

/** Settings (§19). Provider, model and key are the only MVP configuration. */
export function SettingsScreen() {
  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10">
        <View className="px-4 pb-2 pt-4">
          <Text variant="caption" className="tracking-widest">
            TRANSCRIPTION
          </Text>
        </View>

        <View className="border-t border-border">
          <SettingRow label="Provider" value="Not configured" />
          <SettingRow label="Model" value="—" />
          <SettingRow label="API key" value="Not set" />
        </View>

        <View className="gap-2 px-4 pt-3">
          <Text variant="caption">Credentials are stored on this device.</Text>
          <Text variant="caption">
            Transcribing sends that recording to the provider you choose. Their
            pricing and privacy terms apply. Unpocketed does not pay for or proxy
            provider usage.
          </Text>
        </View>

        <View className="px-4 pb-2 pt-8">
          <Text variant="caption" className="tracking-widest">
            ABOUT
          </Text>
        </View>
        <View className="border-t border-border">
          <SettingRow label="Version" value="0.1.0" />
          <SettingRow label="Licence" value="MIT" />
        </View>
      </ScrollView>
    </Screen>
  );
}
