import { t } from "elysia";

import { RuleSchema, StageSchema, WeaponSchema } from "./catalog";
import { HttpUrlSchema, IdSchema, MAX_PLAYER_WEAPONS } from "./common";
import { PlayerProfileSchema } from "./player";
import {
  TournamentRosterEntrySchema,
  TournamentSchema,
  TournamentTeamSchema,
} from "./tournament";

export const OverlayTeamsQuerySchema = t.Object(
  {
    tournamentId: IdSchema,
    alphaTournamentTeamId: IdSchema,
    bravoTournamentTeamId: IdSchema,
  },
  { additionalProperties: false },
);
export type OverlayTeamsQuery = typeof OverlayTeamsQuerySchema.static;

// APIには表示対象のIDだけを渡す。ルールとステージは対戦情報を表示するときに追加する。
export const OverlayQuerySchema = t.Object(
  {
    ...OverlayTeamsQuerySchema.properties,
    ruleId: IdSchema,
    stageId: IdSchema,
  },
  { additionalProperties: false },
);
export type OverlayQuery = typeof OverlayQuerySchema.static;

export const OverlayWeaponSchema = t.Object(
  {
    ...WeaponSchema.properties,
    imageUrl: t.Nullable(HttpUrlSchema),
  },
  { additionalProperties: false },
);
export type OverlayWeapon = typeof OverlayWeaponSchema.static;

export const OverlayPlayerSchema = t.Object(
  {
    rosterEntryId: IdSchema,
    registeredName: TournamentRosterEntrySchema.properties.registeredName,
    ...t.Pick(PlayerProfileSchema, ["iconUrl", "position"]).properties,
    weapons: t.Array(OverlayWeaponSchema, { maxItems: MAX_PLAYER_WEAPONS }),
  },
  { additionalProperties: false },
);
export type OverlayPlayer = typeof OverlayPlayerSchema.static;

export const OverlayTeamSchema = t.Object(
  {
    ...t.Pick(TournamentTeamSchema, ["id", "name"]).properties,
    players: t.Tuple([
      OverlayPlayerSchema,
      OverlayPlayerSchema,
      OverlayPlayerSchema,
      OverlayPlayerSchema,
    ]),
  },
  { additionalProperties: false },
);
export type OverlayTeam = typeof OverlayTeamSchema.static;

export const OverlayParticipantsSchema = t.Object(
  {
    tournament: t.Pick(TournamentSchema, ["id", "name"]),
    alpha: OverlayTeamSchema,
    bravo: OverlayTeamSchema,
  },
  { additionalProperties: false },
);
export type OverlayParticipants = typeof OverlayParticipantsSchema.static;

// 大会所属・アルファ/ブラボーチーム・名簿順・確定済み情報の解決は取得処理で検証する。
export const OverlayMatchupSchema = t.Object(
  {
    ...OverlayParticipantsSchema.properties,
    rule: RuleSchema,
    stage: StageSchema,
  },
  { additionalProperties: false },
);
export type OverlayMatchup = typeof OverlayMatchupSchema.static;
