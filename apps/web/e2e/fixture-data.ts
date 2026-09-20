import type {
  OverlayMatchup,
  Rule,
  Stage,
  Tournament,
  TournamentTeam,
} from "../src/lib/api";

import overlayMatchupFixture from "./fixtures/overlay-matchup.json";
import rulesFixture from "./fixtures/rules.json";
import stagesFixture from "./fixtures/stages.json";
import teamsFixture from "./fixtures/tournament-teams.json";
import tournamentsFixture from "./fixtures/tournaments.json";

export const fixtureData = {
  tournaments: tournamentsFixture as unknown as Tournament[],
  tournamentTeams: teamsFixture as unknown as Record<string, TournamentTeam[]>,
  rules: rulesFixture as unknown as Rule[],
  stages: stagesFixture as unknown as Stage[],
  matchup: overlayMatchupFixture as unknown as OverlayMatchup,
};
