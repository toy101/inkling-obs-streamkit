import { t } from "elysia";
import { IdSchema, TimestampSchema } from "./common";

export const ClaimStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("revoked"),
]);

export type ClaimStatus = typeof ClaimStatusSchema.static;

export const ClaimMethodSchema = t.Union([
  t.Literal("invitation"),
  t.Literal("request"),
]);

export type ClaimMethod = typeof ClaimMethodSchema.static;

// 本人確認・承認権限・状態遷移・名簿の二重紐づけ防止はサービス/DB側で扱う。
export const RosterClaimSchema = t.Object(
  {
    id: IdSchema,
    rosterEntryId: IdSchema,
    playerId: IdSchema,
    method: ClaimMethodSchema,
    status: ClaimStatusSchema,
    requestedAt: TimestampSchema,
    resolvedAt: t.Nullable(TimestampSchema),
  },
  { additionalProperties: false },
);

export type RosterClaim = typeof RosterClaimSchema.static;
