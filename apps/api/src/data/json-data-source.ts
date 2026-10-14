import type {
  CatalogDataSource,
  StorageDataSource,
} from "../create-data-source";
import { TEAM_PLAYER_COUNT } from "../models/common";
import type { OverlayPlayer, OverlayTeam } from "../models/overlay";
import type { PlayerProfile } from "../models/player";
import type {
  Tournament,
  TournamentRosterEntry,
  TournamentTeam,
  TournamentTeamStatus,
} from "../models/tournament";
import { normalizeTournamentTeamStatus } from "../models/tournament";

type StoredTournamentTeam = Omit<TournamentTeam, "status"> & {
  status?: TournamentTeamStatus;
  rosterLockedAt?: string | null;
};

type JsonDataSourceOptions = {
  players: PlayerProfile[];
  tournaments: Tournament[];
  tournamentTeams: StoredTournamentTeam[];
  tournamentRosterEntries: TournamentRosterEntry[];
  weaponCatalog: Pick<CatalogDataSource, "requireWeapon">;
};

export function createJsonDataSource({
  players,
  tournaments,
  tournamentTeams,
  tournamentRosterEntries,
  weaponCatalog,
}: JsonDataSourceOptions): StorageDataSource {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const normalizedTeams: TournamentTeam[] = tournamentTeams.map((team) => {
    const rosterCount = tournamentRosterEntries.filter(
      (entry) => entry.tournamentTeamId === team.id,
    ).length;
    return {
      id: team.id,
      tournamentId: team.tournamentId,
      name: team.name,
      displayOrder: team.displayOrder,
      status: normalizeTournamentTeamStatus(team.status ?? "draft", rosterCount),
    };
  });

  function toOverlayPlayer(entry: TournamentRosterEntry): OverlayPlayer {
    const player = entry.playerId === null
      ? null
      : playersById.get(entry.playerId) ?? null;
    const resolvedWeapons = player === null
      ? []
      : player.weaponIds.map((weaponId) => ({
          ...weaponCatalog.requireWeapon(weaponId, `player ${player.id}`),
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

  function toOverlayTeam(
    tournamentId: string,
    teamId: string,
  ): OverlayTeam | null {
    const team = normalizedTeams.find(
      (candidate) =>
        candidate.id === teamId
        && candidate.tournamentId === tournamentId
        && candidate.status === "confirmed",
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

  return {
    async listPlayers(id) {
      return id === null
        ? players
        : players.filter((player) => player.id === id);
    },
    async listTournaments() {
      return tournaments;
    },
    async listTournamentTeams(tournamentId) {
      return normalizedTeams
        .filter((team) => team.tournamentId === tournamentId && team.status === "confirmed")
        .sort((left, right) => left.displayOrder - right.displayOrder);
    },
    async getOverlayParticipants(query) {
      if (query.alphaTournamentTeamId === query.bravoTournamentTeamId) {
        return null;
      }

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
    },
  };
}
