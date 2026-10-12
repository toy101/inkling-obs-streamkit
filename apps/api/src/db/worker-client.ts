import type { Row, SqlValue, Statement } from "./client";
import type { QueryDatabase } from "./queries";

type PreparedStatement = {
  bind(...values: SqlValue[]): PreparedStatement;
  all(): Promise<{ results: Row[] }>;
};

export type D1Binding = {
  prepare(sql: string): PreparedStatement;
};

export function createWorkerDatabase(binding: D1Binding): QueryDatabase {
  return {
    async execute(statement: string | Statement) {
      const { sql, args = [] } = typeof statement === "string"
        ? { sql: statement, args: [] }
        : statement;
      const prepared = binding.prepare(sql);
      const result = await (args.length > 0 ? prepared.bind(...args) : prepared).all();
      return { rows: result.results };
    },
  };
}
