import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Every screen sits on the canvas token and respects the safe area. */
export function Screen({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className="flex-1 bg-canvas">
      <SafeAreaView edges={["top", "bottom"]} className={`flex-1 ${className}`}>
        {children}
      </SafeAreaView>
    </View>
  );
}
