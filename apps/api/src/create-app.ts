import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";

import apiPackage from "../package.json" with { type: "json" };
import type { DataSource } from "./create-data-source";
import { models } from "./models";

type CreateAppOptions = {
  dataSource: DataSource;
  webOrigins: string[];
};

export function createApp({ dataSource, webOrigins }: CreateAppOptions) {
  return new Elysia()
    .use(
      cors({
        credentials: false,
        methods: ["GET"],
        origin: webOrigins,
      }),
    )
    .use(models)
    .use(
      openapi({
        documentation: {
          info: {
            title: "Inkling OBS Streamkit API",
            version: apiPackage.version,
          },
        },
      }),
    )
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
}
