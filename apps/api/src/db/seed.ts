import { db } from "./client";
import { migrate } from "./migrate";
import { CORE_SEED_NAME, createDevelopmentSeedStatements } from "./seed-statements";

async function seed() {
  if (process.env.D1_SEED_DEVELOPMENT_DATA !== "1") {
    throw new Error("Set D1_SEED_DEVELOPMENT_DATA=1 to seed the selected D1 database.");
  }

  await migrate();

  const { rows } = await db.execute("SELECT name FROM seed_history");
  const appliedSeedNames = new Set(
    rows.flatMap((row) => typeof row.name === "string" ? [row.name] : []),
  );
  const shouldSeedCore = !appliedSeedNames.has(CORE_SEED_NAME);

  if (!shouldSeedCore) {
    console.log("Development data already seeded; existing data was preserved.");
    return;
  }

  await db.batch(createDevelopmentSeedStatements());
  console.log("Seeded development core data.");
}

await seed();
