import type { InStatement } from "@libsql/client";

import { players } from "../json-data/players";
import {
  tournamentRosterEntries,
  tournaments,
  tournamentTeams,
} from "../json-data/tournaments";
import { databaseUrl, db } from "./client";
import { migrate } from "./migrate";

const CORE_SEED_NAME = "development-v1";
const CREATED_AT = "2026-09-09T00:00:00.000Z";

async function seed() {
  const url = new URL(databaseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Development seed requires a local Turso server (localhost).");
  }

  await migrate();

  const { rows } = await db.execute("SELECT name FROM seed_history");
  const appliedSeedNames = new Set(
    rows.flatMap((row) => typeof row.name === "string" ? [row.name] : []),
  );
  const shouldSeedCore = !appliedSeedNames.has(CORE_SEED_NAME);

  if (!shouldSeedCore) {
    console.log("Development data already seeded; existing data was preserved.");
    return;
  }

  const positions = new Map(
    players.flatMap((player) => player.position ? [[player.position.id, player.position] as const] : []),
  );
  const coreStatements: InStatement[] = [
    ...Array.from(positions.values(), (position) => ({
      sql: "INSERT INTO positions (id, name) VALUES (?, ?)",
      args: [position.id, position.name],
    })),
    ...players.map((player) => ({
      sql: `INSERT INTO players
        (id, owner_user_id, display_name, icon_url, position_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [player.id, `dev-owner-${player.id}`, player.displayName, player.iconUrl,
        player.position?.id ?? null, CREATED_AT, CREATED_AT],
    })),
    ...players.flatMap((player) => player.weaponIds.map((weaponId, index) => ({
      sql: "INSERT INTO player_weapons (player_id, weapon_id, display_order) VALUES (?, ?, ?)",
      args: [player.id, weaponId, index + 1],
    }))),
    ...tournaments.map((tournament) => ({
      sql: `INSERT INTO tournaments
        (id, organizer_user_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [tournament.id, tournament.organizerUserId, tournament.name,
        tournament.status, tournament.createdAt, tournament.updatedAt],
    })),
    ...tournamentTeams.map((team) => ({
      sql: `INSERT INTO tournament_teams
        (id, tournament_id, name, display_order, roster_locked_at) VALUES (?, ?, ?, ?, ?)`,
      args: [team.id, team.tournamentId, team.name, team.displayOrder, team.rosterLockedAt],
    })),
    ...tournamentRosterEntries.map((entry) => ({
      sql: `INSERT INTO tournament_roster_entries
        (id, tournament_team_id, registered_name, display_order, player_id)
        VALUES (?, ?, ?, ?, ?)`,
      args: [entry.id, entry.tournamentTeamId, entry.registeredName, entry.displayOrder,
        entry.playerId],
    })),
    {
      sql: "INSERT INTO seed_history (name) VALUES (?)",
      args: [CORE_SEED_NAME],
    },
  ];
  await db.batch(coreStatements, "write");
  console.log("Seeded development core data.");
}

try {
  await seed();
} finally {
  db.close();
}
