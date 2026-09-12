import type { Rule, Stage, Weapon } from "./models/catalog";
import type {
  OverlayMatchup,
  OverlayParticipants,
  OverlayQuery,
  OverlayTeamsQuery,
} from "./models/overlay";
import type { PlayerProfile } from "./models/player";
import type { Tournament, TournamentTeam } from "./models/tournament";
import * as jsonDataSource from "./data/queries";
import * as tursoDataSource from "./db/queries";
import { requireEnvironmentVariable } from "./env";
import { attachWeaponImages } from "./weapon-images";
import { listWeapons } from "./weapon-catalog";

type StorageDataSource = {
  listRules(): Promise<Rule[]>;
  listStages(): Promise<Stage[]>;
  listPlayers(id: string | null): Promise<PlayerProfile[]>;
  listTournaments(): Promise<Tournament[]>;
  listTournamentTeams(tournamentId: string): Promise<TournamentTeam[]>;
  getOverlayParticipants(
    query: OverlayTeamsQuery,
  ): Promise<OverlayParticipants | null>;
  getOverlayMatchup(query: OverlayQuery): Promise<OverlayMatchup | null>;
};

type DataSource = StorageDataSource & {
  listWeapons(): Promise<Weapon[]>;
};

function selectDataSource(name: string): StorageDataSource {
  switch (name) {
    case "json":
      return jsonDataSource;
    case "turso":
      return tursoDataSource;
    default:
      throw new Error('API_DATA_SOURCE must be either "json" or "turso".');
  }
}

export const dataSourceName = requireEnvironmentVariable("API_DATA_SOURCE");
const selectedDataSource = selectDataSource(dataSourceName);

export const dataSource: DataSource = {
  ...selectedDataSource,
  async listWeapons() {
    return listWeapons();
  },
  async getOverlayMatchup(query) {
    const matchup = await selectedDataSource.getOverlayMatchup(query);
    return matchup === null ? null : attachWeaponImages(matchup);
  },
};
