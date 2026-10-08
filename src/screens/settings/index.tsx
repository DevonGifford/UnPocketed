import { useCallback, useMemo, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { SettingRow } from "@/components/setting-row";
import { ApiKeyDialog } from "@/components/api-key-dialog";
import { OptionPicker } from "@/components/option-picker";
import { ToggleRow } from "@/components/toggle-row";
import {
  chooseDiarize,
  chooseModel,
  chooseProvider,
  currentSelection,
  diarizeEnabled,
  readPreferences,
  maskApiKey,
  readApiKey,
  writeApiKey,
} from "@/features/transcription";
import { describeProvider, listProviders } from "@/providers/transcription";

/**
 * Settings (§19, §20). Provider, Model and key are the only MVP configuration.
 *
 * All three are now a choice. The key is stored per Provider, so switching does
 * not ask the user to re-enter one they have already given — which is what
 * makes comparing two Providers on the same recording a couple of taps rather
 * than a chore (§22).
 *
 * Everything on this screen reads from the registry rather than naming a
 * Provider: the retention notice, the key link and the Model list all follow
 * the selection for free, and adding a Provider changes nothing here.
 */
export function SettingsScreen() {
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [picking, setPicking] = useState<"provider" | "model" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * A screen-local mirror of the stored selection, not the selection itself.
   *
   * The choice lives in a file because `transcribeRecording` has to read it too
   * and a screen is the wrong owner for it. This is re-read at the only two
   * moments it can change — on focus, and straight after this screen writes it
   * — rather than called bare during render: with the React Compiler enabled a
   * zero-argument read has nothing to invalidate on and may be hoisted, which
   * would leave Settings showing the old Provider after a switch.
   */
  const [selection, setSelection] = useState(() => currentSelection());
  const [diarize, setDiarize] = useState(() => diarizeEnabled(readPreferences()));

  const providers = useMemo(() => listProviders(), []);
  const provider = useMemo(
    () => (selection ? describeProvider(selection.providerId) : null),
    [selection],
  );

  const refresh = useCallback(() => {
    const next = currentSelection();
    setSelection(next);
    setDiarize(diarizeEnabled(readPreferences()));

    // The key is read for whichever Provider is now selected, so switching
    // shows that Provider's key rather than the previous one's.
    const descriptor = next ? describeProvider(next.providerId) : null;
    if (!descriptor?.requiresApiKey) {
      setMaskedKey(null);
      return;
    }
    void readApiKey(descriptor.id).then((key) => setMaskedKey(maskApiKey(key)));
  }, []);

  useFocusEffect(refresh);

  const submitKey = (apiKey: string) => {
    setEditingKey(false);
    setError(null);
    if (!selection) return;
    void writeApiKey(selection.providerId, apiKey)
      .then(refresh)
      .catch(() =>
        setError(
          "The key could not be saved to this device's secure storage. It has not been stored.",
        ),
      );
  };

  /*
   * A choice that cannot be written down must not appear to have been made.
   * Both writes are synchronous file writes, so a failure surfaces here rather
   * than later, as a transcription billed to an account the user thought they
   * had switched away from.
   */
  const commit = (write: () => void) => {
    setPicking(null);
    try {
      write();
      setError(null);
    } catch {
      setError(
        "That choice could not be saved to this device. Settings still show what Unpocketed will actually use.",
      );
    }
    // Either way: on success to show the new choice, and on failure to show
    // that the old one is still in force.
    refresh();
  };

  const modelName =
    provider?.models.find((model) => model.id === selection?.modelId)?.name ??
    selection?.modelId ??
    "—";

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10">
        <View className="px-4 pb-2 pt-4">
          <Text variant="caption" className="tracking-widest">
            TRANSCRIPTION
          </Text>
        </View>

        <View className="border-t border-border">
          <SettingRow
            label="Provider"
            value={provider?.name ?? "Not configured"}
            onPress={provider ? () => setPicking("provider") : undefined}
          />
          <SettingRow
            label="Model"
            value={modelName}
            onPress={provider ? () => setPicking("model") : undefined}
          />
          {/*
            §10: speaker turns come from the Provider's own diarization. The
            alternative — letting something downstream infer them from flat
            text — means inventing who spoke, so if it is not asked for here it
            cannot be recovered later without paying for the audio again.
          */}
          <ToggleRow
            label="Identify speakers"
            value={diarize}
            detail={
              provider?.diarizationNotice ??
              "Separates a conversation into who said what."
            }
            onValueChange={(next) => commit(() => chooseDiarize(next))}
          />
          <SettingRow
            label="API key"
            value={
              provider && !provider.requiresApiKey
                ? "Not needed"
                : (maskedKey ?? "Not set")
            }
            onPress={
              provider?.requiresApiKey ? () => setEditingKey(true) : undefined
            }
          />
        </View>

        {error ? (
          <View className="mx-4 mt-3 rounded-md border border-border bg-card p-3">
            <Text variant="body">{error}</Text>
          </View>
        ) : null}

        {/*
          Outside the padded block below: SettingRow brings its own px-4, so
          nesting it there indents it out of line with the rows above.
        */}
        {provider?.requiresApiKey ? (
          <SettingRow
            label="Get an API key"
            value={provider.name}
            onPress={() => void Linking.openURL(provider.keyUrl)}
          />
        ) : null}

        <View className="gap-2 px-4 pt-3">
          <Text variant="caption">Credentials are stored on this device.</Text>
          <Text variant="caption">
            Transcribing sends that recording to the provider you choose. Their
            pricing and privacy terms apply. Unpocketed does not pay for or proxy
            provider usage.
          </Text>
          {/*
            §19 requires the disclosure to say what the provider *keeps*, not
            only what it is sent — "sent" and "kept" are different promises, and
            only the second matters to someone deciding whether to upload. It
            must also not imply retention can be turned off where it cannot.
            Read from the selected Provider, so switching updates the promise.
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

      <OptionPicker
        open={picking === "provider"}
        onOpenChange={(open) => setPicking(open ? "provider" : null)}
        title="Transcription provider"
        description="Each provider needs its own API key and bills you directly. Switching keeps the key and model you have already set for the other one."
        options={providers.map((candidate) => ({
          id: candidate.id,
          label: candidate.name,
        }))}
        selectedId={selection?.providerId ?? null}
        onSelect={(id) => commit(() => chooseProvider(id))}
      />

      <OptionPicker
        open={picking === "model"}
        onOpenChange={(open) => setPicking(open ? "model" : null)}
        title={provider ? `${provider.name} model` : "Model"}
        // §22: the point of a model choice is that the user can compare the
        // results themselves rather than take our word for which is better.
        description="Transcribing again with a different model adds a transcript rather than replacing the one you have, so you can compare them."
        options={(provider?.models ?? []).map((model) => ({
          id: model.id,
          label: model.name,
          detail: model.id === provider?.defaultModelId ? "Default" : undefined,
        }))}
        selectedId={selection?.modelId ?? null}
        onSelect={(id) => {
          if (!selection) return;
          commit(() => chooseModel(selection.providerId, id));
        }}
      />

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
