import { useState } from "react";
import { View } from "react-native";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * Entering a provider API key (§19).
 *
 * The field starts empty even when a key is stored, and the stored key is never
 * rendered. There is no reason to show a secret back to the person who typed
 * it, and a key on screen is a key in a screenshot — so the only operations are
 * replace and clear.
 */
export function ApiKeyDialog({
  open,
  onOpenChange,
  providerName,
  hasExistingKey,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  hasExistingKey: boolean;
  /** An empty string clears the stored key. */
  onSubmit: (apiKey: string) => void;
}) {
  const [value, setValue] = useState("");

  /*
   * Never carry a typed key over into the next time the dialog opens.
   *
   * Adjusted during render rather than in an effect, which is React's own
   * pattern for resetting state when a prop changes — and with the React
   * Compiler enabled, `react-hooks/set-state-in-effect` rejects the effect
   * form outright. A secret is the last thing that should survive a close.
   */
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    setValue("");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`${providerName} API key`}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasExistingKey
              ? "Entering a key replaces the one stored on this device. Leave it empty to remove it."
              : "The key is stored in this device's secure keystore and is sent only to the provider."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <View className="py-2">
          <Input
            value={value}
            onChangeText={setValue}
            placeholder="Paste your API key"
            autoCapitalize="none"
            autoCorrect={false}
            // Not `secureTextEntry`: the user is pasting a key they cannot
            // verify any other way, and hiding it invites a silent paste error
            // that surfaces much later as an unexplained authorisation failure.
            accessibilityLabel={`${providerName} API key`}
          />
        </View>

        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>Cancel</Text>
          </AlertDialogCancel>
          <AlertDialogAction onPress={() => onSubmit(value)}>
            <Text>{value.trim() ? "Save" : "Remove key"}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
