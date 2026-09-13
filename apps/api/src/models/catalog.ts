import { t } from "elysia";

import { IdSchema, NameSchema } from "./common";

const NamedItemSchema = t.Object(
  { id: IdSchema, name: NameSchema },
  { additionalProperties: false },
);

const LocalizedCatalogItemSchema = t.Object(
  { id: IdSchema, name: NameSchema, en: NameSchema },
  { additionalProperties: false },
);

const RuleCatalogItemSchema = t.Object(
  {
    ...LocalizedCatalogItemSchema.properties,
    description: t.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const WeaponSchema = t.Object(
  { ...NamedItemSchema.properties },
  { additionalProperties: false },
);
export type Weapon = typeof WeaponSchema.static;

export const WeaponListSchema = t.Array(WeaponSchema);
export type WeaponList = typeof WeaponListSchema.static;

export const RuleSchema = t.Object(
  { ...RuleCatalogItemSchema.properties },
  { additionalProperties: false },
);
export type Rule = typeof RuleSchema.static;

export const RuleListSchema = t.Array(RuleSchema);
export type RuleList = typeof RuleListSchema.static;

export const StageSchema = t.Object(
  { ...LocalizedCatalogItemSchema.properties },
  { additionalProperties: false },
);
export type Stage = typeof StageSchema.static;

export const StageListSchema = t.Array(StageSchema);
export type StageList = typeof StageListSchema.static;

export const PositionSchema = t.Object(
  { ...NamedItemSchema.properties },
  { additionalProperties: false },
);
export type Position = typeof PositionSchema.static;
