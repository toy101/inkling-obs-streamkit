import { cors } from "@elysia/cors";
import { Elysia } from "elysia";

import { dataSource } from "./data-source";
import { readOriginListEnvironmentVariable } from "./env";
import { models } from "./models";

const webOrigins = readOriginListEnvironmentVariable("CORS_ALLOWED_ORIGINS");

export const app = new Elysia()
  .use(
    cors({
      credentials: false,
      methods: ["GET"],
      origin: webOrigins,
    }),
  )
  .use(models)
  .get("/weapons", () => dataSource.listWeapons(), {
    response: "weapon.list",
  })
  .get("/rules", () => dataSource.listRules(), {
    response: "rule.list",
  })
  .get("/stages", () => dataSource.listStages(), {
    response: "stage.list",
  })
  .get("/players", () => dataSource.listPlayers(null), {
    response: "player.profile.list",
  })
  .get("/tournaments", () => dataSource.listTournaments(), {
    response: "tournament.list",
  })
  .get(
    "/tournaments/:id/teams",
    ({ params }) => dataSource.listTournamentTeams(params.id),
    {
      params: "common.idParams",
      response: "tournament.team.list",
    },
  )
  .get(
    "/overlay/participants",
    ({ query }) => dataSource.getOverlayParticipants(query),
    {
      query: "overlay.teamsQuery",
      response: "overlay.participants",
    },
  )
  .get(
    "/overlay/matchup",
    ({ query }) => dataSource.getOverlayMatchup(query),
    {
      query: "overlay.query",
      response: "overlay.matchup",
    },
  )
  .get(
    "/players/:id",
    async ({ params }) => (await dataSource.listPlayers(params.id))[0] ?? null,
    {
      params: "common.idParams",
      response: "player.profile.detail",
    },
  );

export type App = typeof app;
