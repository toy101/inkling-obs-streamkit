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
import {
  findRule,
  findStage,
  listRules,
  listStages,
  listWeapons,
} from "./catalog-store";
import { requireEnvironmentVariable } from "./env";
import { attachWeaponImages } from "./weapon-images";

type StorageDataSource = {
  listPlayers(id: string | null): Promise<PlayerProfile[]>;
  listTournaments(): Promise<Tournament[]>;
  listTournamentTeams(tournamentId: string): Promise<TournamentTeam[]>;
  getOverlayParticipants(
    query: OverlayTeamsQuery,
  ): Promise<OverlayParticipants | null>;
};

type DataSource = StorageDataSource & {
  listWeapons(): Promise<Weapon[]>;
  listRules(): Promise<Rule[]>;
  listStages(): Promise<Stage[]>;
  getOverlayMatchup(query: OverlayQuery): Promise<OverlayMatchup | null>;
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
  async listRules() {
    return listRules();
  },
  async listStages() {
    return listStages();
  },
  async getOverlayMatchup(query) {
    const participants = await selectedDataSource.getOverlayParticipants(query);
    const rule = findRule(query.ruleId);
    const stage = findStage(query.stageId);
    if (participants === null || rule === null || stage === null) return null;

    return attachWeaponImages({ ...participants, rule, stage });
  },
};
