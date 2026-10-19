import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createLocalCatalogDataSource } from "../src/catalog-store";
import { createApp } from "../src/create-app";
import { createDataSource } from "../src/create-data-source";
import { createJsonDataSource } from "../src/data/json-data-source";
import type { Rule, Stage, Weapon } from "../src/models/catalog";
import type { OverlayMatchup } from "../src/models/overlay";
import type { PlayerProfile } from "../src/models/player";
import type {
  Tournament,
  TournamentRosterEntry,
  TournamentTeam,
  TournamentTeamStatus,
} from "../src/models/tournament";
import playerFixture from "./fixtures/players.json";
import ruleFixture from "./fixtures/rules.json";
import stageFixture from "./fixtures/stages.json";
import tournamentFixture from "./fixtures/tournaments.json";
import weaponFixture from "./fixtures/weapons.json";

type TournamentFixture = {
  tournaments: Tournament[];
  tournamentTeams: Array<Omit<TournamentTeam, "status"> & {
    status?: TournamentTeamStatus;
    rosterLockedAt?: string | null;
  }>;
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

async function createTestApp(directory = new URL("./fixtures/", import.meta.url)) {
  const catalogDataSource = await createLocalCatalogDataSource(directory);
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
    enrichMatchup: async (matchup) => {
      const withImages = (player: OverlayMatchup["alpha"]["players"][number]) => ({
        ...player,
        weapons: player.weapons.map((weapon) => ({
          ...weapon,
          imageUrl: `https://images.test/weapons/${weapon.id}.png`,
        })),
      });
      const withTeamImages = (team: OverlayMatchup["alpha"]): OverlayMatchup["alpha"] => ({
        ...team,
        players: [
          withImages(team.players[0]),
          withImages(team.players[1]),
          withImages(team.players[2]),
          withImages(team.players[3]),
        ],
      });
      return {
        ...matchup,
        alpha: withTeamImages(matchup.alpha),
        bravo: withTeamImages(matchup.bravo),
      };
    },
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
  const app = await createTestApp();
  return app.handle(new Request(`http://api.test${path}`));
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
  test.each(["ruleId", "stageId"] as const)(
    "GET /overlay/matchup rejects an unknown %s with an empty body",
    async (field) => {
      const response = await get(matchupPath({ [field]: "missing" }));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    },
  );

  test.each(["weapons", "rules", "stages"] as const)(
    "invalid local %s prevents API construction",
    async (catalog) => {
      const directory = await mkdtemp(join(tmpdir(), "inkling-api-catalog-"));
      const url = new URL(pathToFileURL(`${directory}/`).href);
      try {
        for (const name of ["weapons", "rules", "stages"]) {
          await Bun.write(
            new URL(`${name}.json`, url),
            Bun.file(new URL(`./fixtures/${name}.json`, import.meta.url)),
          );
        }
        await Bun.write(new URL(`${catalog}.json`, url), "[]");

        await expect(createTestApp(url)).rejects.toThrow(/catalog must not be empty/);
        // A failed instance must not contaminate a subsequent valid instance.
        const response = await get(`/${catalog}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ weapons, rules, stages }[catalog]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

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
    expect(matchup.rule).toEqual(rules[1]);
    expect(matchup.stage).toEqual(stages[1]);
    for (const team of [matchup.alpha, matchup.bravo]) {
      for (const player of team.players) {
        expect(player.weapons).toEqual([
          { id: "1", name: "Weapon One", imageUrl: "https://images.test/weapons/1.png" },
        ]);
      }
    }
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

  test("JSON mode normalizes legacy teams and excludes explicit hidden teams", async () => {
    const catalogDataSource = await createLocalCatalogDataSource(new URL("./fixtures/", import.meta.url));
    const storage = createJsonDataSource({
      players,
      tournaments: tournaments.tournaments,
      tournamentTeams: tournaments.tournamentTeams.map((team) => team.id === "team-alpha"
        ? { ...team, status: "hidden" as const }
        : team),
      tournamentRosterEntries: tournaments.tournamentRosterEntries,
      weaponCatalog: catalogDataSource,
    });

    expect(await storage.listTournamentTeams("tournament-a")).toEqual([
      expect.objectContaining({ id: "team-bravo", status: "confirmed" }),
    ]);
    expect(await storage.getOverlayParticipants({
      tournamentId: "tournament-a",
      alphaTournamentTeamId: "team-alpha",
      bravoTournamentTeamId: "team-bravo",
    })).toBeNull();
  });
});
