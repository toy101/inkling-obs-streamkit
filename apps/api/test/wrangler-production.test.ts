import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseProductionConfig,
  runProductionAction,
  writeProductionVars,
  type WranglerRunner,
} from "../src/db/wrangler-production";

const accountId = "0123456789abcdef0123456789abcdef";
const databaseId = "12345678-1234-4234-9234-123456789abc";
const migrations = ["001_initial.sql", "002_second.sql"];
const roots: string[] = [];

type FakeDatabase = {
  tables: string[];
  legacy: string[];
  wrangler: string[];
};

type Call = {
  args: string[];
  capture: boolean;
  environment: Record<string, string>;
};

function config(overrides = ""): string {
  return `name = "inkling-api-production"
main = "src/worker.ts"
compatibility_date = "2026-09-28"
account_id = "${accountId}"

[env.production.vars]
ADMIN_ENVIRONMENT = "production"

[[env.production.d1_databases]]
binding = "DB"
database_name = "inkling-production"
database_id = "${databaseId}"
remote = true
migrations_dir = "src/db/migrations"
migrations_table = "d1_migrations"
${overrides}`;
}

async function makeApiRoot(configSource = config()): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "inkling-wrangler-production-"));
  roots.push(root);
  await mkdir(join(root, "src/db/migrations"), { recursive: true });
  await Bun.write(join(root, "wrangler.production.toml"), configSource);
  for (const name of migrations) await Bun.write(join(root, "src/db/migrations", name), "SELECT 1;\n");
  return root;
}

