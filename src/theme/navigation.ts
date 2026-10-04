/**
 * Navigator chrome needs real colour values — React Navigation options cannot
 * take utility class names. These MIRROR the tokens in `src/global.css`, which
 * remains the single source of truth; keep the two in step when a token moves.
 *
 * Names match the token names deliberately, so a rename in `global.css` that is
 * not reflected here is visible rather than silent.
 */
export const navColors = {
  light: { background: "#FAFAFA", foreground: "#18181B", border: "#E4E4E7" },
  dark: { background: "#0B0B0C", foreground: "#FAFAFA", border: "#27272A" },
} as const;
