/**
 * Navigator chrome needs real colour values — React Navigation options cannot
 * take utility class names. These MIRROR the tokens in `src/global.css`, which
 * remains the single source of truth; keep the two in step when a token moves.
 *
 * Names match the token names deliberately, so a rename in `global.css` that is
 * not reflected here is visible rather than silent.
 */
export const navColors = {
  light: { background: "#F4F8FA", foreground: "#0D1E26", border: "#CAD9E2" },
  dark: { background: "#021018", foreground: "#C8E6EF", border: "#22465E" },
} as const;
