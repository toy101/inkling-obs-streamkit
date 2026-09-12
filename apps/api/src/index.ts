import { app } from "./app";
import { dataSourceName } from "./data-source";
import {
  readPortEnvironmentVariable,
  requireEnvironmentVariable,
} from "./env";
import { initializeWeaponCatalog } from "./weapon-catalog";

export { app } from "./app";
export type { App } from "./app";
export type { Player } from "./models/player";

await initializeWeaponCatalog();

app.listen({
  hostname: requireEnvironmentVariable("API_HOST"),
  port: readPortEnvironmentVariable("API_PORT"),
});

console.log(
  `API running at http://${app.server?.hostname}:${app.server?.port} (data source: ${dataSourceName})`,
);
