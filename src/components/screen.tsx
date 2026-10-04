import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Every screen sits on the background token and respects the safe area.
 *
 * The SafeAreaView takes `flex: 1` as an inline style rather than the
 * `flex-1` class, and that is load-bearing rather than stylistic. Under
 * Uniwind, `flex-1` applied as a *className* to `SafeAreaView` collapses the
 * subtree: descendant `<Text>` measures zero height and siblings pile up at
 * the top of the screen. The same class on a plain `<View>` is fine, which is
 * why the outer wrapper below still uses it.
 *
 * Related upstream report: uni-stack/uniwind#617, closed as not reproducible
 * against plain Views. Isolated here on uniwind 1.12.1 / RN 0.86.3 by swapping
 * one wrapper at a time — only the SafeAreaView matters.
 */
export function Screen({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }} className={className}>
        {children}
      </SafeAreaView>
    </View>
  );
}
