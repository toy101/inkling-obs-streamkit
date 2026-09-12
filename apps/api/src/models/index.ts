import { Elysia, t } from "elysia";

import {
  PositionSchema,
  RuleListSchema,
  RuleSchema,
  StageListSchema,
  StageSchema,
  WeaponListSchema,
  WeaponSchema,
} from "./catalog";
import { IdParamsSchema } from "./common";
import {
  OverlayMatchupSchema,
  OverlayParticipantsSchema,
  OverlayQuerySchema,
  OverlayTeamsQuerySchema,
} from "./overlay";
import {
  PlayerInputSchema,
  PlayerProfileSchema,
  PlayerSchema,
  PlayerWeaponSchema,
} from "./player";
import { RosterClaimSchema } from "./roster-claim";
import {
  TournamentRosterEntriesSchema,
  TournamentRosterEntrySchema,
  TournamentRosterWeaponSchema,
  TournamentSchema,
  TournamentTeamSchema,
} from "./tournament";

// Elysiaのbody/params/responseから名前で参照し、同じスキーマをEdenへ伝える。
export const models = new Elysia({ name: "domain.models" }).model({
  "common.idParams": IdParamsSchema,
  position: PositionSchema,
  weapon: WeaponSchema,
  "weapon.list": WeaponListSchema,
  rule: RuleSchema,
  "rule.list": RuleListSchema,
  stage: StageSchema,
  "stage.list": StageListSchema,
  player: PlayerSchema,
  "player.weapon": PlayerWeaponSchema,
  "player.input": PlayerInputSchema,
  "player.profile": PlayerProfileSchema,
  "player.profile.list": t.Array(PlayerProfileSchema),
  "player.profile.detail": t.Nullable(PlayerProfileSchema),
  tournament: TournamentSchema,
  "tournament.list": t.Array(TournamentSchema),
  "tournament.team": TournamentTeamSchema,
  "tournament.team.list": t.Array(TournamentTeamSchema),
  "tournament.rosterEntry": TournamentRosterEntrySchema,
  "tournament.rosterEntries": TournamentRosterEntriesSchema,
  "tournament.rosterWeapon": TournamentRosterWeaponSchema,
  "roster.claim": RosterClaimSchema,
  "overlay.teamsQuery": OverlayTeamsQuerySchema,
  "overlay.participants": t.Nullable(OverlayParticipantsSchema),
  "overlay.query": OverlayQuerySchema,
  "overlay.matchup": t.Nullable(OverlayMatchupSchema),
});
