import { createClient } from "@libsql/client/web";

import { requireEnvironmentVariable } from "../env";

export const databaseUrl = requireEnvironmentVariable("TURSO_DATABASE_URL");

const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url: databaseUrl,
  ...(authToken ? { authToken } : {}),
});
