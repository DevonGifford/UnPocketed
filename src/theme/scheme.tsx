import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Uniwind } from "uniwind";

/**
 * Owns the explicit dark/light choice. Do not initialise it from
 * useColorScheme(): Uniwind.setTheme() changes Appearance, which Android
 * persists, so reading that value back can pin the app to its first scheme.
 * System-following and a saved preference remain future Settings work (§19).
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
