import { t } from "elysia";
import {
  DisplayOrderSchema,
  IdSchema,
  NameSchema,
  TEAM_PLAYER_COUNT,
  TimestampSchema,
} from "./common";

export const TournamentStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("registration"),
  t.Literal("locked"),
  t.Literal("archived"),
]);

export type TournamentStatus = typeof TournamentStatusSchema.static;

export const TournamentSchema = t.Object(
  {
    id: IdSchema,
    organizerUserId: IdSchema,
    name: NameSchema,
    status: TournamentStatusSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export type Tournament = typeof TournamentSchema.static;

export const TournamentTeamSchema = t.Object(
  {
    id: IdSchema,
    tournamentId: IdSchema,
    name: NameSchema,
    displayOrder: t.Integer({ minimum: 1 }),
    rosterLockedAt: t.Nullable(TimestampSchema),
  },
  { additionalProperties: false },
);

export type TournamentTeam = typeof TournamentTeamSchema.static;

export const TournamentRosterEntrySchema = t.Object(
  {
    id: IdSchema,
    tournamentTeamId: IdSchema,
    registeredName: NameSchema,
    displayOrder: DisplayOrderSchema,
    playerId: t.Nullable(IdSchema),
  },
  { additionalProperties: false },
);

export type TournamentRosterEntry = typeof TournamentRosterEntrySchema.static;

// 下書きは0〜4人。確定時の4人検証・表示順と選手の重複・参照整合性はサービス/DB側で扱う。
export const TournamentRosterEntriesSchema = t.Array(
  TournamentRosterEntrySchema,
  { maxItems: TEAM_PLAYER_COUNT },
);

export type TournamentRosterEntries = typeof TournamentRosterEntriesSchema.static;

export const TournamentRosterWeaponSchema = t.Object(
  {
    rosterEntryId: IdSchema,
    weaponId: IdSchema,
    displayOrder: DisplayOrderSchema,
  },
  { additionalProperties: false },
);

// 保存行の最大4件・ブキと表示順の重複・参照整合性はサービス/DB側で扱う。
export type TournamentRosterWeapon = typeof TournamentRosterWeaponSchema.static;
