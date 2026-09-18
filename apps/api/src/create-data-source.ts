import type { Rule, Stage, Weapon } from "./models/catalog";
import type {
  OverlayMatchup,
  OverlayParticipants,
  OverlayQuery,
  OverlayTeamsQuery,
} from "./models/overlay";
import type { PlayerProfile } from "./models/player";
import type { Tournament, TournamentTeam } from "./models/tournament";

export type StorageDataSource = {
  listPlayers(id: string | null): Promise<PlayerProfile[]>;
  listTournaments(): Promise<Tournament[]>;
  listTournamentTeams(tournamentId: string): Promise<TournamentTeam[]>;
  getOverlayParticipants(
    query: OverlayTeamsQuery,
  ): Promise<OverlayParticipants | null>;
};

export type CatalogDataSource = {
  listWeapons(): Weapon[];
  listRules(): Rule[];
  listStages(): Stage[];
  findRule(ruleId: string): Rule | null;
  findStage(stageId: string): Stage | null;
  requireWeapon(weaponId: string, source: string): Weapon;
};

export type DataSource = StorageDataSource & {
  listWeapons(): Promise<Weapon[]>;
  listRules(): Promise<Rule[]>;
  listStages(): Promise<Stage[]>;
  getOverlayMatchup(query: OverlayQuery): Promise<OverlayMatchup | null>;
};

type CreateDataSourceOptions = {
  storageDataSource: StorageDataSource;
  catalogDataSource: CatalogDataSource;
  enrichMatchup(matchup: OverlayMatchup): Promise<OverlayMatchup>;
};

export function createDataSource({
  storageDataSource,
  catalogDataSource,
  enrichMatchup,
}: CreateDataSourceOptions): DataSource {
  return {
    ...storageDataSource,
    async listWeapons() {
      return catalogDataSource.listWeapons();
    },
    async listRules() {
      return catalogDataSource.listRules();
    },
    async listStages() {
      return catalogDataSource.listStages();
    },
    async getOverlayMatchup(query) {
      const participants = await storageDataSource.getOverlayParticipants(query);
      const rule = catalogDataSource.findRule(query.ruleId);
      const stage = catalogDataSource.findStage(query.stageId);
      if (participants === null || rule === null || stage === null) return null;

      return enrichMatchup({ ...participants, rule, stage });
    },
  };
}
