import { Text as RNText, type TextProps } from "react-native";

/**
 * The type ramp (§28 "strong typography"). Screens pick a semantic variant
 * rather than a font size, so the scale stays in one place.
 */
const variants = {
  title: "text-[28px] leading-tight font-semibold text-ink",
  headline: "text-[17px] font-semibold text-ink",
  body: "text-[16px] leading-6 text-ink",
  subhead: "text-[15px] text-muted",
  caption: "text-[13px] text-muted",
  timer: "text-[56px] font-light tabular-nums text-ink",
} as const;

export type TextVariant = keyof typeof variants;

export function Text({
  variant = "body",
  className = "",
  ...props
}: TextProps & { variant?: TextVariant; className?: string }) {
  return <RNText className={`${variants[variant]} ${className}`} {...props} />;
}
