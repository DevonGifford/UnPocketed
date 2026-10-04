import { View } from "react-native";

/** Decorative corner brackets from the target designs; content owns its layout. */
export function HudFrame({
  children,
  className = "",
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** `accent` draws the brackets in the primary colour, for a hero surface. */
  tone?: "default" | "accent";
}) {
  const colour = tone === "accent" ? "border-primary" : "border-border";
  const size = "h-4 w-4";

  return (
    <View className={`relative ${className}`}>
      <View className={`absolute left-0 top-0 ${size} border-l border-t ${colour}`} />
      <View className={`absolute right-0 top-0 ${size} border-r border-t ${colour}`} />
      <View className={`absolute bottom-0 left-0 ${size} border-b border-l ${colour}`} />
      <View className={`absolute bottom-0 right-0 ${size} border-b border-r ${colour}`} />
      {children}
    </View>
  );
}
