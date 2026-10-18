import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

if (process.env.CI !== "true") {
  throw new Error("This script is only for CI workflows.");
}

const workspaceRoot = resolve(import.meta.dir, "..");
const apiDataDirectory = resolve(workspaceRoot, "apps/api/src/data");
const webPublicDirectory = resolve(workspaceRoot, "apps/web/public");
const stageRevealVideoFixture = resolve(
  workspaceRoot,
  "apps/web/e2e/fixtures/stage-reveal.webm",
);
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
  Bun.write(
    resolve(webPublicDirectory, "stage-background-default.webm"),
    Bun.file(stageRevealVideoFixture),
  ),
]);

console.info("Prepared deterministic CI runtime fixtures.");
