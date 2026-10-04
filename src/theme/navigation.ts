/**
 * Navigator chrome needs real colour values — React Navigation options cannot
 * take NativeWind classes. These MIRROR the tokens in `src/global.css`, which
 * remains the single source of truth; keep the two in step when a token moves.
 */
export const navColors = {
  light: { canvas: "#FAFAFA", ink: "#18181B", line: "#E4E4E7" },
  dark: { canvas: "#0B0B0C", ink: "#FAFAFA", line: "#27272A" },
} as const;
