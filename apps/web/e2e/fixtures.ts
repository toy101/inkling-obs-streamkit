import type { Page, Route } from "@playwright/test";

export const API_ORIGIN = "http://127.0.0.1:3000";

export const TOURNAMENT = {
  id: "fixture-tournament",
  organizerUserId: "fixture-organizer",
  name: "Fixture Cup",
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const TEAMS = [
  {
    id: "fixture-alpha",
    tournamentId: TOURNAMENT.id,
    name: "Fixture Alpha",
    displayOrder: 1,
    rosterLockedAt: null,
  },
  {
    id: "fixture-bravo",
    tournamentId: TOURNAMENT.id,
    name: "Fixture Bravo",
    displayOrder: 2,
    rosterLockedAt: null,
  },
  {
    id: "fixture-charlie",
    tournamentId: TOURNAMENT.id,
    name: "Fixture Charlie",
    displayOrder: 3,
    rosterLockedAt: null,
  },
] as const;

const RULE = {
  id: "fixture-rule",
  name: "Fixture Rule",
  en: "Fixture Rule",
  description: "Fixture rule description",
};

const STAGE = {
  id: "fixture-stage",
  name: "Fixture Stage",
  en: "Fixture Stage",
};

function requireTeam(teamId: string) {
  const team = TEAMS.find(({ id }) => id === teamId);
  if (!team) {
    throw new Error(`Unknown fixture team: ${teamId}`);
  }
  return team;
}

function createOverlayTeam(teamId: string) {
  const team = requireTeam(teamId);
  return {
    id: team.id,
    name: team.name,
    players: Array.from({ length: 4 }, (_, index) => ({
      rosterEntryId: `${team.id}-player-${index + 1}`,
      registeredName: `${team.name} Player ${index + 1}`,
      iconUrl: null,
      position: null,
      weapons: [],
    })),
  };
}

function createMatchup(url: URL) {
  const alphaTeamId = url.searchParams.get("alphaTournamentTeamId");
  const bravoTeamId = url.searchParams.get("bravoTournamentTeamId");
  if (!alphaTeamId || !bravoTeamId) {
    throw new Error("The matchup request is missing team IDs.");
  }

  return {
    tournament: { id: TOURNAMENT.id, name: TOURNAMENT.name },
    alpha: createOverlayTeam(alphaTeamId),
    bravo: createOverlayTeam(bravoTeamId),
    rule: RULE,
    stage: STAGE,
  };
}

async function fulfillJson(route: Route, value: unknown) {
  await route.fulfill({
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(value),
  });
}

export async function installApiMock(page: Page) {
  let matchupRequestCount = 0;

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/tournaments") {
      await fulfillJson(route, [TOURNAMENT]);
      return;
    }
    if (url.pathname === `/tournaments/${TOURNAMENT.id}/teams`) {
      await fulfillJson(route, TEAMS);
      return;
    }
    if (url.pathname === "/rules") {
      await fulfillJson(route, [RULE]);
      return;
    }
    if (url.pathname === "/stages") {
      await fulfillJson(route, [STAGE]);
      return;
    }
    if (url.pathname === "/overlay/matchup") {
      matchupRequestCount += 1;
      await fulfillJson(route, createMatchup(url));
      return;
    }

    await route.fulfill({ status: 404, body: "Not Found" });
  });

  return () => matchupRequestCount;
}
