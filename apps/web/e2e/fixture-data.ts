import type {
  OverlayMatchup,
  Rule,
  Stage,
  Tournament,
  TournamentTeam,
} from "../src/lib/api";

import overlayMatchupFixture from "./fixtures/overlay-matchup.json" with {
  type: "json",
};
import rulesFixture from "./fixtures/rules.json" with { type: "json" };
import stagesFixture from "./fixtures/stages.json" with { type: "json" };
import teamsFixture from "./fixtures/tournament-teams.json" with {
  type: "json",
};
import tournamentsFixture from "./fixtures/tournaments.json" with {
  type: "json",
};

export const fixtureData = {
  tournaments: tournamentsFixture as unknown as Tournament[],
  tournamentTeams: teamsFixture as unknown as Record<string, TournamentTeam[]>,
  rules: rulesFixture as unknown as Rule[],
  stages: stagesFixture as unknown as Stage[],
  matchup: overlayMatchupFixture as unknown as OverlayMatchup,
};
