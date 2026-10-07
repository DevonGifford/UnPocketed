import { useCallback, useEffect, useRef, useState } from "react";

import type { Recording } from "@/types";

import type { ImportFailure } from "./errors";
import { importAudioFile } from "./import-audio";

/*
 * Import's screen state (§17).
 *
 * Screen-local, unlike the recording session. That session had to live above
 * the navigator because `useAudioRecorder` releases its shared object on
 * unmount and a released recorder leaves an unplayable file. Nothing here owns
 * a shared object past a single call: the probe's player is created and
 * released inside `probeDurationMs`, and the chooser is Android's. Leaving the
 * screen mid-import therefore costs the confirmation message, never the import
 * — the file still reaches the library and the next focus shows it.
 */

export type ImportStatus = "idle" | "importing";

export interface ImportSession {
  status: ImportStatus;
  failure: ImportFailure | null;
  /** The most recent file imported in this session, for confirmation in the UI. */
  lastImported: Recording | null;
  /** Opens the chooser. Ignored while an import is already running. */
  start: () => void;
  dismissFailure: () => void;
}

export function useImport(): ImportSession {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [lastImported, setLastImported] = useState<Recording | null>(null);

  // `start` is a press handler and the whole flow awaits, so a second press
  // must not open a second chooser — expo-document-picker rejects that anyway,
  // with an error the user has no way to act on.
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(() => {
    if (busy.current) return;
    busy.current = true;

    setFailure(null);
    setStatus("importing");

    void importAudioFile()
      .then((outcome) => {
        if (!mounted.current) return;

        if (outcome.status === "imported") {
          setLastImported(outcome.recording);
        } else if (outcome.status === "failed") {
          setFailure(outcome.failure);
        }
        // A cancelled chooser says nothing: the user changed their mind, and
        // §32's error messages are for things that went wrong.
      })
      .finally(() => {
        busy.current = false;
        if (mounted.current) setStatus("idle");
      });
  }, []);

  const dismissFailure = useCallback(() => setFailure(null), []);

  return { status, failure, lastImported, start, dismissFailure };
}
