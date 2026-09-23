import { expect, test as base } from "@playwright/test";
import type { ConsoleMessage, Page, Route } from "@playwright/test";

import { fixtureData } from "./fixture-data";

export type FixtureData = typeof fixtureData;

const API_ORIGIN = "http://127.0.0.1:3000";

export type ApiEndpoint =
  | "/tournaments"
  | "/tournaments/:id/teams"
  | "/rules"
  | "/stages"
  | "/overlay/matchup";

type ApiRequestRecord = {
  endpoint: ApiEndpoint;
  method: "GET";
  url: string;
  query: Readonly<Record<string, string>>;
};

export type OverlayMatchupRequest = ApiRequestRecord & {
  endpoint: "/overlay/matchup";
  query: {
    tournamentId: string;
    alphaTournamentTeamId: string;
    bravoTournamentTeamId: string;
    ruleId: string;
    stageId: string;
  };
};

type ConsoleErrorMatcher = string | RegExp;

export type ApiMock = {
  readonly requests: () => readonly ApiRequestRecord[];
  readonly matchupRequests: () => readonly OverlayMatchupRequest[];
  readonly requestCount: (endpoint: ApiEndpoint) => number;
  readonly allowConsoleError: (matcher: ConsoleErrorMatcher) => void;
};

export type InstalledApiMock = ApiMock & {
  readonly assertNoBrowserErrors: () => void;
};

export type InstallApiMockOptions = {
  readonly fixtures?: FixtureData;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringifyJson(payload: unknown): string {
  const body = JSON.stringify(payload);
  if (body === undefined) {
    throw new Error("API fixture could not be serialized as JSON.");
  }
  return body;
}

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
    },
    body: stringifyJson(payload),
  });
}

function getEndpoint(pathname: string): ApiEndpoint | null {
  if (pathname === "/tournaments") return "/tournaments";
  if (/^\/tournaments\/[^/]+\/teams$/.test(pathname)) {
    return "/tournaments/:id/teams";
  }
  if (pathname === "/rules") return "/rules";
  if (pathname === "/stages") return "/stages";
  if (pathname === "/overlay/matchup") return "/overlay/matchup";
  return null;
}

function queryRecord(url: URL): Readonly<Record<string, string>> {
  return Object.fromEntries(url.searchParams.entries());
}

function requiredQuery(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (!value) {
    throw new Error(`Missing required /overlay/matchup query: ${key}`);
  }
  return value;
}

function matchupQuery(url: URL): OverlayMatchupRequest["query"] {
  return {
    tournamentId: requiredQuery(url, "tournamentId"),
    alphaTournamentTeamId: requiredQuery(url, "alphaTournamentTeamId"),
    bravoTournamentTeamId: requiredQuery(url, "bravoTournamentTeamId"),
    ruleId: requiredQuery(url, "ruleId"),
    stageId: requiredQuery(url, "stageId"),
  };
}

function isAllowedConsoleError(
  message: ConsoleMessage,
  matchers: readonly ConsoleErrorMatcher[],
): boolean {
  const text = message.text();
  return matchers.some((matcher) =>
    matcher instanceof RegExp ? matcher.test(text) : text.includes(matcher),
  );
}

export async function installApiMock(
  page: Page,
  options: InstallApiMockOptions = {},
): Promise<InstalledApiMock> {
  const fixtures = options.fixtures ?? fixtureData;
  const requests: ApiRequestRecord[] = [];
  const matchupRequests: OverlayMatchupRequest[] = [];
  const browserErrors: string[] = [];
  const allowedConsoleErrors: ConsoleErrorMatcher[] = [];

  page.on("pageerror", (error) => {
    browserErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !isAllowedConsoleError(message, allowedConsoleErrors)
    ) {
      browserErrors.push(`console.error: ${message.text()}`);
    }
  });

  const apiMock: ApiMock = {
    requests: () => [...requests],
    matchupRequests: () => [...matchupRequests],
    requestCount: (endpoint) =>
      requests.filter((request) => request.endpoint === endpoint).length,
    allowConsoleError: (matcher) => {
      allowedConsoleErrors.push(matcher);
    },
  };

  const handleRoute = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = getEndpoint(url.pathname);

    if (endpoint === null) {
      throw new Error(`Unexpected API request: ${request.method()} ${url}`);
    }
    if (request.method() !== "GET") {
      throw new Error(`Unexpected API method: ${request.method()} ${url}`);
    }

    const requestRecord: ApiRequestRecord = {
      endpoint,
      method: "GET",
      url: url.href,
      query: queryRecord(url),
    };
    requests.push(requestRecord);

    switch (endpoint) {
      case "/tournaments":
        await fulfillJson(route, fixtures.tournaments);
        return;
      case "/tournaments/:id/teams": {
        const tournamentId = url.pathname.split("/")[2];
        const teams = tournamentId
          ? fixtures.tournamentTeams[tournamentId]
          : undefined;
        if (!teams) {
          throw new Error(
            `Missing tournament team fixture for id: ${tournamentId ?? ""}`,
          );
        }
        await fulfillJson(route, teams);
        return;
      }
      case "/rules":
        await fulfillJson(route, fixtures.rules);
        return;
      case "/stages":
        await fulfillJson(route, fixtures.stages);
        return;
      case "/overlay/matchup": {
        const overlayRequest: OverlayMatchupRequest = {
          ...requestRecord,
          endpoint,
          query: matchupQuery(url),
        };
        matchupRequests.push(overlayRequest);
        await fulfillJson(route, fixtures.matchup);
        return;
      }
    }
  };

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    try {
      await handleRoute(route);
    } catch (error) {
      const message = errorMessage(error);
      browserErrors.push(`API mock: ${message}`);
      await route.abort("failed").catch(() => undefined);
      throw error;
    }
  });

  return {
    ...apiMock,
    assertNoBrowserErrors: () => {
      expect(browserErrors).toEqual([]);
    },
  };
}

type Fixtures = {
  api: InstalledApiMock;
};

export const test = base.extend<Fixtures>({
  api: [
    async ({ page }, use) => {
      const apiMock = await installApiMock(page);
      await use(apiMock);
      apiMock.assertNoBrowserErrors();
    },
    { auto: true },
  ],
});

export { expect };
