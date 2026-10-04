import { View } from "react-native";

/**
 * The bracketed frame used around headline surfaces in the designs: four short
 * corner rules rather than a full border, so the edge is implied instead of
 * drawn. §28 asks for restraint, and a complete box around every card would
 * read as heavier than the designs do.
 *
 * Deliberately decoration only — it renders its corners and gets out of the
 * way, so the content inside owns its own padding and background.
 */
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
