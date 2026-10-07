import { useCallback, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { SettingRow } from "@/components/setting-row";
import { ApiKeyDialog } from "@/components/api-key-dialog";
import { maskApiKey, readApiKey, writeApiKey } from "@/features/transcription";
import { describeProvider, DEFAULT_PROVIDER_ID } from "@/providers/transcription";

/**
 * Settings (§19). Provider, model and key are the only MVP configuration.
 *
 * Provider and model are shown but not yet selectable: v0.1 ships one of each
 * and PR8 makes them a choice. The API key is editable now because PR7 cannot
 * transcribe without one, and §26 makes storing it anywhere but the device
 * keystore a non-option.
 */
export function SettingsScreen() {
  const provider = describeProvider();
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const refreshKey = useCallback(() => {
    void readApiKey(DEFAULT_PROVIDER_ID).then((key) =>
      setMaskedKey(maskApiKey(key)),
    );
  }, []);

  useFocusEffect(refreshKey);

  const submitKey = (apiKey: string) => {
    setEditingKey(false);
    setKeyError(null);
    void writeApiKey(DEFAULT_PROVIDER_ID, apiKey)
      .then(refreshKey)
      .catch(() =>
        setKeyError(
          "The key could not be saved to this device's secure storage. It has not been stored.",
        ),
      );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10">
        <View className="px-4 pb-2 pt-4">
          <Text variant="caption" className="tracking-widest">
            TRANSCRIPTION
          </Text>
        </View>

        <View className="border-t border-border">
          <SettingRow label="Provider" value={provider?.name ?? "Not configured"} />
          <SettingRow label="Model" value={provider?.defaultModelId ?? "—"} />
          <SettingRow
            label="API key"
            value={maskedKey ?? "Not set"}
            onPress={() => setEditingKey(true)}
          />
        </View>

        {keyError ? (
          <View className="mx-4 mt-3 rounded-md border border-border bg-card p-3">
            <Text variant="body">{keyError}</Text>
          </View>
        ) : null}

        <View className="gap-2 px-4 pt-3">
          <Text variant="caption">Credentials are stored on this device.</Text>
          {provider ? (
            <SettingRow
              label="Get an API key"
              value={provider.name}
              onPress={() => void Linking.openURL(provider.keyUrl)}
            />
          ) : null}
          <Text variant="caption">
            Transcribing sends that recording to the provider you choose. Their
            pricing and privacy terms apply. Unpocketed does not pay for or proxy
            provider usage.
          </Text>
          {/*
            §19 requires the disclosure to say what the provider *keeps*, not
            only what it is sent — "sent" and "kept" are different promises, and
            only the second matters to someone deciding whether to upload. It
            must also not imply retention can be turned off, because on the
            endpoint Unpocketed uses it cannot.
          */}
          {provider ? (
            <Text variant="caption">{provider.retentionNotice}</Text>
          ) : null}
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

      <ApiKeyDialog
        open={editingKey}
        onOpenChange={setEditingKey}
        providerName={provider?.name ?? "Provider"}
        hasExistingKey={maskedKey !== null}
        onSubmit={submitKey}
      />
    </Screen>
  );
}
