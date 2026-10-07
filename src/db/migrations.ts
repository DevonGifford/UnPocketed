import type { SQLiteDatabase } from "expo-sqlite";

/*
 * Forward-only migrations, keyed by PRAGMA user_version.
 *
 * The schema is deliberately not assumed final: whether a Recording is one
 * file or a set of rotating segments is still an open decision, so the
 * mechanism exists before there is a second migration to run through it.
 */

type Migration = {
  /** The user_version this migration brings the database up to. */
  version: number;
  up: (db: SQLiteDatabase) => void;
};

/**
 * `audio_file_name` is stored rather than a full URI: the document directory's
 * path is not stable across installs, so an absolute path goes stale while the
 * file beside it survives. Paths are rebuilt at read time.
 */
const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.execSync(`
        CREATE TABLE recordings (
          id              TEXT PRIMARY KEY NOT NULL,
          title           TEXT NOT NULL,
          source          TEXT NOT NULL,
          audio_file_name TEXT NOT NULL,
          mime_type       TEXT NOT NULL,
          duration_ms     INTEGER NOT NULL,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
        CREATE INDEX recordings_created_at ON recordings (created_at DESC);
      `);
    },
  },
];

/** The version a fully migrated database reports. */
export const latestSchemaVersion = migrations[migrations.length - 1].version;

/**
 * Brings `db` up to {@link latestSchemaVersion}, running only the migrations it
 * has not seen. Each runs in its own transaction, so a failure part-way leaves
 * the database at the last version that completed rather than half-migrated.
 *
 * @throws If a migration fails. The caller decides whether to rebuild, which is
 * safe here because the database is an index over the recordings directory
 * rather than the source of truth.
 */
export function migrate(db: SQLiteDatabase): void {
  const current =
    db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
      ?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    db.withTransactionSync(() => {
      migration.up(db);
      // user_version takes no bind parameters, hence the interpolation; the
      // value is a literal from the table above, never user input.
      db.execSync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
