import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import { migrate } from "./migrations";

/*
 * One connection for the whole app, opened lazily.
 *
 * SQLite here is a rebuildable index over the recordings directory, not the
 * source of truth — the audio file and its JSON sidecar are (§3.2). That is
 * what makes dropping and re-deriving the database an acceptable recovery.
 */

const DATABASE_NAME = "unpocketed.db";

let connection: SQLiteDatabase | null = null;

/**
 * Returns the migrated database, opening it on first call.
 *
 * @throws If the database cannot be opened or migrated. Callers that can
 * degrade should fall back to reading the recordings directory directly, which
 * still lists every recording, only without indexed metadata.
 */
export function getDatabase(): SQLiteDatabase {
  if (connection) return connection;

  const db = openDatabaseSync(DATABASE_NAME, { useNewConnection: false });
  // WAL keeps a read during playback from blocking a metadata write.
  db.execSync("PRAGMA journal_mode = WAL");
  migrate(db);

  connection = db;
  return db;
}

/**
 * Closes and forgets the connection. Only the index is discarded; no audio is
 * touched. The next {@link getDatabase} re-opens and re-migrates.
 */
export function closeDatabase(): void {
  connection?.closeSync();
  connection = null;
}
