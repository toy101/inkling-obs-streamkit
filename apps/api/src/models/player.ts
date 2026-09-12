import { t } from "elysia";

import { PositionSchema } from "./catalog";
import {
  DisplayOrderSchema,
  HttpUrlSchema,
  IdSchema,
  MAX_PLAYER_WEAPONS,
  NameSchema,
  TimestampSchema,
} from "./common";

export const PlayerSchema = t.Object(
  {
    id: IdSchema,
    ownerUserId: IdSchema,
    displayName: NameSchema,
    iconUrl: t.Nullable(HttpUrlSchema),
    positionId: t.Nullable(IdSchema),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);
export type Player = typeof PlayerSchema.static;

export const PlayerWeaponSchema = t.Object(
  {
    playerId: IdSchema,
    weaponId: IdSchema,
    displayOrder: DisplayOrderSchema,
  },
  { additionalProperties: false },
);
export type PlayerWeapon = typeof PlayerWeaponSchema.static;

// 配列の順番を保存時にdisplayOrderへ変換する。0件の途中保存も許可する。
export const PlayerWeaponIdsSchema = t.Array(IdSchema, {
  maxItems: MAX_PLAYER_WEAPONS,
  uniqueItems: true,
});

// 本人が編集できる項目だけを受け付ける。所有者・ID・日時はサーバーが設定する。
export const PlayerInputSchema = t.Object(
  {
    ...t.Pick(PlayerSchema, ["displayName", "iconUrl", "positionId"]).properties,
    weaponIds: PlayerWeaponIdsSchema,
  },
  { additionalProperties: false },
);
export type PlayerInput = typeof PlayerInputSchema.static;

// 公開APIにはownerUserIdや更新日時を含めず、表示用の情報だけを返す。
export const PlayerProfileSchema = t.Object(
  {
    ...t.Pick(PlayerSchema, ["id", "displayName", "iconUrl"]).properties,
    position: t.Nullable(PositionSchema),
    weaponIds: PlayerWeaponIdsSchema,
  },
  { additionalProperties: false },
);
export type PlayerProfile = typeof PlayerProfileSchema.static;
