import { latestSchemaVersion, migrationVersions } from "./migrations";

/*
 * The runner applies any migration whose version exceeds the database's
 * `user_version`, so a version added out of order, duplicated, or skipped would
 * be silently never applied on an existing install while working perfectly on a
 * fresh one. That asymmetry is worth a test even though the migrations
 * themselves need a device.
 */
describe("migration versions", () => {
  it("starts at 1, since a fresh database reports user_version 0", () => {
    expect(migrationVersions[0]).toBe(1);
  });

  it("increases by exactly one each time, so none can be skipped", () => {
    const steps = migrationVersions.slice(1).map((v, i) => v - migrationVersions[i]);

    expect(steps.every((step) => step === 1)).toBe(true);
  });

  it("reports the last version as the latest", () => {
    expect(latestSchemaVersion).toBe(migrationVersions[migrationVersions.length - 1]);
  });
});
