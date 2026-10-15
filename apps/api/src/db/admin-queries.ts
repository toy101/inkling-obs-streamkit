import { AdminDataError, type AdminDataSource } from "../admin";
import type { Position } from "../models/catalog";
import type { DisplayOrder } from "../models/common";
import type { AdminTeam, AdminTeamInput } from "../models/admin";
import type { PlayerInput, PlayerProfile } from "../models/player";
import {
  normalizeTournamentTeamStatus,
  type Tournament,
  type TournamentStatus,
  type TournamentTeamStatus,
} from "../models/tournament";
import type { Row, Statement } from "./client";

type AdminDatabase = {
  execute(statement: string | Statement): Promise<{ rows: Row[] }>;
  batch(statements: readonly (string | Statement)[]): Promise<void>;
};

type WeaponCatalog = {
  requireWeapon(weaponId: string, source: string): { id: string; name: string };
};

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Expected text column: ${key}`);
  return value;
}

function nullableText(row: Row, key: string): string | null {
  return row[key] === null ? null : text(row, key);
}

function integer(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Expected integer column: ${key}`);
  }
  return value;
}

function tournamentStatus(row: Row): TournamentStatus {
  const status = text(row, "status");
  switch (status) {
    case "draft":
    case "registration":
    case "locked":
    case "archived":
      return status;
    default:
      throw new Error("Invalid tournament status in database.");
  }
}

function tournamentTeamStatus(row: Row): TournamentTeamStatus {
  const status = text(row, "team_status");
  switch (status) {
    case "draft":
    case "confirmed":
    case "hidden":
      return status;
    default:
      throw new Error("Invalid tournament team status in database.");
  }
}

