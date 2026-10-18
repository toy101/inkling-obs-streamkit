import { Database, type SQLQueryBindings } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { createApp } from "../src/create-app";
import { createDataSource, type CatalogDataSource } from "../src/create-data-source";
import { createD1AdminDataSource } from "../src/db/admin-queries";
import type { Row, Statement } from "../src/db/client";
import { createD1StorageDataSource, type QueryDatabase } from "../src/db/queries";
import type { AdminTeam, AdminTeamInput } from "../src/models/admin";
import type { PlayerInput, PlayerProfile } from "../src/models/player";
import type { Tournament } from "../src/models/tournament";

const token = "admin-test-token";
const adminOrigin = "http://localhost:5174";
const weapons = [{ id: "weapon-1", name: "Weapon One" }];

function catalog(): CatalogDataSource {
  return {
    listWeapons: () => weapons,
    listRules: () => [],
    listStages: () => [],
    findRule: () => null,
    findStage: () => null,
    requireWeapon(weaponId, source) {
      const weapon = weapons.find((candidate) => candidate.id === weaponId);
      if (!weapon) throw new Error(`Unknown weapon ${weaponId} from ${source}`);
      return weapon;
    },
  };
}

function createSqliteDatabase(): QueryDatabase & {
  sqlite: Database;
  failBatchAt: number | null;
  failBatchError: Error | null;
  failReadsAfterBatch: boolean;
  batchCompleted: boolean;
} {
  const sqlite = new Database(":memory:", { strict: true });
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE positions (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
    CREATE TABLE players (
      id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL, display_name TEXT NOT NULL,
      icon_url TEXT, position_id TEXT REFERENCES positions(id), created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE player_weapons (
      player_id TEXT NOT NULL REFERENCES players(id), weapon_id TEXT NOT NULL,
      display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
      PRIMARY KEY (player_id, weapon_id), UNIQUE (player_id, display_order)
    );
    CREATE TABLE tournaments (
      id TEXT PRIMARY KEY NOT NULL, organizer_user_id TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'registration', 'locked', 'archived')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE tournament_teams (
      id TEXT PRIMARY KEY NOT NULL, tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      name TEXT NOT NULL, display_order INTEGER NOT NULL CHECK (display_order >= 1),
      roster_locked_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'hidden')),
      UNIQUE (tournament_id, display_order)
    );
    CREATE TABLE tournament_roster_entries (
      id TEXT PRIMARY KEY NOT NULL, tournament_team_id TEXT NOT NULL REFERENCES tournament_teams(id),
      registered_name TEXT NOT NULL, display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
      player_id TEXT REFERENCES players(id), UNIQUE (tournament_team_id, display_order)
    );
    CREATE TABLE tournament_roster_weapons (
      roster_entry_id TEXT NOT NULL REFERENCES tournament_roster_entries(id), weapon_id TEXT NOT NULL,
      display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
      PRIMARY KEY (roster_entry_id, weapon_id), UNIQUE (roster_entry_id, display_order)
    );
    INSERT INTO positions (id, name) VALUES ('position-1', 'Position One');
  `);

  const result = {
    sqlite,
    failBatchAt: null as number | null,
    failBatchError: null as Error | null,
    failReadsAfterBatch: false,
    batchCompleted: false,
    async execute(statement: string | Statement): Promise<{ rows: Row[] }> {
      if (result.failReadsAfterBatch && result.batchCompleted) {
        throw new Error("Injected post-write read failure");
      }
      const { sql, args = [] } = typeof statement === "string"
        ? { sql: statement, args: [] }
        : statement;
      return {
        rows: sqlite.query(sql).all(...args as SQLQueryBindings[]) as Row[],
      };
    },
    async batch(statements: readonly (string | Statement)[]): Promise<void> {
      sqlite.exec("BEGIN");
      try {
        for (const [index, statement] of statements.entries()) {
          if (result.failBatchAt === index) {
            throw result.failBatchError ?? new Error("Injected batch failure");
          }
          const { sql, args = [] } = typeof statement === "string"
            ? { sql: statement, args: [] }
            : statement;
          sqlite.query(sql).run(...args as SQLQueryBindings[]);
        }
        sqlite.exec("COMMIT");
        result.batchCompleted = true;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return result;
}

function makeApp(database: QueryDatabase, configured = true, nullAdminSource = false) {
  const catalogDataSource = catalog();
  const publicDataSource = createDataSource({
    storageDataSource: createD1StorageDataSource(database, catalogDataSource),
    catalogDataSource,
    enrichMatchup: async (matchup) => matchup,
  });
  return createApp({
    dataSource: publicDataSource,
    webOrigins: ["http://localhost:5173"],
    admin: configured ? {
      dataSource: nullAdminSource ? null : createD1AdminDataSource(database, catalogDataSource),
      token,
      origins: [adminOrigin],
      environment: "local",
    } : undefined,
  });
}

function request(
  app: ReturnType<typeof makeApp>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("origin", adminOrigin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://api.test${path}`, { ...init, headers }));
}