function fakeRunner(database: FakeDatabase, calls: Call[]): WranglerRunner {
  return async (args, options) => {
    const current = [...args];
    calls.push({ args: current, capture: options.capture, environment: options.env });
    const commandIndex = current.indexOf("--command");
    const sql = commandIndex >= 0 ? current[commandIndex + 1] ?? "" : "";
    if (current[0] === "d1" && current[1] === "info") {
      return { exitCode: 0, stdout: JSON.stringify({ uuid: databaseId, name: "inkling-production" }), stderr: "" };
    }
    if (sql.includes("sqlite_master")) {
      return { exitCode: 0, stdout: JSON.stringify([{ success: true, results: database.tables.map((name) => ({ name })) }]), stderr: "" };
    }
    if (sql.includes("SELECT name FROM schema_migrations")) {
      return { exitCode: 0, stdout: JSON.stringify([{ success: true, results: database.legacy.map((name) => ({ name })) }]), stderr: "" };
    }
    if (sql.includes("SELECT name FROM d1_migrations")) {
      return { exitCode: 0, stdout: JSON.stringify([{ success: true, results: database.wrangler.map((name) => ({ name })) }]), stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("production Wrangler runtime", () => {
  test("accepts the tracked production template after identifiers are filled in", async () => {
    const template = await Bun.file(
      new URL("../wrangler.production.example.toml", import.meta.url),
    ).text();
    const source = template
      .replace("YOUR_CLOUDFLARE_ACCOUNT_ID", accountId)
      .replace("YOUR_PRODUCTION_D1_DATABASE_NAME", "inkling-production")
      .replace("YOUR_PRODUCTION_D1_DATABASE_ID", databaseId);
    expect(parseProductionConfig(source).binding.databaseName).toBe("inkling-production");
  });

  test("rejects placeholder, local, and malformed production bindings before running Wrangler", () => {
    expect(() => parseProductionConfig(config().replace(databaseId, "00000000-0000-0000-0000-000000000001"))).toThrow("local dummy");
    expect(() => parseProductionConfig(config().replace("inkling-production", "<DATABASE_NAME>"))).toThrow("placeholder");
    expect(() => parseProductionConfig(config().replace("remote = true", "remote = false"))).toThrow("remote = true");
    expect(() => parseProductionConfig(config().replace(accountId, "not-an-account"))).toThrow("32-character hexadecimal");
    const mismatchedEnvironment = config().replace(
      "[env.production.vars]",
      '[env.production]\naccount_id = "ffffffffffffffffffffffffffffffff"\n\n[env.production.vars]',
    );
    expect(() => parseProductionConfig(mismatchedEnvironment)).toThrow("must match");
  });

  test("writes production-only Worker variables and refuses to overwrite a manual file", async () => {
    const root = await makeApiRoot();
    await Bun.write(join(root, ".env.local"), [
      "CATALOG_URL=https://catalog.example/assets/",
      "IKACLO_API_ORIGIN=https://ikaclo.example",
      "ADMIN_API_TOKEN=admin-secret",
      "CLOUDFLARE_API_TOKEN=must-not-be-copied",
    ].join("\n"));

    const path = await writeProductionVars(root, {});
    const source = await Bun.file(path).text();
    expect(source).toContain('ADMIN_ENVIRONMENT="production"');
    expect(source).toContain("http://localhost:5173,http://127.0.0.1:5173");
    expect(source).toContain("http://localhost:5174,http://127.0.0.1:5174");
    expect(source).toContain('ADMIN_API_TOKEN="admin-secret"');
    expect(source).not.toContain("must-not-be-copied");
    expect((await stat(path)).mode & 0o777).toBe(0o600);

    await Bun.write(path, "MANUAL=1\n");
    await expect(writeProductionVars(root, {})).rejects.toThrow("was not generated");
  });

  test("stops before Wrangler when legacy Cloudflare credentials or account overrides are present", async () => {
    const root = await makeApiRoot();
    await Bun.write(join(root, ".env.local"), "CLOUDFLARE_API_TOKEN=legacy-token\n");
    const fileCalls: Call[] = [];
    await expect(runProductionAction("check", {
      apiRoot: root,
      runner: fakeRunner({ tables: [], legacy: [], wrangler: [] }, fileCalls),
      environment: {},
      log() {},
    })).rejects.toThrow("wrangler login");
    expect(fileCalls).toHaveLength(0);

    await Bun.write(join(root, ".env.local"), "# no legacy Cloudflare variables\n");
    const shellCalls: Call[] = [];
    await expect(runProductionAction("migrate", {
      apiRoot: root,
      runner: fakeRunner({ tables: [], legacy: [], wrangler: [] }, shellCalls),
      environment: { CF_ACCOUNT_ID: "legacy-account" },
      log() {},
    })).rejects.toThrow("CF_ACCOUNT_ID");
    expect(shellCalls).toHaveLength(0);
  });

  test("copies validated legacy history into Wrangler metadata without deleting it", async () => {
    const root = await makeApiRoot();
    const calls: Call[] = [];
    const runner = fakeRunner({
      tables: ["players", "schema_migrations"],
      legacy: [...migrations],
      wrangler: [],
    }, calls);

    await runProductionAction("migrate", { apiRoot: root, runner, environment: {}, log() {} });

    const sync = calls.find((call) => call.args.includes("--command") && call.args.join(" ").includes("CREATE TABLE IF NOT EXISTS d1_migrations"));
    expect(sync?.args.join(" ")).toContain("INSERT INTO d1_migrations (name) VALUES ('001_initial.sql')");
    expect(sync?.args.join(" ")).toContain("INSERT INTO d1_migrations (name) VALUES ('002_second.sql')");
    expect(sync?.args.join(" ")).not.toContain("DROP TABLE schema_migrations");
    expect(calls[calls.length - 1]?.args).toEqual([
      "d1", "migrations", "apply", "inkling-production", "--remote",
      "--config", "wrangler.production.toml", "--env", "production",
    ]);
    expect(calls.every((call) => call.environment.CI === undefined)).toBe(true);
  });

  test("rejects unknown legacy history and existing application tables without history", async () => {
    const root = await makeApiRoot();
    const unknownCalls: Call[] = [];
    await expect(runProductionAction("migrate", {
      apiRoot: root,
      runner: fakeRunner({ tables: ["schema_migrations"], legacy: ["999_future.sql"], wrangler: [] }, unknownCalls),
      environment: {},
      log() {},
    })).rejects.toThrow("unknown migrations");
    expect(unknownCalls.some((call) => call.args.includes("apply"))).toBe(false);

    const missingCalls: Call[] = [];
    await expect(runProductionAction("migrate", {
      apiRoot: root,
      runner: fakeRunner({
        tables: ["players", "schema_migrations", "d1_migrations"],
        legacy: [],
        wrangler: [],
      }, missingCalls),
      environment: {},
      log() {},
    })).rejects.toThrow("no applied migration history");
    expect(missingCalls.some((call) => call.args.includes("apply"))).toBe(false);
  });

  test("migrates an empty database remotely and never seeds automatically", async () => {
    const root = await makeApiRoot();
    const calls: Call[] = [];
    await runProductionAction("migrate", {
      apiRoot: root,
      runner: fakeRunner({ tables: [], legacy: [], wrangler: [] }, calls),
      environment: {},
      log() {},
    });

    const apply = calls.find((call) => call.args.includes("apply"));
    expect(apply?.args).toContain("--remote");
    expect(apply?.args).toContain("production");
    expect(calls.some((call) => call.args.includes("--file"))).toBe(false);
  });

  test("requires explicit seed opt-in before migration and then executes the generated seed file", async () => {
    const root = await makeApiRoot();
    const rejectedCalls: Call[] = [];
    await expect(runProductionAction("seed", {
      apiRoot: root,
      runner: fakeRunner({ tables: [], legacy: [], wrangler: [] }, rejectedCalls),
      environment: {},
      log() {},
    })).rejects.toThrow("D1_SEED_DEVELOPMENT_DATA=1");
    expect(rejectedCalls).toHaveLength(0);

    const calls: Call[] = [];
    await runProductionAction("seed", {
      apiRoot: root,
      runner: fakeRunner({ tables: [], legacy: [], wrangler: [] }, calls),
      environment: { D1_SEED_DEVELOPMENT_DATA: "1" },
      log() {},
    });
    const applyIndex = calls.findIndex((call) => call.args.includes("apply"));
    const seedIndex = calls.findIndex((call) => call.args.includes("--file"));
    expect(seedIndex).toBeGreaterThan(applyIndex);
    expect(calls[seedIndex]?.args).toContain("--remote");
  });

  test("check reports blocked legacy-free databases without mutating them", async () => {
    const root = await makeApiRoot();
    const calls: Call[] = [];
    const logs: string[] = [];
    await runProductionAction("check", {
      apiRoot: root,
      runner: fakeRunner({ tables: ["players"], legacy: [], wrangler: [] }, calls),
      environment: {},
      log(message) { logs.push(message); },
    });
    expect(logs.join("\n")).toContain("blocked");
    expect(calls.every((call) => call.capture)).toBe(true);
    expect(calls.some((call) => call.args.includes("--remote"))).toBe(true);
  });
});
