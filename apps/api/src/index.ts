import { cors } from "@elysia/cors";
import { Elysia } from "elysia";

export type Player = {
  id: string;
  name: string;
  team: string;
};

const players: Player[] = [
  {
    id: "1",
    name: "Alice",
    team: "Team Inkling",
  },
  {
    id: "2",
    name: "Bob",
    team: "Team Octoling",
  },
  {
    id: "3",
    name: "Charlie",
    team: "Team Squid",
  },
];

export const app = new Elysia()
  .use(cors())

  .get("/players", () => players)

  .get("/players/:id", ({ params }) => {
    return players.find((player) => player.id === params.id) ?? null;
  })

  .listen(3000);

export type App = typeof app;

console.log(
  `API running at http://${app.server?.hostname}:${app.server?.port}`,
);
