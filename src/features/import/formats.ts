/*
 * Which files Import accepts, and what they are (§17).
 *
 * Two separate jobs, and the second is not redundant. The picker is asked for
 * audio and video types, but `ACTION_OPEN_DOCUMENT` passes that as a *hint*:
 * given more than one type, expo-document-picker sets the intent to the
 * wildcard and puts the real list in `EXTRA_MIME_TYPES`, which a document
 * provider is free to ignore. So anything can come back, and the format is
 * decided here rather than trusted from the picker.
 */

/**
 * Extension to MIME type, and the whole of what Import accepts.
 *
 * §17 names M4A, MP3, WAV, MP4 and WebM; the rest are here because Unpocketed
 * can produce them, so a recording exported from the app re-imports. Every
 * entry is a container Android's ExoPlayer decodes — the list is a promise that
 * the file will play, not a list of things worth trying.
 */
const SUPPORTED: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  aac: "audio/aac",
  "3gp": "audio/3gpp",
  ogg: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
};

/**
 * MIME type to extension, for a file whose name carries no extension.
 *
 * Several spellings reach the same container: Android's content resolver
 * reports whatever the source provider declared, and `audio/x-m4a` and
 * `audio/mp4` are the same file.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/vnd.wave": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/aac": "aac",
  "audio/aacp": "aac",
  "audio/3gpp": "3gp",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/opus": "opus",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

/** What the picker is asked for. Narrows the chooser; does not constrain it. */
export const PICKER_MIME_TYPES = ["audio/*", "video/*"];

/** How an accepted file will be stored. */
export interface ImportFormat {
  /** Lower-case, no leading dot. Becomes the stored file's extension. */
  extension: string;
  mimeType: string;
}

/** Use `\w` and `\.`: a character class containing a colon breaks Uniwind's scan. */
function extensionOfName(name: string): string | null {
  const match = /\.(\w+)$/.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Whether a picked file is one Import accepts, and what to store it as.
 *
 * The extension in the file's own name wins: it is what the user sees, and the
 * MIME type a document provider reports is frequently vaguer than the file
 * (`application/octet-stream` for a perfectly ordinary MP3). The MIME type is
 * the fallback for a name with no extension at all, which SAF does produce.
 *
 * @returns The format to store the file as, or null when it is not accepted —
 * in which case nothing should be copied into managed storage.
 */
export function classifyImport(picked: {
  name?: string | null;
  mimeType?: string | null;
}): ImportFormat | null {
  // TODO(PR6 review): A name or declared MIME type is only a format hint.
  // Validate the copied file's media before promising that it can play.
  const named = picked.name ? extensionOfName(picked.name) : null;
  if (named && SUPPORTED[named]) {
    return { extension: named, mimeType: SUPPORTED[named] };
  }

  const declared = picked.mimeType?.trim().toLowerCase();
  // Strip any `;codecs=…` parameter before matching.
  const base = declared?.split(";")[0].trim();
  const fromMime = base ? EXTENSION_BY_MIME[base] : undefined;
  if (fromMime) {
    // The declared type is kept over the table's: it is more specific, and it
    // is what the provider said the bytes are.
    return { extension: fromMime, mimeType: base ?? SUPPORTED[fromMime] };
  }

  return null;
}
