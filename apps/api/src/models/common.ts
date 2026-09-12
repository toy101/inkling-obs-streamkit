import { t } from "elysia";

export const TEAM_PLAYER_COUNT = 4;
export const MAX_PLAYER_WEAPONS = 4;

export const IdSchema = t.String({ minLength: 1, pattern: "\\S" });
export const NameSchema = t.String({ minLength: 1, pattern: "\\S" });
export const TimestampSchema = t.String({ format: "date-time" });
export const HttpUrlSchema = t.String({
  format: "uri",
  pattern: "^https?://[^/\\s?#]+(?:[/?#]|$)",
});

export const DisplayOrderSchema = t.Union([
  t.Literal(1),
  t.Literal(2),
  t.Literal(3),
  t.Literal(4),
]);

export type DisplayOrder = typeof DisplayOrderSchema.static;

export const IdParamsSchema = t.Object(
  { id: IdSchema },
  { additionalProperties: false },
);