function tournament(row: Row): Tournament {
  return {
    id: text(row, "id"),
    organizerUserId: text(row, "organizer_user_id"),
    name: text(row, "name"),
    status: tournamentStatus(row),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function duplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

async function requireRow(
  db: AdminDatabase,
  table: "players" | "tournaments",
  id: string,
): Promise<Row> {
  const { rows } = await db.execute({
    sql: `SELECT * FROM ${table} WHERE id = ?`,
    args: [id],
  });
  const row = rows[0];
  if (!row) throw new AdminDataError(404, `${table === "players" ? "Player" : "Tournament"} not found.`);
  return row;
}

async function validatePosition(db: AdminDatabase, positionId: string | null): Promise<Position | null> {
  if (positionId === null) return null;
  const { rows } = await db.execute({
    sql: "SELECT id, name FROM positions WHERE id = ?",
    args: [positionId],
  });
  const row = rows[0];
  if (!row) throw new AdminDataError(422, "Position does not exist.");
  return { id: text(row, "id"), name: text(row, "name") };
}

async function validatePlayerReferences(db: AdminDatabase, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;
  const { rows } = await db.execute({
    sql: `SELECT id FROM players WHERE id IN (${placeholders(playerIds.length)})`,
    args: playerIds,
  });
  if (rows.length !== playerIds.length) {
    throw new AdminDataError(422, "Roster references a player that does not exist.");
  }
}

function validatePlayerInput(
  input: PlayerInput,
  requireWeapon: WeaponCatalog["requireWeapon"],
): void {
  if (duplicate(input.weaponIds) !== null) {
    throw new AdminDataError(422, "Weapon IDs must be unique.");
  }
  for (const weaponId of input.weaponIds) {
    try {
      requireWeapon(weaponId, "admin player input");
    } catch {
      throw new AdminDataError(422, "Weapon does not exist.");
    }
  }
}

function validateTeamInput(input: AdminTeamInput): void {
  const rosterIds = input.roster.flatMap((entry) => entry.id === null ? [] : [entry.id]);
  if (duplicate(rosterIds) !== null) {
    throw new AdminDataError(422, "Roster entry IDs must be unique.");
  }
  const playerIds = input.roster.flatMap((entry) => entry.playerId === null ? [] : [entry.playerId]);
  if (duplicate(playerIds) !== null) {
    throw new AdminDataError(422, "A player cannot appear twice on a team.");
  }
}

async function ensureTeamOrderAvailable(
  db: AdminDatabase,
  tournamentId: string,
  displayOrder: number,
  excludedTeamId: string | null,
): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT id FROM tournament_teams
      WHERE tournament_id = ? AND display_order = ? AND (? IS NULL OR id <> ?)`,
    args: [tournamentId, displayOrder, excludedTeamId, excludedTeamId],
  });
  if (rows.length > 0) {
    throw new AdminDataError(409, "Another team already uses that display order.");
  }
}

async function runBatch(db: AdminDatabase, statements: Statement[]): Promise<void> {
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/\b(?:UNIQUE|FOREIGN KEY|CHECK|NOT NULL) constraint failed\b/i.test(message)) {
      throw new AdminDataError(409, "The database rejected the update.");
    }
    throw error;
  }
}

export function createD1AdminDataSource(
  db: AdminDatabase,
  { requireWeapon }: WeaponCatalog,
): AdminDataSource {
  async function listPlayers(): Promise<PlayerProfile[]> {
    const { rows } = await db.execute({
      sql: `SELECT p.id, p.display_name, p.icon_url,
          pos.id AS position_id, pos.name AS position_name, pw.weapon_id
        FROM players p
        LEFT JOIN positions pos ON pos.id = p.position_id
        LEFT JOIN player_weapons pw ON pw.player_id = p.id
        ORDER BY p.created_at, p.id, pw.display_order`,
    });
    const profiles = new Map<string, PlayerProfile>();
    for (const row of rows) {
      const playerId = text(row, "id");
      let profile = profiles.get(playerId);
      if (!profile) {
        profile = {
          id: playerId,
          displayName: text(row, "display_name"),
          iconUrl: nullableText(row, "icon_url"),
          position: row.position_id === null ? null : {
            id: text(row, "position_id"),
            name: text(row, "position_name"),
          },
          weaponIds: [],
        };
        profiles.set(playerId, profile);
      }
      const weaponId = nullableText(row, "weapon_id");
      if (weaponId !== null) profile.weaponIds.push(weaponId);
    }
    return Array.from(profiles.values());
  }

  async function listTournaments(): Promise<Tournament[]> {
    const { rows } = await db.execute("SELECT * FROM tournaments ORDER BY created_at, id");
    return rows.map(tournament);
  }

  async function listPositions(): Promise<Position[]> {
    const { rows } = await db.execute("SELECT id, name FROM positions ORDER BY name, id");
    return rows.map((row) => ({ id: text(row, "id"), name: text(row, "name") }));
  }

  async function listTournamentTeams(tournamentId: string): Promise<AdminTeam[]> {
    await requireRow(db, "tournaments", tournamentId);
    const { rows } = await db.execute({
      sql: `SELECT team.id, team.tournament_id, team.name, team.display_order,
          team.status AS team_status, roster.id AS roster_id, roster.registered_name,
          roster.display_order AS roster_display_order, roster.player_id
        FROM tournament_teams team
        LEFT JOIN tournament_roster_entries roster ON roster.tournament_team_id = team.id
        WHERE team.tournament_id = ?
        ORDER BY team.display_order, team.id, roster.display_order`,
      args: [tournamentId],
    });
    const teams = new Map<string, AdminTeam>();
    for (const row of rows) {
      const teamId = text(row, "id");
      let team = teams.get(teamId);
      if (!team) {
        team = {
          id: teamId,
          tournamentId: text(row, "tournament_id"),
          name: text(row, "name"),
          displayOrder: integer(row, "display_order"),
          status: tournamentTeamStatus(row),
          roster: [],
        };
        teams.set(teamId, team);
      }
      if (row.roster_id !== null) {
        team.roster.push({
          id: text(row, "roster_id"),
          tournamentTeamId: teamId,
          registeredName: text(row, "registered_name"),
          displayOrder: integer(row, "roster_display_order") as 1 | 2 | 3 | 4,
          playerId: nullableText(row, "player_id"),
        });
      }
    }
    return Array.from(teams.values());
  }

  async function createPlayer(input: PlayerInput): Promise<PlayerProfile> {
    validatePlayerInput(input, requireWeapon);
    const position = await validatePosition(db, input.positionId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await runBatch(db, [
      {
        sql: `INSERT INTO players
          (id, owner_user_id, display_name, icon_url, position_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, "local-admin", input.displayName, input.iconUrl, input.positionId, now, now],
      },
      ...input.weaponIds.map((weaponId, index) => ({
        sql: "INSERT INTO player_weapons (player_id, weapon_id, display_order) VALUES (?, ?, ?)",
        args: [id, weaponId, index + 1],
      })),
    ]);
    return { id, displayName: input.displayName, iconUrl: input.iconUrl, position, weaponIds: [...input.weaponIds] };
  }

  async function updatePlayer(id: string, input: PlayerInput): Promise<PlayerProfile> {
    await requireRow(db, "players", id);
    validatePlayerInput(input, requireWeapon);
    const position = await validatePosition(db, input.positionId);
    const now = new Date().toISOString();
    await runBatch(db, [
      {
        sql: `UPDATE players SET display_name = ?, icon_url = ?, position_id = ?, updated_at = ?
          WHERE id = ?`,
        args: [input.displayName, input.iconUrl, input.positionId, now, id],
      },
      { sql: "DELETE FROM player_weapons WHERE player_id = ?", args: [id] },
      ...input.weaponIds.map((weaponId, index) => ({
        sql: "INSERT INTO player_weapons (player_id, weapon_id, display_order) VALUES (?, ?, ?)",
        args: [id, weaponId, index + 1],
      })),
    ]);
    return { id, displayName: input.displayName, iconUrl: input.iconUrl, position, weaponIds: [...input.weaponIds] };
  }

  async function createTournament(input: { name: string; status: TournamentStatus }): Promise<Tournament> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await runBatch(db, [{
      sql: `INSERT INTO tournaments
        (id, organizer_user_id, name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, "local-admin", input.name, input.status, now, now],
    }]);
    return { id, organizerUserId: "local-admin", name: input.name, status: input.status, createdAt: now, updatedAt: now };
  }

  async function updateTournament(
    id: string,
    input: { name: string; status: TournamentStatus },
  ): Promise<Tournament> {
    const current = tournament(await requireRow(db, "tournaments", id));
    const now = new Date().toISOString();
    await runBatch(db, [{
      sql: "UPDATE tournaments SET name = ?, status = ?, updated_at = ? WHERE id = ?",
      args: [input.name, input.status, now, id],
    }]);
    return { ...current, name: input.name, status: input.status, updatedAt: now };
  }

  async function teamById(tournamentId: string, teamId: string): Promise<AdminTeam> {
    const teams = await listTournamentTeams(tournamentId);
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new AdminDataError(404, "Team not found.");
    return team;
  }

  async function createTournamentTeam(
    tournamentId: string,
    input: AdminTeamInput,
  ): Promise<AdminTeam> {
    await requireRow(db, "tournaments", tournamentId);
    validateTeamInput(input);
    if (input.roster.some((entry) => entry.id !== null)) {
      throw new AdminDataError(422, "New roster entries cannot provide an ID.");
    }
    await validatePlayerReferences(
      db,
      input.roster.flatMap((entry) => entry.playerId === null ? [] : [entry.playerId]),
    );
    await ensureTeamOrderAvailable(db, tournamentId, input.displayOrder, null);
    const teamId = crypto.randomUUID();
    const status = normalizeTournamentTeamStatus(input.status, input.roster.length);
    const roster = input.roster.map((entry, index) => ({
      ...entry,
      id: crypto.randomUUID(),
      tournamentTeamId: teamId,
      displayOrder: (index + 1) as DisplayOrder,
    }));
    await runBatch(db, [
      {
        sql: `INSERT INTO tournament_teams
          (id, tournament_id, name, display_order, status) VALUES (?, ?, ?, ?, ?)`,
        args: [teamId, tournamentId, input.name, input.displayOrder, status],
      },
      ...roster.map((entry) => ({
        sql: `INSERT INTO tournament_roster_entries
          (id, tournament_team_id, registered_name, display_order, player_id)
          VALUES (?, ?, ?, ?, ?)`,
        args: [entry.id, teamId, entry.registeredName, entry.displayOrder, entry.playerId],
      })),
    ]);
    return { id: teamId, tournamentId, name: input.name, displayOrder: input.displayOrder, status, roster };
  }

  async function updateTournamentTeam(
    tournamentId: string,
    teamId: string,
    input: AdminTeamInput,
  ): Promise<AdminTeam> {
    const current = await teamById(tournamentId, teamId);
    validateTeamInput(input);
    await validatePlayerReferences(
      db,
      input.roster.flatMap((entry) => entry.playerId === null ? [] : [entry.playerId]),
    );
    await ensureTeamOrderAvailable(db, tournamentId, input.displayOrder, teamId);

    const suppliedIds = input.roster.flatMap((entry) => entry.id === null ? [] : [entry.id]);
    if (suppliedIds.length > 0) {
      const { rows } = await db.execute({
        sql: `SELECT id, tournament_team_id FROM tournament_roster_entries
          WHERE id IN (${placeholders(suppliedIds.length)})`,
        args: suppliedIds,
      });
      for (const id of suppliedIds) {
        const row = rows.find((candidate) => candidate.id === id);
        if (!row) throw new AdminDataError(422, "Roster entry does not exist.");
        if (text(row, "tournament_team_id") !== teamId) {
          throw new AdminDataError(409, "Roster entry belongs to another team.");
        }
      }
    }

    const retainedIds = new Set(suppliedIds);
    const resolvedRoster = input.roster.map((entry, index) => ({
      ...entry,
      id: entry.id ?? crypto.randomUUID(),
      tournamentTeamId: teamId,
      displayOrder: (index + 1) as DisplayOrder,
    }));
    const currentRosterIds = current.roster.map((entry) => entry.id);
    const auxiliaryRows = retainedIds.size === 0 ? [] : (await db.execute({
      sql: `SELECT roster_entry_id, weapon_id, display_order
        FROM tournament_roster_weapons
        WHERE roster_entry_id IN (${placeholders(retainedIds.size)})
        ORDER BY roster_entry_id, display_order`,
      args: Array.from(retainedIds),
    })).rows;
    const status = normalizeTournamentTeamStatus(input.status, input.roster.length);
    const statements: Statement[] = [{
      sql: `UPDATE tournament_teams
        SET name = ?, display_order = ?, status = ? WHERE id = ? AND tournament_id = ?`,
      args: [
        input.name,
        input.displayOrder,
        status,
        teamId,
        tournamentId,
      ],
    }];
    // Reinsert the complete roster in one transaction. This avoids transient UNIQUE
    // conflicts when two retained entries swap displayOrder while preserving IDs and
    // all auxiliary weapon rows for retained entries.
    if (currentRosterIds.length > 0) {
      statements.push({
        sql: `DELETE FROM tournament_roster_weapons
          WHERE roster_entry_id IN (${placeholders(currentRosterIds.length)})`,
        args: currentRosterIds,
      });
      statements.push({
        sql: `DELETE FROM tournament_roster_entries WHERE id IN (${placeholders(currentRosterIds.length)})`,
        args: currentRosterIds,
      });
    }
    statements.push(...resolvedRoster.map((entry) => ({
      sql: `INSERT INTO tournament_roster_entries
        (id, tournament_team_id, registered_name, display_order, player_id)
        VALUES (?, ?, ?, ?, ?)`,
      args: [entry.id, teamId, entry.registeredName, entry.displayOrder, entry.playerId],
    })));
    statements.push(...auxiliaryRows.map((row) => ({
      sql: `INSERT INTO tournament_roster_weapons
        (roster_entry_id, weapon_id, display_order) VALUES (?, ?, ?)`,
      args: [
        text(row, "roster_entry_id"),
        text(row, "weapon_id"),
        integer(row, "display_order"),
      ],
    })));
    await runBatch(db, statements);
    return { ...current, name: input.name, displayOrder: input.displayOrder, status, roster: resolvedRoster };
  }

  return {
    listPlayers,
    listTournaments,
    listPositions,
    listTournamentTeams,
    createPlayer,
    updatePlayer,
    createTournament,
    updateTournament,
    createTournamentTeam,
    updateTournamentTeam,
  };
}
