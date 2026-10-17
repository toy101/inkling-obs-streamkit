import { t } from "elysia";

import {
  IdSchema,
  NameSchema,
  PlayerNameInputSchema,
  TEAM_PLAYER_COUNT,
} from "./common";
import {
  TournamentRosterEntrySchema,
  TournamentStatusSchema,
  TournamentTeamSchema,
  TournamentTeamStatusSchema,
} from "./tournament";

export const AdminTournamentInputSchema = t.Object(
  {
    name: NameSchema,
    status: TournamentStatusSchema,
  },
  { additionalProperties: false },
);
export type AdminTournamentInput = typeof AdminTournamentInputSchema.static;

export const AdminRosterEntryInputSchema = t.Object(
  {
    id: t.Nullable(IdSchema),
    registeredName: PlayerNameInputSchema,
    playerId: t.Nullable(IdSchema),
  },
  { additionalProperties: false },
);
export type AdminRosterEntryInput = typeof AdminRosterEntryInputSchema.static;

export const AdminTeamInputSchema = t.Object(
  {
    name: NameSchema,
    displayOrder: t.Integer({ minimum: 1 }),
    status: TournamentTeamStatusSchema,
    roster: t.Array(AdminRosterEntryInputSchema, { maxItems: TEAM_PLAYER_COUNT }),
  },
  { additionalProperties: false },
);
export type AdminTeamInput = typeof AdminTeamInputSchema.static;

export const AdminTeamSchema = t.Object(
  {
    ...TournamentTeamSchema.properties,
    roster: t.Array(TournamentRosterEntrySchema, { maxItems: TEAM_PLAYER_COUNT }),
  },
  { additionalProperties: false },
);
export type AdminTeam = typeof AdminTeamSchema.static;
