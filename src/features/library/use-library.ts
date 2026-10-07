import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { Recording } from "@/types";

import { findRecording, listLibrary, reconcileLibrary } from "./repository";

/*
 * Reconcile runs once per app session rather than on every focus: scanning the
 * directory parses one sidecar per recording, which is wasted work when the
 * index is already correct. A recording made in the app indexes itself at save
 * time, so the ordinary case needs no scan at all — the scan is for recovery,
 * when audio exists that the index has never seen.
 */
let reconciledThisSession = false;

/**
 * The library list (§15), re-read whenever the screen regains focus.
 *
 * @returns The recordings, newest first, and a `refresh` that re-reads the
 * index — pass `{ rescan: true }` to scan the directory as well.
 */
export function useLibrary() {
  const [recordings, setRecordings] = useState<Recording[]>([]);

  const refresh = useCallback((options?: { rescan?: boolean }) => {
    if (options?.rescan || !reconciledThisSession) {
      reconcileLibrary();
      reconciledThisSession = true;
    }
    setRecordings(listLibrary());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { recordings, refresh };
}

/**
 * One recording by id, re-read on focus so a rename or a backfilled duration
 * shows without remounting the screen.
 *
 * @returns The Recording, or null when no audio exists under that id.
 */
export function useRecording(id: string) {
  const [recording, setRecording] = useState<Recording | null>(null);

  const refresh = useCallback(() => {
    setRecording(findRecording(id));
  }, [id]);

  useFocusEffect(refresh);

  return { recording, refresh };
}
