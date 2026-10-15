import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let database: Database;

async function applyMigration(name: string): Promise<void> {
  const source = await Bun.file(
    new URL(`../src/db/migrations/${name}`, import.meta.url),
  ).text();
  for (const sql of source.split(";").map((statement) => statement.trim()).filter(Boolean)) {
    database.exec(sql);
  }
}

beforeEach(() => {
  database = new Database(":memory:", { strict: true });
  database.exec(`
    CREATE TABLE tournament_teams (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      roster_locked_at TEXT,
      UNIQUE (tournament_id, display_order)
    );
    CREATE TABLE tournament_roster_entries (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_team_id TEXT NOT NULL REFERENCES tournament_teams(id),
      registered_name TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      UNIQUE (tournament_team_id, display_order)
    );
    INSERT INTO tournament_teams
      (id, tournament_id, name, display_order, roster_locked_at)
      VALUES
      ('team-four', 'tournament-1', 'Four members', 1, '2026-01-01T00:00:00.000Z'),
      ('team-three', 'tournament-1', 'Three members', 2, NULL);
    INSERT INTO tournament_roster_entries
      (id, tournament_team_id, registered_name, display_order)
      VALUES
      ('four-1', 'team-four', 'Four 1', 1),
      ('four-2', 'team-four', 'Four 2', 2),
      ('four-3', 'team-four', 'Four 3', 3),
      ('four-4', 'team-four', 'Four 4', 4),
      ('three-1', 'team-three', 'Three 1', 1),
      ('three-2', 'team-three', 'Three 2', 2),
      ('three-3', 'team-three', 'Three 3', 3);
  `);
});

afterEach(() => {
  database.close();
});

describe("tournament team status migrations", () => {
  test("backfills status from roster size without changing existing team data", async () => {
    await applyMigration("009_add_tournament_team_status.sql");
    await applyMigration("010_backfill_tournament_team_status.sql");

    expect(database.query(`SELECT id, name, roster_locked_at, status
      FROM tournament_teams ORDER BY display_order`).all()).toEqual([
      {
        id: "team-four",
        name: "Four members",
        roster_locked_at: "2026-01-01T00:00:00.000Z",
        status: "confirmed",
      },
      {
        id: "team-three",
        name: "Three members",
        roster_locked_at: null,
        status: "draft",
      },
    ]);
    expect(database.query("SELECT COUNT(*) AS count FROM tournament_roster_entries").get()).toEqual({
      count: 7,
    });
    expect(() => database.query(
      "UPDATE tournament_teams SET status = 'invalid' WHERE id = 'team-four'",
    ).run()).toThrow();
  });
});
