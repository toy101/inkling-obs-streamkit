import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createApp } from "../src/create-app";
import {
  createDataSource,
  type CatalogDataSource,
} from "../src/create-data-source";
import { createJsonDataSource } from "../src/data/json-data-source";
import type { Rule, Stage, Weapon } from "../src/models/catalog";
import type { OverlayMatchup } from "../src/models/overlay";
import type { PlayerProfile } from "../src/models/player";
import type {
  Tournament,
  TournamentRosterEntry,
  TournamentTeam,
} from "../src/models/tournament";
import playerFixture from "./fixtures/players.json";
import ruleFixture from "./fixtures/rules.json";
import stageFixture from "./fixtures/stages.json";
import tournamentFixture from "./fixtures/tournaments.json";
import weaponFixture from "./fixtures/weapons.json";

type TournamentFixture = {
  tournaments: Tournament[];
  tournamentTeams: TournamentTeam[];
  tournamentRosterEntries: TournamentRosterEntry[];
};

const players = playerFixture as PlayerProfile[];
const rules = ruleFixture as Rule[];
const stages = stageFixture as Stage[];
const tournaments = tournamentFixture as TournamentFixture;
const weapons = weaponFixture as Weapon[];
const originalFetch = globalThis.fetch;
let unexpectedRequests: string[] = [];

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function createCatalogDataSource(): CatalogDataSource {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const weaponsById = new Map(weapons.map((weapon) => [weapon.id, weapon]));

  return {
    listWeapons: () => weapons,
    listRules: () => rules,
    listStages: () => stages,
    findRule: (ruleId) => rulesById.get(ruleId) ?? null,
    findStage: (stageId) => stagesById.get(stageId) ?? null,
    requireWeapon(weaponId, source) {
      const weapon = weaponsById.get(weaponId);
      if (weapon === undefined) {
        throw new Error(
          `Weapon fixture does not contain id ${weaponId} referenced by ${source}.`,
        );
      }
      return weapon;
    },
  };
}

function createTestApp() {
  const catalogDataSource = createCatalogDataSource();
  const storageDataSource = createJsonDataSource({
    players,
    tournaments: tournaments.tournaments,
    tournamentTeams: tournaments.tournamentTeams,
    tournamentRosterEntries: tournaments.tournamentRosterEntries,
    weaponCatalog: catalogDataSource,
  });
  const dataSource = createDataSource({
    storageDataSource,
    catalogDataSource,
    enrichMatchup: async (matchup) => matchup,
  });

  return createApp({
    dataSource,
    webOrigins: ["http://localhost:5173"],
  });
}

function matchupPath(overrides: Partial<Record<
  | "tournamentId"
  | "alphaTournamentTeamId"
  | "bravoTournamentTeamId"
  | "ruleId"
  | "stageId",
  string
>> = {}): string {
  const query = new URLSearchParams({
    tournamentId: "tournament-a",
    alphaTournamentTeamId: "team-alpha",
    bravoTournamentTeamId: "team-bravo",
    ruleId: "rule-1",
    stageId: "stage-1",
    ...overrides,
  });
  return `/overlay/matchup?${query.toString()}`;
}

async function get(path: string): Promise<Response> {
  return createTestApp().handle(new Request(`http://api.test${path}`));
}

beforeEach(() => {
  unexpectedRequests = [];
  globalThis.fetch = Object.assign(
    (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> => {
      unexpectedRequests.push(requestUrl(input));
      return Promise.reject(
        new Error(`Unexpected external request: ${requestUrl(input)}`),
      );
    },
    { preconnect: originalFetch.preconnect },
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  expect(unexpectedRequests).toEqual([]);
});

describe("API smoke", () => {
  test("GET /weapons returns the weapon fixture", async () => {
    const response = await get("/weapons");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(weapons);
  });

  test("GET /rules returns the rule fixture", async () => {
    const response = await get("/rules");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rules);
  });

  test("GET /stages returns the stage fixture", async () => {
    const response = await get("/stages");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(stages);
  });

  test("GET /overlay/matchup returns a valid four-player matchup", async () => {
    const response = await get(matchupPath());
    const matchup = await response.json() as OverlayMatchup;

    expect(response.status).toBe(200);
    expect(matchup.tournament).toEqual({
      id: "tournament-a",
      name: "Tournament One",
    });
    expect(matchup.alpha.id).toBe("team-alpha");
    expect(matchup.alpha.players).toHaveLength(4);
    expect(matchup.bravo.id).toBe("team-bravo");
    expect(matchup.bravo.players).toHaveLength(4);
    expect(matchup.rule).toEqual(rules[0]);
    expect(matchup.stage).toEqual(stages[0]);
    expect(matchup.alpha.players[0]?.weapons).toEqual([
      { ...weapons[0], imageUrl: null },
    ]);
  });

  test("GET /overlay/matchup rejects the same team on both sides", async () => {
    const response = await get(
      matchupPath({ bravoTournamentTeamId: "team-alpha" }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("GET /overlay/matchup rejects a team from another tournament", async () => {
    const response = await get(
      matchupPath({ bravoTournamentTeamId: "team-charlie" }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
