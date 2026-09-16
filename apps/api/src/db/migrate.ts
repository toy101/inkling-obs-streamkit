import { db } from "./client";

const migrations = [
  "001_initial.sql",
  "002_matchup_catalogs.sql",
  "003_remove_position_display_order.sql",
  "004_remove_roster_profile_snapshots.sql",
  "005_external_weapon_catalog.sql",
  "006_localized_matchup_catalogs.sql",
  "007_rule_descriptions.sql",
  "008_external_matchup_catalogs.sql",
];

export async function migrate() {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL)",
  );

  const { rows } = await db.execute("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));

  for (const name of migrations) {
    if (applied.has(name)) continue;

    const source = await Bun.file(new URL(`./schema/${name}`, import.meta.url)).text();
    // These migrations contain plain SQL statements, without triggers or embedded semicolons.
    const statements = source.split(";").map((sql) => sql.trim()).filter(Boolean);

    await db.batch(
      [...statements, { sql: "INSERT INTO schema_migrations (name) VALUES (?)", args: [name] }],
      "write",
    );
    console.log(`Applied migration: ${name}`);
  }
}

if (import.meta.main) {
  try {
    await migrate();
  } finally {
    db.close();
  }
}
