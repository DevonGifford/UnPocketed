import { View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * Stands in for the transport on an Interrupted Recording (§16's exception).
 *
 * §32 requires the explanation to be true in both directions: the audio really
 * is still here, and it really will not play. It says what the user can still
 * do about it rather than leaving them with an inert play button.
 */
export function InterruptedNotice() {
  return (
    <View className="gap-2 border-y border-border px-4 py-5">
      <Text variant="headline" className="text-destructive">
        This recording was interrupted
      </Text>
      <Text variant="body">
        Unpocketed stopped unexpectedly while recording, so the audio was never
        closed off properly. Every second that was captured is still on this
        device, but it cannot be played back here.
      </Text>
      <Text variant="caption">
        Share the original audio to move it to a computer, where a repair tool
        can usually recover it. The duration above is estimated from the file.
      </Text>
    </View>
  );
}
