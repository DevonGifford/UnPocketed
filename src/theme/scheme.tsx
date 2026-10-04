import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Uniwind } from "uniwind";

/**
 * One source of truth for the colour scheme.
 *
 * The app defaults to dark and the switch chooses explicitly. It deliberately
 * does **not** follow the device setting, which is a known gap rather than a
 * preference: Uniwind's adaptive path did not apply the `.dark` scope from the
 * system scheme on the test device, and because `setTheme` writes through to
 * `Appearance.setColorScheme` — which Android persists across launches —
 * deriving a default from that same value pins the app to whichever scheme it
 * first started in. Dark-by-default sidesteps both, matches the target designs,
 * and keeps the control honest: what it shows is always what is rendered.
 *
 * Revisit when Uniwind's system theming is understood; a persisted preference
 * belongs in Settings (§19) alongside it.
 */
export type Scheme = "light" | "dark";

const SchemeContext = createContext<{ scheme: Scheme; toggle: () => void }>({
  scheme: "dark",
  toggle: () => {},
});

export function SchemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>("dark");

  useEffect(() => {
    Uniwind.setTheme(scheme);
  }, [scheme]);

  const value = useMemo(
    () => ({
      scheme,
      toggle: () => setScheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [scheme],
  );

  return <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>;
}

export const useScheme = () => useContext(SchemeContext);
