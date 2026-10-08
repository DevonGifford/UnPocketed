import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Uniwind } from "uniwind";

import { DEFAULT_SCHEME, readScheme, writeScheme, type Scheme } from "./preferences";

export type { Scheme };

/**
 * Owns the explicit dark/light choice, and remembers it across launches.
 *
 * The initial value comes from storage or {@link DEFAULT_SCHEME}, never from
 * `useColorScheme()` — see the note on that constant for why reading the
 * device's setting here pins the app to its first scheme instead of following
 * the system. System-following remains unbuilt rather than half-built (§19).
 */

const SchemeContext = createContext<{ scheme: Scheme; toggle: () => void }>({
  scheme: DEFAULT_SCHEME,
  toggle: () => {},
});

export function SchemeProvider({ children }: { children: React.ReactNode }) {
  // Read once, during the first render: the stored value has to be in hand
  // before anything paints, or every launch shows the other theme briefly.
  const [scheme, setScheme] = useState<Scheme>(() => readScheme() ?? DEFAULT_SCHEME);

  useEffect(() => {
    Uniwind.setTheme(scheme);
  }, [scheme]);

  const value = useMemo(
    () => ({
      scheme,
      toggle: () => {
        const next: Scheme = scheme === "dark" ? "light" : "dark";
        // Outside the state updater, which React may call more than once and
        // the compiler assumes is pure. Applied by the effect above whether or
        // not the write lands, so a storage failure costs the choice at next
        // launch rather than this tap.
        writeScheme(next);
        setScheme(next);
      },
    }),
    [scheme],
  );

  return <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>;
}

export const useScheme = () => useContext(SchemeContext);
