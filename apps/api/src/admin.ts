import { Elysia, t } from "elysia";

import type { Position } from "./models/catalog";
import {
  AdminTeamInputSchema,
  AdminTeamSchema,
  AdminTournamentInputSchema,
  type AdminTeam,
  type AdminTeamInput,
  type AdminTournamentInput,
} from "./models/admin";
import { IdParamsSchema } from "./models/common";
import { PlayerInputSchema, PlayerProfileSchema, type PlayerInput, type PlayerProfile } from "./models/player";
import { TournamentSchema, type Tournament } from "./models/tournament";

export type AdminEnvironment = "local" | "production";

export type AdminDataSource = {
  listPlayers(): Promise<PlayerProfile[]>;
  listTournaments(): Promise<Tournament[]>;
  listPositions(): Promise<Position[]>;
  listTournamentTeams(tournamentId: string): Promise<AdminTeam[]>;
  createPlayer(input: PlayerInput): Promise<PlayerProfile>;
  updatePlayer(id: string, input: PlayerInput): Promise<PlayerProfile>;
  createTournament(input: AdminTournamentInput): Promise<Tournament>;
  updateTournament(id: string, input: AdminTournamentInput): Promise<Tournament>;
  createTournamentTeam(tournamentId: string, input: AdminTeamInput): Promise<AdminTeam>;
  updateTournamentTeam(
    tournamentId: string,
    teamId: string,
    input: AdminTeamInput,
  ): Promise<AdminTeam>;
};

export class AdminDataError extends Error {
  readonly status: 404 | 409 | 422;

  constructor(
    status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.status = status;
  }
}

export type AdminAppOptions = {
  dataSource: AdminDataSource | null;
  token: string;
  origins: string[];
  environment: AdminEnvironment;
};

const ErrorSchema = t.Object(
  { message: t.String() },
  { additionalProperties: false },
);

function errorResponse(error: unknown, set: { status?: number | string }) {
  if (error instanceof AdminDataError) {
    set.status = error.status;
    return { message: error.message };
  }
  console.error("Admin operation failed.", error);
  set.status = 500;
  return { message: "Admin operation failed." };
}

export function createAdminRoutes(options?: AdminAppOptions) {
  const enabled = options !== undefined
    && options.dataSource !== null
    && options.token.trim().length > 0;

  function source(): AdminDataSource {
    if (!enabled || options?.dataSource === null || options?.dataSource === undefined) {
      throw new Error("Admin API is disabled.");
    }
    return options.dataSource;
  }

  return new Elysia({ name: "admin.routes", prefix: "/admin" })
    .onBeforeHandle(({ headers, set }) => {
      if (!enabled || options === undefined) {
        set.status = 404;
        return { message: "Not found." };
      }
      if (headers.authorization !== `Bearer ${options.token}`) {
        set.status = 401;
        return { message: "Unauthorized." };
      }
      const origin = headers.origin;
      if (origin !== undefined && !options.origins.includes(origin)) {
        set.status = 403;
        return { message: "Origin is not allowed." };
      }
    })
    .get("/status", () => ({ environment: options?.environment ?? "local" }))
    .get("/players", async ({ set }) => {
      try {
        return await source().listPlayers();
      } catch (error) {
        return errorResponse(error, set);
      }
    })
    .get("/tournaments", async ({ set }) => {
      try {
        return await source().listTournaments();
      } catch (error) {
        return errorResponse(error, set);
      }
    })
    .get("/positions", async ({ set }) => {
      try {
        return await source().listPositions();
      } catch (error) {
        return errorResponse(error, set);
      }
    })
    .get("/tournaments/:id/teams", async ({ params, set }) => {
      try {
        return await source().listTournamentTeams(params.id);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, { params: IdParamsSchema })
    .post("/players", async ({ body, set }) => {
      try {
        return await source().createPlayer(body);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, {
      body: PlayerInputSchema,
      response: { 200: PlayerProfileSchema, 409: ErrorSchema, 422: ErrorSchema, 500: ErrorSchema },
    })
    .put("/players/:id", async ({ params, body, set }) => {
      try {
        return await source().updatePlayer(params.id, body);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, {
      params: IdParamsSchema,
      body: PlayerInputSchema,
      response: { 200: PlayerProfileSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema, 500: ErrorSchema },
    })
    .post("/tournaments", async ({ body, set }) => {
      try {
        return await source().createTournament(body);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, {
      body: AdminTournamentInputSchema,
      response: { 200: TournamentSchema, 409: ErrorSchema, 422: ErrorSchema, 500: ErrorSchema },
    })
    .put("/tournaments/:id", async ({ params, body, set }) => {
      try {
        return await source().updateTournament(params.id, body);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, {
      params: IdParamsSchema,
      body: AdminTournamentInputSchema,
      response: { 200: TournamentSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema, 500: ErrorSchema },
    })
    .post("/tournaments/:id/teams", async ({ params, body, set }) => {
      try {
        return await source().createTournamentTeam(params.id, body);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, {
      params: IdParamsSchema,
      body: AdminTeamInputSchema,
      response: { 200: AdminTeamSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema, 500: ErrorSchema },
    })
    .put("/tournaments/:id/teams/:teamId", async ({ params, body, set }) => {
      try {
        return await source().updateTournamentTeam(params.id, params.teamId, body);
      } catch (error) {
        return errorResponse(error, set);
      }
    }, {
      params: t.Object({ id: IdParamsSchema.properties.id, teamId: IdParamsSchema.properties.id }),
      body: AdminTeamInputSchema,
      response: { 200: AdminTeamSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema, 500: ErrorSchema },
    });
}
