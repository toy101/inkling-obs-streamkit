import type { SqlValue, Statement } from "./client";
import { CORE_SEED_NAME, createDevelopmentSeedStatements } from "./seed-statements";

function literal(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Seed contains a non-finite number.");
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function guardedInsert({ sql, args = [] }: Statement): string {
  const placeholderCount = sql.match(/\?/g)?.length ?? 0;
  if (placeholderCount !== args.length || !/VALUES\s*\((?:\s*\?\s*,?)+\)\s*$/i.test(sql)) {
    throw new Error("Development seed contains an unsupported SQL statement.");
  }
  const guard = `WHERE NOT EXISTS (SELECT 1 FROM seed_history WHERE name = ${literal(CORE_SEED_NAME)})`;
  return `${sql.replace(/VALUES\s*\((?:\s*\?\s*,?)+\)\s*$/i, `SELECT ${args.map(literal).join(", ")} ${guard}`)};`;
}

export function createLocalSeedSql(): string {
  return `${createDevelopmentSeedStatements().map(guardedInsert).join("\n\n")}\n`;
}