function playerInput(name: string): PlayerInput {
  return {
    displayName: name,
    iconUrl: null,
    positionId: "position-1",
    weaponIds: ["weapon-1"],
  };
}

let database: ReturnType<typeof createSqliteDatabase>;

beforeEach(() => {
  database = createSqliteDatabase();
});

afterEach(() => {
  database.sqlite.close();
});

describe("admin API", () => {
  test("is hidden when unconfigured and authenticates token and Origin", async () => {
    const disabled = await request(makeApp(database, false), "/admin/status");
    expect(disabled.status).toBe(404);
    const jsonMode = await request(makeApp(database, true, true), "/admin/status");
    expect(jsonMode.status).toBe(404);

    const app = makeApp(database);
    const unauthorized = await app.handle(new Request("http://api.test/admin/status"));
    expect(unauthorized.status).toBe(401);
    const forbidden = await app.handle(new Request("http://api.test/admin/status", {
      headers: { authorization: `Bearer ${token}`, origin: "http://evil.test" },
    }));
    expect(forbidden.status).toBe(403);

    const response = await request(app, "/admin/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ environment: "local" });
  });

  test("creates and updates a player visible through the public API", async () => {
    const app = makeApp(database);
    const createdResponse = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput("First name")),
    });
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json() as PlayerProfile;

    const updatedResponse = await request(app, `/admin/players/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...playerInput("Updated name"), weaponIds: [] }),
    });
    expect(updatedResponse.status).toBe(200);
    expect((await updatedResponse.json() as PlayerProfile).displayName).toBe("Updated name");

    const publicResponse = await app.handle(new Request(`http://api.test/players/${created.id}`));
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.json()).toMatchObject({
      id: created.id,
      displayName: "Updated name",
      weaponIds: [],
    });
  });

  test("limits player display, roster and team names to 20 characters on create and update", async () => {
    const app = makeApp(database);
    const playerName = "あ".repeat(20);
    const updatedPlayerName = "い".repeat(20);
    const tooLongName = "う".repeat(21);

    const createdPlayerResponse = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput(playerName)),
    });
    expect(createdPlayerResponse.status).toBe(200);
    const player = await createdPlayerResponse.json() as PlayerProfile;

    const updatedPlayerResponse = await request(app, `/admin/players/${player.id}`, {
      method: "PUT",
      body: JSON.stringify(playerInput(updatedPlayerName)),
    });
    expect(updatedPlayerResponse.status).toBe(200);

    const rejectedPlayerCreate = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput(tooLongName)),
    });
    expect(rejectedPlayerCreate.status).toBe(422);
    const rejectedPlayerUpdate = await request(app, `/admin/players/${player.id}`, {
      method: "PUT",
      body: JSON.stringify(playerInput(tooLongName)),
    });
    expect(rejectedPlayerUpdate.status).toBe(422);

    const tournamentResponse = await request(app, "/admin/tournaments", {
      method: "POST",
      body: JSON.stringify({ name: "大会".repeat(11), status: "draft" }),
    });
    expect(tournamentResponse.status).toBe(200);
    const tournament = await tournamentResponse.json() as Tournament;
    const teamPath = `/admin/tournaments/${tournament.id}/teams`;
    const teamInput: AdminTeamInput = {
      name: "T".repeat(20),
      displayOrder: 1,
      status: "draft",
      roster: [{ id: null, registeredName: playerName, playerId: player.id }],
    };
    const createdTeamResponse = await request(app, teamPath, {
      method: "POST",
      body: JSON.stringify(teamInput),
    });
    expect(createdTeamResponse.status).toBe(200);
    const team = await createdTeamResponse.json() as AdminTeam;
    const rosterId = team.roster[0]?.id;
    expect(rosterId).toBeString();

    const updatedTeamResponse = await request(app, `${teamPath}/${team.id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...teamInput,
        name: "U".repeat(20),
        roster: [{ id: rosterId, registeredName: updatedPlayerName, playerId: player.id }],
      }),
    });
    expect(updatedTeamResponse.status).toBe(200);

    const rejectedTeamNameCreate = await request(app, teamPath, {
      method: "POST",
      body: JSON.stringify({ ...teamInput, name: "T".repeat(21), displayOrder: 2 }),
    });
    expect(rejectedTeamNameCreate.status).toBe(422);
    const rejectedTeamNameUpdate = await request(app, `${teamPath}/${team.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...teamInput, name: "U".repeat(21) }),
    });
    expect(rejectedTeamNameUpdate.status).toBe(422);

    const rejectedTeamCreate = await request(app, teamPath, {
      method: "POST",
      body: JSON.stringify({
        ...teamInput,
        displayOrder: 2,
        roster: [{ id: null, registeredName: tooLongName, playerId: player.id }],
      }),
    });
    expect(rejectedTeamCreate.status).toBe(422);
    const rejectedTeamUpdate = await request(app, `${teamPath}/${team.id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...teamInput,
        roster: [{ id: rosterId, registeredName: tooLongName, playerId: player.id }],
      }),
    });
    expect(rejectedTeamUpdate.status).toBe(422);

    const legacyTeamName = "既".repeat(21);
    database.sqlite.query(`INSERT INTO tournament_teams
      (id, tournament_id, name, display_order, status) VALUES (?, ?, ?, ?, ?)`)
      .run("legacy-team", tournament.id, legacyTeamName, 99, "draft");
    const legacyTeamResponse = await request(app, teamPath);
    expect(legacyTeamResponse.status).toBe(200);
    expect(await legacyTeamResponse.json()).toContainEqual(
      expect.objectContaining({ id: "legacy-team", name: legacyTeamName }),
    );
  });

  test("rejects invalid player references and hides a rolled-back runtime failure", async () => {
    const app = makeApp(database);
    const invalidPosition = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify({ ...playerInput("Invalid"), positionId: "missing" }),
    });
    expect(invalidPosition.status).toBe(422);

    const invalidWeapon = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify({ ...playerInput("Invalid"), weaponIds: ["missing"] }),
    });
    expect(invalidWeapon.status).toBe(422);

    database.failBatchAt = 1;
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    const failed = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput("Rollback")),
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ message: "Admin operation failed." });
    expect(errorLog).toHaveBeenCalledWith(
      "Admin operation failed.",
      expect.objectContaining({ message: "Injected batch failure" }),
    );
    errorLog.mockRestore();
    const rows = database.sqlite.query("SELECT id FROM players").all();
    expect(rows).toEqual([]);

    database.failBatchAt = 0;
    database.failBatchError = new Error("UNIQUE constraint failed: players.id");
    const constraint = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput("Constraint")),
    });
    expect(constraint.status).toBe(409);
    expect(await constraint.json()).toEqual({
      message: "The database rejected the update.",
    });
  });

  test("returns committed player, tournament and team writes without a fallible follow-up read", async () => {
    const app = makeApp(database);
    database.failReadsAfterBatch = true;
    async function write(path: string, method: "POST" | "PUT", body: unknown) {
      database.batchCompleted = false;
      const response = await request(app, path, { method, body: JSON.stringify(body) });
      expect(response.status).toBe(200);
      expect(database.batchCompleted).toBe(true);
      return response;
    }

    const player = await (await write("/admin/players", "POST", playerInput("Created player"))).json() as PlayerProfile;
    expect(player.position).toEqual({ id: "position-1", name: "Position One" });
    const updatedPlayer = await (await write(`/admin/players/${player.id}`, "PUT", {
      ...playerInput("Updated player"), weaponIds: [],
    })).json() as PlayerProfile;
    expect(updatedPlayer).toEqual({ ...player, displayName: "Updated player", weaponIds: [] });
    expect(database.sqlite.query("SELECT id, display_name FROM players").all()).toEqual([
      { id: player.id, display_name: "Updated player" },
    ]);

    const createdTournament = await (await write("/admin/tournaments", "POST", {
      name: "Created tournament", status: "draft",
    })).json() as Tournament;
    const updatedTournament = await (await write(`/admin/tournaments/${createdTournament.id}`, "PUT", {
      name: "Updated tournament", status: "registration",
    })).json() as Tournament;
    expect(updatedTournament).toMatchObject({
      id: createdTournament.id, organizerUserId: createdTournament.organizerUserId,
      createdAt: createdTournament.createdAt, name: "Updated tournament", status: "registration",
    });
    expect(database.sqlite.query("SELECT name, updated_at FROM tournaments").all()).toEqual([
      { name: updatedTournament.name, updated_at: updatedTournament.updatedAt },
    ]);

    const teamPath = `/admin/tournaments/${createdTournament.id}/teams`;
    const teamInput: AdminTeamInput = {
      name: "Created team", displayOrder: 1, status: "draft",
      roster: [{ id: null, registeredName: "Created roster", playerId: player.id }],
    };
    const createdTeam = await (await write(teamPath, "POST", teamInput)).json() as AdminTeam;
    const rosterId = createdTeam.roster[0]?.id;
    expect(rosterId).toBeString();
    const updatedTeam = await (await write(`${teamPath}/${createdTeam.id}`, "PUT", {
      ...teamInput, name: "Updated team", displayOrder: 2,
      roster: [{ id: rosterId, registeredName: "Updated roster", playerId: player.id }],
    })).json() as AdminTeam;
    expect(updatedTeam).toMatchObject({
      id: createdTeam.id, tournamentId: createdTournament.id, name: "Updated team", displayOrder: 2,
      roster: [{ id: rosterId, tournamentTeamId: createdTeam.id, registeredName: "Updated roster", displayOrder: 1, playerId: player.id }],
    });
    expect(database.sqlite.query("SELECT id, name, display_order FROM tournament_teams").all()).toEqual([
      { id: createdTeam.id, name: updatedTeam.name, display_order: updatedTeam.displayOrder },
    ]);
    expect(database.sqlite.query("SELECT id, registered_name FROM tournament_roster_entries").all()).toEqual([
      { id: rosterId, registered_name: "Updated roster" },
    ]);
  });

  test("writes tournaments and teams visible through public and overlay reads", async () => {
    const app = makeApp(database);
    const players: PlayerProfile[] = [];
    for (let index = 1; index <= 4; index += 1) {
      const response = await request(app, "/admin/players", {
        method: "POST",
        body: JSON.stringify(playerInput(`Player ${index}`)),
      });
      players.push(await response.json() as PlayerProfile);
    }
    const tournamentResponse = await request(app, "/admin/tournaments", {
      method: "POST",
      body: JSON.stringify({ name: "Admin Tournament", status: "locked" }),
    });
    const tournament = await tournamentResponse.json() as Tournament;
    const roster = players.map((player) => ({
      id: null,
      registeredName: player.displayName,
      playerId: player.id,
    }));
    const firstInput: AdminTeamInput = {
      name: "Alpha",
      displayOrder: 1,
      status: "confirmed",
      roster,
    };
    const firstResponse = await request(app, `/admin/tournaments/${tournament.id}/teams`, {
      method: "POST",
      body: JSON.stringify(firstInput),
    });
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as AdminTeam;
    const secondResponse = await request(app, `/admin/tournaments/${tournament.id}/teams`, {
      method: "POST",
      body: JSON.stringify({ ...firstInput, name: "Bravo", displayOrder: 2 }),
    });
    const second = await secondResponse.json() as AdminTeam;

    const stolenRosterId = first.roster[0]?.id;
    const stolen = await request(
      app,
      `/admin/tournaments/${tournament.id}/teams/${second.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          ...firstInput,
          name: "Stolen",
          displayOrder: 2,
          roster: [
            { ...roster[0], id: stolenRosterId },
            ...second.roster.slice(1).map((entry) => ({
              id: entry.id,
              registeredName: entry.registeredName,
              playerId: entry.playerId,
            })),
          ],
        }),
      },
    );
    expect(stolen.status).toBe(409);

    const conflict = await request(app, `/admin/tournaments/${tournament.id}/teams`, {
      method: "POST",
      body: JSON.stringify({ ...firstInput, name: "Duplicate order" }),
    });
    expect(conflict.status).toBe(409);
    const incomplete = await request(app, `/admin/tournaments/${tournament.id}/teams`, {
      method: "POST",
      body: JSON.stringify({
        ...firstInput,
        name: "Incomplete",
        displayOrder: 3,
        roster: roster.slice(0, 3),
      }),
    });
    expect(incomplete.status).toBe(200);
    const incompleteTeam = await incomplete.json() as AdminTeam;
    expect(incompleteTeam.status).toBe("draft");

    const publicTournaments = await app.handle(new Request("http://api.test/tournaments"));
    expect(await publicTournaments.json()).toContainEqual(tournament);
    const publicTeams = await app.handle(new Request(`http://api.test/tournaments/${tournament.id}/teams`));
    expect(await publicTeams.json()).toEqual([
      expect.objectContaining({ id: first.id }),
      expect.objectContaining({ id: second.id }),
    ]);
    const overlay = await app.handle(new Request(
      `http://api.test/overlay/participants?tournamentId=${tournament.id}`
      + `&alphaTournamentTeamId=${first.id}&bravoTournamentTeamId=${second.id}`,
    ));
    expect(overlay.status).toBe(200);
    expect(await overlay.json()).toMatchObject({
      tournament: { id: tournament.id },
      alpha: { id: first.id, players: expect.any(Array) },
      bravo: { id: second.id, players: expect.any(Array) },
    });
  });

  test("normalizes team status and keeps hidden or incomplete teams out of public reads", async () => {
    const app = makeApp(database);
    const tournament = await (await request(app, "/admin/tournaments", {
      method: "POST",
      body: JSON.stringify({ name: "Status Tournament", status: "locked" }),
    })).json() as Tournament;
    const roster = Array.from({ length: 4 }, (_, index) => ({
      id: null,
      registeredName: `Member ${index + 1}`,
      playerId: null,
    }));
    const teamPath = `/admin/tournaments/${tournament.id}/teams`;
    const hidden = await (await request(app, teamPath, {
      method: "POST",
      body: JSON.stringify({
        name: "Hidden team",
        displayOrder: 1,
        status: "hidden",
        roster,
      }),
    })).json() as AdminTeam;
    const visible = await (await request(app, teamPath, {
      method: "POST",
      body: JSON.stringify({
        name: "Visible team",
        displayOrder: 2,
        status: "draft",
        roster,
      }),
    })).json() as AdminTeam;
    expect(hidden.status).toBe("hidden");
    expect(visible.status).toBe("confirmed");

    const adminTeams = await request(app, teamPath);
    expect((await adminTeams.json() as AdminTeam[]).map((team) => team.status)).toEqual([
      "hidden",
      "confirmed",
    ]);
    const publicTeams = await app.handle(new Request(`http://api.test/tournaments/${tournament.id}/teams`));
    expect(await publicTeams.json()).toEqual([
      expect.objectContaining({ id: visible.id, status: "confirmed" }),
    ]);
    const hiddenOverlay = await app.handle(new Request(
      `http://api.test/overlay/participants?tournamentId=${tournament.id}`
      + `&alphaTournamentTeamId=${hidden.id}&bravoTournamentTeamId=${visible.id}`,
    ));
    expect(await hiddenOverlay.text()).toBe("");

    const unhidden = await (await request(app, `${teamPath}/${hidden.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: hidden.name,
        displayOrder: hidden.displayOrder,
        status: "draft",
        roster: hidden.roster.map((entry) => ({
          id: entry.id,
          registeredName: entry.registeredName,
          playerId: entry.playerId,
        })),
      }),
    })).json() as AdminTeam;
    expect(unhidden.status).toBe("confirmed");

    const incomplete = await (await request(app, `${teamPath}/${hidden.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: hidden.name,
        displayOrder: hidden.displayOrder,
        status: "confirmed",
        roster: unhidden.roster.slice(0, 3).map((entry) => ({
          id: entry.id,
          registeredName: entry.registeredName,
          playerId: entry.playerId,
        })),
      }),
    })).json() as AdminTeam;
    expect(incomplete.status).toBe("draft");

    database.sqlite.query("UPDATE tournament_teams SET status = 'confirmed' WHERE id = ?").run(hidden.id);
    const inconsistentPublicTeams = await app.handle(
      new Request(`http://api.test/tournaments/${tournament.id}/teams`),
    );
    expect(await inconsistentPublicTeams.json()).toEqual([
      expect.objectContaining({ id: visible.id }),
    ]);
    const inconsistentOverlay = await app.handle(new Request(
      `http://api.test/overlay/participants?tournamentId=${tournament.id}`
      + `&alphaTournamentTeamId=${hidden.id}&bravoTournamentTeamId=${visible.id}`,
    ));
    expect(await inconsistentOverlay.text()).toBe("");
  });

  test("preserves retained roster IDs and their auxiliary weapon rows", async () => {
    const app = makeApp(database);
    const firstPlayerResponse = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput("First player")),
    });
    const firstPlayer = await firstPlayerResponse.json() as PlayerProfile;
    const secondPlayerResponse = await request(app, "/admin/players", {
      method: "POST",
      body: JSON.stringify(playerInput("Second player")),
    });
    const secondPlayer = await secondPlayerResponse.json() as PlayerProfile;
    const tournamentResponse = await request(app, "/admin/tournaments", {
      method: "POST",
      body: JSON.stringify({ name: "Tournament", status: "draft" }),
    });
    const tournament = await tournamentResponse.json() as Tournament;
    const teamResponse = await request(app, `/admin/tournaments/${tournament.id}/teams`, {
      method: "POST",
      body: JSON.stringify({
        name: "Team",
        displayOrder: 1,
        status: "draft",
        roster: [
          { id: null, registeredName: "First old", playerId: firstPlayer.id },
          { id: null, registeredName: "Second old", playerId: secondPlayer.id },
        ],
      }),
    });
    const team = await teamResponse.json() as AdminTeam;
    const firstRosterId = team.roster[0]?.id;
    const secondRosterId = team.roster[1]?.id;
    expect(firstRosterId).toBeString();
    expect(secondRosterId).toBeString();
    database.sqlite.query(
      "INSERT INTO tournament_roster_weapons (roster_entry_id, weapon_id, display_order) VALUES (?, ?, 1)",
    ).run(firstRosterId as string, "weapon-1");

    const updated = await request(app, `/admin/tournaments/${tournament.id}/teams/${team.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Renamed",
        displayOrder: 1,
        status: "draft",
        roster: [
          { id: secondRosterId, registeredName: "Second new", playerId: secondPlayer.id },
          { id: firstRosterId, registeredName: "First new", playerId: firstPlayer.id },
        ],
      }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json() as AdminTeam).roster).toEqual([
      expect.objectContaining({ id: secondRosterId, registeredName: "Second new", displayOrder: 1 }),
      expect.objectContaining({ id: firstRosterId, registeredName: "First new", displayOrder: 2 }),
    ]);
    expect(database.sqlite.query(
      "SELECT weapon_id FROM tournament_roster_weapons WHERE roster_entry_id = ?",
    ).get(firstRosterId as string)).toEqual({ weapon_id: "weapon-1" });
  });
});
