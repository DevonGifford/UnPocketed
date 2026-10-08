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
  {
    version: 2,
    up: (db) => {
      // An interrupted Recording's audio survives but cannot be played, and its
      // duration is estimated rather than measured. Existing rows are complete
      // by definition: the app could not record an interrupted one before this.
      db.execSync(
        "ALTER TABLE recordings ADD COLUMN interrupted INTEGER NOT NULL DEFAULT 0",
      );
    },
  },
  {
    version: 3,
    up: (db) => {
      /*
       * Transcripts and jobs index their sidecars, exactly as `recordings`
       * indexes the recordings directory — see `features/transcription/storage.ts`
       * for why they have sidecars at all.
       *
       * Deliberately no `REFERENCES recordings(id) ON DELETE CASCADE`.
       * `reconcileLibrary` drops rows for audio it cannot currently see, and a
       * cascade would turn a transient index repair into the silent destruction
       * of paid-for transcripts. §25 removes transcripts with a recording only
       * on the user's explicit, warned request, which is a different code path.
       */
      db.execSync(`
        CREATE TABLE transcripts (
          id           TEXT PRIMARY KEY NOT NULL,
          recording_id TEXT NOT NULL,
          provider_id  TEXT NOT NULL,
          model_id     TEXT NOT NULL,
          text         TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
        CREATE INDEX transcripts_recording
          ON transcripts (recording_id, created_at DESC);

        CREATE TABLE transcription_jobs (
          recording_id TEXT PRIMARY KEY NOT NULL,
          provider_id  TEXT NOT NULL,
          model_id     TEXT NOT NULL,
          job_ref      TEXT,
          state        TEXT NOT NULL,
          error        TEXT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 4,
    up: (db) => {
      /*
       * Speaker-attributed turns, stored as a JSON array rather than a table.
       *
       * They are read and written only as a whole — nothing queries one turn,
       * filters by speaker or joins across them — so a `transcript_segments`
       * table would add a join and a second write path to answer a question
       * nobody asks. This is an index over the sidecars either way: the
       * durable copy is the transcript's own JSON file, and this column is
       * re-derived from it by `reconcileTranscripts`.
       *
       * Null for every existing row, which is correct rather than a default:
       * those transcripts were produced without diarization, and null means
       * "not asked for or not available" rather than "one speaker" (§10).
       */
      db.execSync("ALTER TABLE transcripts ADD COLUMN segments TEXT");
    },
  },
  {
    version: 5,
    up: (db) => {
      /*
       * Provenance for edited transcripts (§20).
       *
       * `source` is a JSON object rather than an enum because an LLM author
       * carries its own provider and model — §20 has to stay answerable for a
       * transcript an LLM rewrote, not just for one a human touched.
       *
       * Null on every existing row, read as "straight from the provider". That
       * is not a guess: nothing could edit a transcript before this migration.
       */
      db.execSync(`
        ALTER TABLE transcripts ADD COLUMN source TEXT;
        ALTER TABLE transcripts ADD COLUMN derived_from TEXT;
      `);
    },
  },
  {
    version: 6,
    up: (db) => {
      /*
       * Briefs index their sidecars, exactly as transcripts index theirs.
       *
       * Deliberately **no** `REFERENCES transcripts(id) ON DELETE CASCADE`, for
       * the same reason migration 3 gave: `reconcileTranscripts` drops rows for
       * files it cannot currently see, and a cascade would turn a transient
       * index repair into the silent destruction of records the user paid for.
       * §25 removes a Brief with its Transcript only on an explicit request,
       * which is a different code path.
       *
       * `speaker_names` is JSON for the same reason `segments` is: it is read
       * and written whole, nothing queries one speaker, and a table would add a
       * join to answer a question nobody asks.
       */
      db.execSync(`
        CREATE TABLE briefs (
          id            TEXT PRIMARY KEY NOT NULL,
          transcript_id TEXT NOT NULL,
          provider_id   TEXT NOT NULL,
          model_id      TEXT NOT NULL,
          title         TEXT,
          headline      TEXT,
          summary       TEXT,
          overview      TEXT,
          conclusion    TEXT,
          speaker_names TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );
        CREATE INDEX briefs_transcript
          ON briefs (transcript_id, created_at DESC);
      `);
    },
  },
];

/** The version a fully migrated database reports. */
export const latestSchemaVersion = migrations[migrations.length - 1].version;

/** Every version in declaration order. Exported so the ordering can be tested. */
export const migrationVersions = migrations.map((migration) => migration.version);

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
