import type { Row } from "@libsql/client";

import type { Position, Rule, Stage } from "../models/catalog";
import type {
  OverlayMatchup,
  OverlayParticipants,
  OverlayPlayer,
  OverlayQuery,
  OverlayTeam,
  OverlayTeamsQuery,
} from "../models/overlay";
import type { PlayerProfile } from "../models/player";
import type { Tournament, TournamentStatus, TournamentTeam } from "../models/tournament";
import { requireWeapon } from "../weapon-catalog";
import { db } from "./client";

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

function position(row: Row): Position | null {
  if (row.position_id === null) return null;
  return {
    id: text(row, "position_id"),
    name: text(row, "position_name"),
  };
}

function tournamentStatus(row: Row): TournamentStatus {
  const status = text(row, "status");
  switch (status) {
    case "draft": case "registration": case "locked": case "archived": return status;
    default: throw new Error("Invalid tournament status in database");
  }
}

export async function listRules(): Promise<Rule[]> {
  const { rows } = await db.execute("SELECT id, name FROM rules ORDER BY display_order");
  return rows.map((row) => ({ id: text(row, "id"), name: text(row, "name") }));
}

export async function listStages(): Promise<Stage[]> {
  const { rows } = await db.execute("SELECT id, name FROM stages ORDER BY display_order");
  return rows.map((row) => ({ id: text(row, "id"), name: text(row, "name") }));
}

export async function listPlayers(id: string | null): Promise<PlayerProfile[]> {
  const { rows } = await db.execute({
    sql: `SELECT p.id, p.display_name, p.icon_url,
        pos.id AS position_id, pos.name AS position_name, pw.weapon_id
      FROM players p
      LEFT JOIN positions pos ON pos.id = p.position_id
      LEFT JOIN player_weapons pw ON pw.player_id = p.id
      WHERE (? IS NULL OR p.id = ?)
      ORDER BY p.id, pw.display_order`,
    args: [id, id],
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
        position: position(row),
        weaponIds: [],
      };
      profiles.set(playerId, profile);
    }
    const weaponId = nullableText(row, "weapon_id");
    if (weaponId !== null) profile.weaponIds.push(weaponId);
  }
  return Array.from(profiles.values());
}

export async function listTournaments(): Promise<Tournament[]> {
  const { rows } = await db.execute("SELECT * FROM tournaments ORDER BY created_at, id");
  return rows.map((row) => ({
    id: text(row, "id"), organizerUserId: text(row, "organizer_user_id"),
    name: text(row, "name"), status: tournamentStatus(row),
    createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
  }));
}

export async function listTournamentTeams(tournamentId: string): Promise<TournamentTeam[]> {
  const { rows } = await db.execute({
    sql: "SELECT * FROM tournament_teams WHERE tournament_id = ? ORDER BY display_order, id",
    args: [tournamentId],
  });
  return rows.map((row) => ({
    id: text(row, "id"), tournamentId: text(row, "tournament_id"),
    name: text(row, "name"), displayOrder: integer(row, "display_order"),
    rosterLockedAt: nullableText(row, "roster_locked_at"),
  }));
}

function toOverlayTeam(rows: Row[], teamId: string): OverlayTeam | null {
  const teamRows = rows.filter((row) => row.team_id === teamId);
  const firstRow = teamRows[0];
  if (!firstRow) return null;

  const players = new Map<string, OverlayPlayer>();
  for (const row of teamRows) {
    const rosterEntryId = text(row, "roster_entry_id");
    let player = players.get(rosterEntryId);
    if (!player) {
      player = {
        rosterEntryId,
        registeredName: text(row, "registered_name"),
        iconUrl: nullableText(row, "icon_url"),
        position: position(row),
        weapons: [],
      };
      players.set(rosterEntryId, player);
    }
    const weaponId = nullableText(row, "weapon_id");
    if (weaponId !== null) {
      const sourcePlayerId = nullableText(row, "player_id");
      const source = sourcePlayerId === null
        ? `roster entry ${rosterEntryId}`
        : `player ${sourcePlayerId}`;
      const weapon = requireWeapon(weaponId, source);
      player.weapons.push({ ...weapon, imageUrl: null });
    }
  }

  const [first, second, third, fourth] = players.values();
  if (!first || !second || !third || !fourth || players.size !== 4) return null;
  return { id: teamId, name: text(firstRow, "team_name"), players: [first, second, third, fourth] };
}

export async function getOverlayParticipants(query: OverlayTeamsQuery): Promise<OverlayParticipants | null> {
  if (query.alphaTournamentTeamId === query.bravoTournamentTeamId) return null;

  const { rows } = await db.execute({
    sql: `SELECT t.id AS tournament_id, t.name AS tournament_name,
        team.id AS team_id, team.name AS team_name,
        r.id AS roster_entry_id, r.registered_name,
        p.id AS player_id, p.icon_url,
        pos.id AS position_id, pos.name AS position_name,
        pw.weapon_id
      FROM tournaments t
      JOIN tournament_teams team ON team.tournament_id = t.id
      JOIN tournament_roster_entries r ON r.tournament_team_id = team.id
      LEFT JOIN players p ON p.id = r.player_id
      LEFT JOIN positions pos ON pos.id = p.position_id
      LEFT JOIN player_weapons pw ON pw.player_id = p.id
      WHERE t.id = ? AND team.id IN (?, ?)
      ORDER BY team.display_order, r.display_order, pw.display_order`,
    args: [
      query.tournamentId,
      query.alphaTournamentTeamId,
      query.bravoTournamentTeamId,
    ],
  });
  const firstRow = rows[0];
  if (!firstRow) return null;
  const alpha = toOverlayTeam(rows, query.alphaTournamentTeamId);
  const bravo = toOverlayTeam(rows, query.bravoTournamentTeamId);
  if (!alpha || !bravo) return null;

  return {
    tournament: {
      id: text(firstRow, "tournament_id"),
      name: text(firstRow, "tournament_name"),
    },
    alpha,
    bravo,
  };
}

export async function getOverlayMatchup(query: OverlayQuery): Promise<OverlayMatchup | null> {
  const participants = await getOverlayParticipants(query);
  if (!participants) return null;

  const { rows } = await db.execute({
    sql: `SELECT r.id AS rule_id, r.name AS rule_name,
        s.id AS stage_id, s.name AS stage_name
      FROM rules r
      CROSS JOIN stages s
      WHERE r.id = ? AND s.id = ?`,
    args: [query.ruleId, query.stageId],
  });
  const row = rows[0];
  if (!row) return null;

  return {
    ...participants,
    rule: { id: text(row, "rule_id"), name: text(row, "rule_name") },
    stage: { id: text(row, "stage_id"), name: text(row, "stage_name") },
  };
}
