import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify } from "yaml";

import { createApp } from "../apps/api/src/create-app";
import type { DataSource } from "../apps/api/src/create-data-source";

const workspaceRoot = resolve(import.meta.dir, "..");
const outputDirectory = resolve(workspaceRoot, "dist/openapi");
const viewerSource = resolve(workspaceRoot, "apps/api/openapi/index.html");

function unavailable(): never {
  throw new Error("Runtime data is unavailable during OpenAPI generation.");
}

const schemaOnlyDataSource: DataSource = {
  listPlayers: async () => unavailable(),
  listTournaments: async () => unavailable(),
  listTournamentTeams: async () => unavailable(),
  getOverlayParticipants: async () => unavailable(),
  listWeapons: async () => unavailable(),
  listRules: async () => unavailable(),
  listStages: async () => unavailable(),
  getOverlayMatchup: async () => unavailable(),
};

const app = createApp({
  dataSource: schemaOnlyDataSource,
  webOrigins: ["https://example.invalid"],
});

function isOpenApiDocument(value: unknown): value is { openapi: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "openapi" in value &&
    typeof value.openapi === "string"
  );
}

const response = await app.handle(
  new Request("http://localhost/openapi/json"),
);
if (!response.ok) {
  throw new Error(
    `Failed to generate OpenAPI document: ${response.status} ${response.statusText}`,
  );
}

const document: unknown = await response.json();
if (!isOpenApiDocument(document)) {
  throw new Error("Generated document does not contain an OpenAPI version.");
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  Bun.write(
    resolve(outputDirectory, "openapi.yaml"),
    stringify(document, { lineWidth: 0 }),
  ),
  Bun.write(resolve(outputDirectory, "index.html"), Bun.file(viewerSource)),
]);

console.info(`Generated ${resolve(outputDirectory, "openapi.yaml")}`);
