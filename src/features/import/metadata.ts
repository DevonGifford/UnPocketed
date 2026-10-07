/*
 * What an imported Recording records about itself (§17).
 *
 * Separate from format classification because the questions are different:
 * `formats.ts` decides whether a file is one Unpocketed accepts, and this
 * decides what the Recording is called and when it claims to be from. Both are
 * pure, and both are driven entirely by what the picker handed over.
 */

/**
 * The oldest timestamp a picked file is believed over. Audio predating portable
 * digital recording is a provider reporting nonsense, not a real date.
 */
const PLAUSIBLE_FROM_MS = Date.UTC(1990, 0, 1);

/**
 * The title an imported Recording starts with: the file's own name, without its
 * extension. That is what makes a Pocket export recognisable in the library,
 * which §17 names as the use case.
 *
 * Not truncated. A filename is at most 255 bytes, rows clip to one line, and
 * rename exists — shortening the user's own name for them would be worse.
 *
 * @returns The title, or null when the name carries nothing usable, so the
 * caller falls back to a timestamp.
 */
export function importTitleFrom(name?: string | null): string | null {
  if (!name) return null;

  const withoutExtension = name.replace(/\.\w+$/, "");
  const collapsed = withoutExtension.replace(/\s+/g, " ").trim();

  return collapsed.length > 0 ? collapsed : null;
}

/**
 * When an imported Recording claims to be from.
 *
 * The file's own modification time, so an archive of old recordings keeps its
 * chronology instead of collapsing onto today (§15 lists newest first). The
 * precedent is `recovery.ts`, which dates an adopted capture from when it was
 * made rather than when it was noticed.
 *
 * The value is checked rather than trusted. `DocumentDetailsReader` falls back
 * through the content resolver's column, then the file's own mtime, then the
 * current time, and a provider reporting a zero or absurd column wins that race
 * — which would park the recording at the bottom of the library permanently,
 * the same failure `recoveredSidecar` guards against with its 1970 note. A
 * future date is equally wrong and would pin it to the top instead.
 *
 * @param lastModified Epoch milliseconds from the picker, if it gave any.
 * @param now Injectable for deterministic tests.
 * @returns The date to record, or null to let the caller use the import time.
 */
export function importedAtFrom(
  lastModified?: number | null,
  now = new Date(),
): Date | null {
  if (typeof lastModified !== "number" || !Number.isFinite(lastModified)) {
    return null;
  }
  if (lastModified < PLAUSIBLE_FROM_MS || lastModified > now.getTime()) {
    return null;
  }

  return new Date(lastModified);
}
