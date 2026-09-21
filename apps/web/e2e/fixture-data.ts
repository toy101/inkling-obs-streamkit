import type {
  OverlayMatchup,
  Rule,
  Stage,
  Tournament,
  TournamentTeam,
} from "../src/lib/api";

type OverlayPlayer = OverlayMatchup["alpha"]["players"][number];

const tournaments: Tournament[] = [
  {
    id: "tournament-a",
    organizerUserId: "organizer-1",
    name: "Tournament One",
    status: "locked",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tournament-b",
    organizerUserId: "organizer-1",
    name: "Tournament Two",
    status: "locked",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const tournamentTeams: Record<string, TournamentTeam[]> = {
  "tournament-a": [
    {
      id: "team-alpha",
      tournamentId: "tournament-a",
      name: "Alpha",
      displayOrder: 1,
      rosterLockedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "team-bravo",
      tournamentId: "tournament-a",
      name: "Bravo",
      displayOrder: 2,
      rosterLockedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "team-charlie-a",
      tournamentId: "tournament-a",
      name: "Charlie",
      displayOrder: 3,
      rosterLockedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  "tournament-b": [
    {
      id: "team-charlie",
      tournamentId: "tournament-b",
      name: "Charlie",
      displayOrder: 1,
      rosterLockedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const fixtureRule: Rule = {
  id: "rule-1",
  name: "Rule One",
  en: "Rule One",
  description: "Fixture rule.",
};
const rules: Rule[] = [fixtureRule];

const fixtureStage: Stage = {
  id: "stage-1",
  name: "Stage One",
  en: "Stage One",
};
const stages: Stage[] = [fixtureStage];

function createPlayer(
  rosterEntryId: string,
  registeredName: string,
): OverlayPlayer {
  return {
    rosterEntryId,
    registeredName,
    iconUrl: null,
    position: null,
    weapons: [{ id: "1", name: "Weapon One", imageUrl: null }],
  };
}

const matchup: OverlayMatchup = {
  tournament: {
    id: "tournament-a",
    name: "Tournament One",
  },
  alpha: {
    id: "team-alpha",
    name: "Alpha",
    players: [
      createPlayer("alpha-1", "Alpha One"),
      createPlayer("alpha-2", "Alpha Two"),
      createPlayer("alpha-3", "Alpha Three"),
      createPlayer("alpha-4", "Alpha Four"),
    ],
  },
  bravo: {
    id: "team-bravo",
    name: "Bravo",
    players: [
      createPlayer("bravo-1", "Bravo One"),
      createPlayer("bravo-2", "Bravo Two"),
      createPlayer("bravo-3", "Bravo Three"),
      createPlayer("bravo-4", "Bravo Four"),
    ],
  },
  rule: fixtureRule,
  stage: fixtureStage,
};

export const fixtureData = {
  tournaments,
  tournamentTeams,
  rules,
  stages,
  matchup,
};
