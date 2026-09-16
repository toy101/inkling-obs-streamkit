import { TEAM_PLAYER_COUNT } from "../models/common";
import type {
  OverlayParticipants,
  OverlayPlayer,
  OverlayTeam,
  OverlayTeamsQuery,
} from "../models/overlay";
import type { PlayerProfile } from "../models/player";
import type { Tournament, TournamentTeam } from "../models/tournament";
import { requireWeapon } from "../catalog-store";
import { players } from "./players";
import {
  tournamentRosterEntries,
  tournaments,
  tournamentTeams,
} from "./tournaments";

const playersById = new Map(players.map((player) => [player.id, player]));

export async function listPlayers(id: string | null): Promise<PlayerProfile[]> {
  return id === null ? players : players.filter((player) => player.id === id);
}

export async function listTournaments(): Promise<Tournament[]> {
  return tournaments;
}

export async function listTournamentTeams(
  tournamentId: string,
): Promise<TournamentTeam[]> {
  return tournamentTeams
    .filter((team) => team.tournamentId === tournamentId)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

function toOverlayPlayer(
  entry: (typeof tournamentRosterEntries)[number],
): OverlayPlayer {
  const player = entry.playerId === null
    ? null
    : playersById.get(entry.playerId) ?? null;
  const resolvedWeapons = player === null
    ? []
    : player.weaponIds.map((weaponId) => ({
        ...requireWeapon(weaponId, `player ${player.id}`),
        imageUrl: null,
      }));

  return {
    rosterEntryId: entry.id,
    registeredName: entry.registeredName,
    iconUrl: player?.iconUrl ?? null,
    position: player?.position ?? null,
    weapons: resolvedWeapons,
  };
}

function toOverlayTeam(tournamentId: string, teamId: string): OverlayTeam | null {
  const team = tournamentTeams.find(
    (candidate) => candidate.id === teamId && candidate.tournamentId === tournamentId,
  );
  if (!team) return null;

  const resolvedPlayers = tournamentRosterEntries
    .filter((entry) => entry.tournamentTeamId === teamId)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map(toOverlayPlayer);
  if (resolvedPlayers.length !== TEAM_PLAYER_COUNT) return null;

  const [first, second, third, fourth] = resolvedPlayers;
  if (!first || !second || !third || !fourth) return null;

  return {
    id: team.id,
    name: team.name,
    players: [first, second, third, fourth],
  };
}

export async function getOverlayParticipants(
  query: OverlayTeamsQuery,
): Promise<OverlayParticipants | null> {
  if (query.alphaTournamentTeamId === query.bravoTournamentTeamId) return null;

  const tournament = tournaments.find(
    (candidate) => candidate.id === query.tournamentId,
  );
  if (!tournament) return null;

  const alpha = toOverlayTeam(
    query.tournamentId,
    query.alphaTournamentTeamId,
  );
  const bravo = toOverlayTeam(
    query.tournamentId,
    query.bravoTournamentTeamId,
  );
  if (!alpha || !bravo) return null;

  return {
    tournament: { id: tournament.id, name: tournament.name },
    alpha,
    bravo,
  };
}
