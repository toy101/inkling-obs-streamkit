import type {
  Tournament,
  TournamentRosterEntry,
  TournamentTeam,
  TournamentTeamStatus,
} from "../models/tournament";
import { normalizeTournamentTeamStatus } from "../models/tournament";
import tournamentData from "../data/tournaments.json";

type StoredTournamentTeam = Omit<TournamentTeam, "status"> & {
  status?: TournamentTeamStatus;
  rosterLockedAt?: string | null;
};

type TournamentData = {
  tournaments: Tournament[];
  tournamentTeams: StoredTournamentTeam[];
  tournamentRosterEntries: TournamentRosterEntry[];
};

// JSONのリテラル値はstring/numberへ広がるため、モデル型を読み込み境界で明示する。
const data = tournamentData as TournamentData;

export const tournaments = data.tournaments;
export const tournamentRosterEntries = data.tournamentRosterEntries;
export const tournamentTeams: TournamentTeam[] = data.tournamentTeams.map((team) => {
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
