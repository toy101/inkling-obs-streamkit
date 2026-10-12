import { requireEnvironmentVariable } from "../env";

export type Row = Record<string, unknown>;
export type SqlValue = string | number | null;
export type Statement = { sql: string; args?: readonly SqlValue[] };

type D1Query = { sql: string; params: string[] };
type D1Result = { results: Row[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRowArray(value: unknown): value is Row[] {
  return Array.isArray(value) && value.every(isRecord);
}

function prepare(statement: string | Statement): D1Query {
  const { sql, args = [] } = typeof statement === "string"
    ? { sql: statement, args: [] }
    : statement;
  const params: string[] = [];
  let index = 0;
  const preparedSql = sql.replaceAll("?", () => {
    const value = args[index++];
    if (value === null) return "NULL";
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("D1 query parameter must be finite.");
    }
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error("D1 query parameter count does not match SQL placeholders.");
    }
    params.push(String(value));
    return "?";
  });
  if (index !== args.length) {
    throw new Error("D1 query parameter count does not match SQL placeholders.");
  }
  return { sql: preparedSql, params };
}

async function query(body: D1Query | { batch: D1Query[] }, expectedResults: number): Promise<D1Result[]> {
  const accountId = requireEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = requireEnvironmentVariable("D1_DATABASE_ID");
  const apiToken = requireEnvironmentVariable("CLOUDFLARE_API_TOKEN");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error("D1 returned an invalid response.");

  const errors = Array.isArray(payload.errors)
    ? payload.errors.flatMap((error) => isRecord(error) && typeof error.message === "string" ? [error.message] : [])
    : [];
  if (!response.ok || payload.success !== true) {
    throw new Error(`D1 request failed (HTTP ${response.status}): ${errors.join("; ") || "unknown error"}`);
  }
  if (!Array.isArray(payload.result) || payload.result.length !== expectedResults) {
    throw new Error("D1 returned an unexpected number of results.");
  }
  return payload.result.map((result: unknown) => {
    if (!isRecord(result) || result.success !== true) {
      throw new Error("D1 query failed.");
    }
    if (result.results !== undefined && !isRowArray(result.results)) {
      throw new Error("D1 returned invalid rows.");
    }
    return { results: result.results ?? [] };
  });
}

export const db = {
  async execute(statement: string | Statement): Promise<{ rows: Row[] }> {
    const [result] = await query(prepare(statement), 1);
    if (!result) throw new Error("D1 returned no query result.");
    return { rows: result.results };
  },
  async batch(statements: readonly (string | Statement)[]): Promise<void> {
    if (statements.length === 0) return;
    await query({ batch: statements.map(prepare) }, statements.length);
  },
};
