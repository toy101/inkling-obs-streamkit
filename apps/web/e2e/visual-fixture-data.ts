import type {
  OverlayMatchup,
  Rule,
  Stage,
  Tournament,
  TournamentTeam,
} from "../src/lib/api";
import type { FixtureData } from "./test";

type OverlayPlayer = OverlayMatchup["alpha"]["players"][number];

const tournament: Tournament = {
  id: "visual-tournament",
  organizerUserId: "visual-organizer",
  name: "Inkling StreamKit Championship 8000 Midnight Broadcast Visual Regression Tournament",
  status: "locked",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const alphaTeam: TournamentTeam = {
  id: "visual-team-alpha",
  tournamentId: tournament.id,
  name: "ALPHA | Moonlit Long Form Streaming Team",
  displayOrder: 1,
  rosterLockedAt: "2026-01-01T00:00:00.000Z",
};

const bravoTeam: TournamentTeam = {
  id: "visual-team-bravo",
  tournamentId: tournament.id,
  name: "BRAVO | Midnight Broadcast Support Team",
  displayOrder: 2,
  rosterLockedAt: "2026-01-01T00:00:00.000Z",
};

const rule: Rule = {
  id: "visual-rule",
  name: "Splat Zones",
  en: "Splat Zones",
  description:
    "A long local rule description keeps the stable stage introduction inside the fixed canvas without clipping important information.",
};

const stage: Stage = {
  id: "visual-stage",
  name: "Extremely Long Inkblot Art Academy Stage",
  en: "Extremely Long Inkblot Art Academy Preview Stage",
};

function createPlayer(
  rosterEntryId: string,
  registeredName: string,
): OverlayPlayer {
  return {
    rosterEntryId,
    registeredName,
    iconUrl: null,
    position: null,
    weapons: [
      {
        id: `${rosterEntryId}-weapon`,
        name: "Missing Weapon Image Fallback With A Long Name",
        imageUrl: null,
      },
    ],
  };
}

const alphaPlayers: [OverlayPlayer, OverlayPlayer, OverlayPlayer, OverlayPlayer] = [
  createPlayer("visual-alpha-1", "Moonlit Observer Team Captain With A Long Name"),
  createPlayer("visual-alpha-2", "Midnight Broadcast Switcher With A Long Name"),
  createPlayer("visual-alpha-3", "Stage Edge Analyst With A Long Name"),
  createPlayer("visual-alpha-4", "Never Give Up Shot Caller With A Long Name"),
];

const bravoPlayers: [OverlayPlayer, OverlayPlayer, OverlayPlayer, OverlayPlayer] = [
  createPlayer("visual-bravo-1", "Moonlight Entry Lead With A Long Name"),
  createPlayer("visual-bravo-2", "Opponent Reading Defender With A Long Name"),
  createPlayer("visual-bravo-3", "Long Broadcast Support With A Long Name"),
  createPlayer("visual-bravo-4", "Precision Finisher With A Long Name"),
];

const matchup: OverlayMatchup = {
  tournament: {
    id: tournament.id,
    name: tournament.name,
  },
  alpha: {
    ...alphaTeam,
    players: alphaPlayers,
  },
  bravo: {
    ...bravoTeam,
    players: bravoPlayers,
  },
  rule,
  stage,
};

export const visualFixtureData = {
  tournaments: [tournament],
  tournamentTeams: {
    [tournament.id]: [alphaTeam, bravoTeam],
  },
  rules: [rule],
  stages: [stage],
  matchup,
} satisfies FixtureData;
