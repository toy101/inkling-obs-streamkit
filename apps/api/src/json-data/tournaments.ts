import type {
  Tournament,
  TournamentRosterEntry,
  TournamentTeam,
} from "../models/tournament";
import tournamentData from "../data/tournaments.json";

type TournamentData = {
  tournaments: Tournament[];
  tournamentTeams: TournamentTeam[];
  tournamentRosterEntries: TournamentRosterEntry[];
};

// JSONのリテラル値はstring/numberへ広がるため、モデル型を読み込み境界で明示する。
const data = tournamentData as TournamentData;

export const tournaments = data.tournaments;
export const tournamentTeams = data.tournamentTeams;
export const tournamentRosterEntries = data.tournamentRosterEntries;
