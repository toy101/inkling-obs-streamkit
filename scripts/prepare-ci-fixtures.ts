import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

if (process.env.CI !== "true") {
  throw new Error("This script is only for the CI quality workflow.");
}

const workspaceRoot = resolve(import.meta.dir, "..");
const apiDataDirectory = resolve(workspaceRoot, "apps/api/src/data");
const webPublicDirectory = resolve(workspaceRoot, "apps/web/public");
const emptyTournamentData = JSON.stringify(
  {
    tournaments: [],
    tournamentTeams: [],
    tournamentRosterEntries: [],
  },
  null,
  2,
);
const catalogFixture = "[]\n";
const stageRevealVignette = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

await mkdir(apiDataDirectory, { recursive: true });
await mkdir(webPublicDirectory, { recursive: true });

await Promise.all([
  Bun.write(resolve(apiDataDirectory, "players.json"), catalogFixture),
  Bun.write(resolve(apiDataDirectory, "rules.json"), catalogFixture),
  Bun.write(resolve(apiDataDirectory, "stages.json"), catalogFixture),
  Bun.write(resolve(apiDataDirectory, "weapons.json"), catalogFixture),
  Bun.write(
    resolve(apiDataDirectory, "tournaments.json"),
    `${emptyTournamentData}\n`,
  ),
  Bun.write(
    resolve(webPublicDirectory, "stage-reveal-vignette.png"),
    stageRevealVignette,
  ),
]);

console.info("Prepared deterministic CI runtime fixtures.");
