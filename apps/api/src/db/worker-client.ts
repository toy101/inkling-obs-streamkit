import type { Row, SqlValue, Statement } from "./client";
import type { QueryDatabase } from "./queries";

type PreparedStatement = {
  bind(...values: SqlValue[]): PreparedStatement;
  all(): Promise<{ results: Row[] }>;
};

export type D1Binding = {
  prepare(sql: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown[]>;
};

function prepare(binding: D1Binding, statement: string | Statement): PreparedStatement {
  const { sql, args = [] } = typeof statement === "string"
    ? { sql: statement, args: [] }
    : statement;
  const prepared = binding.prepare(sql);
  return args.length > 0 ? prepared.bind(...args) : prepared;
}

export function createWorkerDatabase(binding: D1Binding): QueryDatabase {
  return {
    async execute(statement: string | Statement) {
      const result = await prepare(binding, statement).all();
      return { rows: result.results };
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await binding.batch(statements.map((statement) => prepare(binding, statement)));
    },
  };
}
