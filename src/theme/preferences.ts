import { File, Paths } from "expo-file-system";

/*
 * Which colour scheme the user chose (§19).
 *
 * A file beside the other preferences rather than a row in SQLite, for the
 * reason `features/transcription/preferences.ts` gives at length: the database
 * is a rebuildable index over the recordings directory, and a preference is
 * derivable from nothing on disk, so a rebuild would silently discard it.
 *
 * Read synchronously and cached, because `SchemeProvider` needs the answer on
 * first paint — an async read would render the wrong theme and then correct it,
 * which is a flash of the opposite scheme on every launch.
 */

const FILE_NAME = "appearance-settings.json";

export type Scheme = "light" | "dark";

/**
 * The scheme used until the user chooses one.
 *
 * Deliberately a constant rather than the device's setting. `Uniwind.setTheme`
 * writes through to `Appearance.setColorScheme`, which Android persists across
 * launches, so after the first launch `useColorScheme()` returns *this app's*
 * last value rather than the system's. Seeding from it would therefore pin the
 * app to whichever scheme it happened to start in, and would look correct in
 * testing because the first launch reads the real value. Following the system
 * properly needs a source Uniwind has not written to; it is not this.
 */
export const DEFAULT_SCHEME: Scheme = "dark";

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Narrows parsed JSON to a stored scheme.
 *
 * @returns The stored scheme, or null for anything else — a missing file, a
 * half-written one, or a value that is not one of the two schemes. Null means
 * "never chosen", which {@link DEFAULT_SCHEME} answers.
 */
export function parseScheme(raw: unknown): Scheme | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { scheme } = raw as Record<string, unknown>;
  return scheme === "light" || scheme === "dark" ? scheme : null;
}

let cached: Scheme | null | undefined;

/**
 * The stored scheme.
 *
 * @returns The user's choice, or null when they have never made one.
 * @throws Never. An unreadable preference is "not chosen", not an error.
 */
export function readScheme(): Scheme | null {
  if (cached !== undefined) return cached;

  let next: Scheme | null = null;
  try {
    const file = settingsFile();
    if (file.exists) next = parseScheme(JSON.parse(file.textSync()));
  } catch {
    // Unreadable means unchosen. Unlike the Provider choice, getting this
    // wrong costs a wrong colour rather than a charge to the wrong account.
  }

  cached = next;
  return next;
}

/**
 * Records the user's scheme choice.
 *
 * @throws Never. The caller has already applied the scheme in memory, so a
 * failed write costs the choice at next launch rather than the tap the user
 * just made — and there is nothing useful to say about it that would not
 * interrupt them for a colour they can set again.
 */
export function writeScheme(scheme: Scheme): void {
  try {
    settingsFile().write(JSON.stringify({ scheme }, null, 2));
    cached = scheme;
  } catch {
    // Left uncached, so a later read retries rather than trusting a value
    // that never reached disk.
  }
}
