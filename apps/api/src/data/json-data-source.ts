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
} from "../models/tournament";

type JsonDataSourceOptions = {
  players: PlayerProfile[];
  tournaments: Tournament[];
  tournamentTeams: TournamentTeam[];
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
    const team = tournamentTeams.find(
      (candidate) =>
        candidate.id === teamId && candidate.tournamentId === tournamentId,
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
      return tournamentTeams
        .filter((team) => team.tournamentId === tournamentId)
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
