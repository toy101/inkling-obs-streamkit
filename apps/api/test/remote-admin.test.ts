import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { createApp } from "../src/create-app";
import type { DataSource } from "../src/create-data-source";
import { createD1AdminDataSource } from "../src/db/admin-queries";
import { db } from "../src/db/client";
import type { Weapon } from "../src/models/catalog";
import type { PlayerProfile } from "../src/models/player";

const accountId = "account/with slash";
const databaseId = "database id";
const cloudflareToken = "remote-cloudflare-secret";
const adminToken = "admin-browser-token";
const adminOrigin = "http://localhost:5174";
const weapon: Weapon = { id: "weapon-1", name: "Weapon One" };
const originalFetch = globalThis.fetch;
const originalEnvironment = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.D1_DATABASE_ID,
  token: process.env.CLOUDFLARE_API_TOKEN,
};

type D1Request = {
  url: string;
  authorization: string | null;
  body: Record<string, unknown>;
};

function installFetch(
  handler: (request: D1Request) => Response | Promise<Response>,
): D1Request[] {
  const requests: D1Request[] = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const request = {
        url: input instanceof Request ? input.url : String(input),
        authorization: headers.get("authorization"),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      requests.push(request);
      return handler(request);
    },
    { preconnect: originalFetch.preconnect },
  );
  return requests;
}

function success(results: unknown[]): Response {
  return Response.json({ success: true, result: results });
}

const publicDataSource: DataSource = {
  listWeapons: async () => [weapon],
  listRules: async () => [],
  listStages: async () => [],
  listPlayers: async () => [],
  listTournaments: async () => [],
  listTournamentTeams: async () => [],
  getOverlayParticipants: async () => null,
  getOverlayMatchup: async () => null,
};

function adminDataSource() {
  return createD1AdminDataSource(db, {
    requireWeapon(weaponId) {
      if (weaponId !== weapon.id) throw new Error("Unknown weapon.");
      return weapon;
    },
  });
}

function adminApp() {
  return createApp({
    dataSource: publicDataSource,
    webOrigins: ["http://localhost:5173"],
    admin: {
      dataSource: adminDataSource(),
      token: adminToken,
      origins: [adminOrigin],
      environment: "production",
    },
  });
}

function adminWrite(app: ReturnType<typeof adminApp>, headers: HeadersInit): Promise<Response> {
  return app.handle(new Request("http://api.test/admin/players", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      displayName: "Remote player",
      iconUrl: null,
      positionId: null,
      weaponIds: [],
    }),
  }));
}

beforeEach(() => {
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  process.env.D1_DATABASE_ID = databaseId;
  process.env.CLOUDFLARE_API_TOKEN = cloudflareToken;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    CLOUDFLARE_ACCOUNT_ID: originalEnvironment.accountId,
    D1_DATABASE_ID: originalEnvironment.databaseId,
    CLOUDFLARE_API_TOKEN: originalEnvironment.token,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe.serial("remote D1 admin adapter", () => {
  test("writes normalized team status through a parameterized HTTP batch", async () => {
    const requests = installFetch((request) => {
      const batch = request.body.batch;
      if (Array.isArray(batch)) {
        return success(batch.map(() => ({ success: true, results: [] })));
      }
      const query = request.body as { sql: string; params: string[] };
      if (query.sql.includes("SELECT * FROM tournaments")) {
        return success([{
          success: true,
          results: [{
            id: "tournament-1",
            organizer_user_id: "local-admin",
            name: "Tournament",
            status: "draft",
            created_at: "2026-10-13T00:00:00.000Z",
            updated_at: "2026-10-13T00:00:00.000Z",
          }],
        }]);
      }
      return success([{ success: true, results: [] }]);
    });

    const created = await adminDataSource().createTournamentTeam("tournament-1", {
      name: "Remote hidden team",
      displayOrder: 1,
      status: "hidden",
      roster: [],
    });

    expect(created.status).toBe("hidden");
    const batchRequest = requests.find((request) => Array.isArray(request.body.batch));
    const statements = batchRequest?.body.batch as Array<{
      sql: string;
      params: string[];
    }>;
    expect(statements[0]?.sql).toContain("(id, tournament_id, name, display_order, status)");
    expect(statements[0]?.params).toEqual([
      created.id,
      "tournament-1",
      "Remote hidden team",
      "1",
      "hidden",
    ]);
  });

  test("creates and updates a player through parameterized HTTP batches", async () => {
    let playerId = "";
    let displayName = "";
    let weaponId: string | null = null;
    const requests = installFetch((request) => {
      const batch = request.body.batch;
      if (Array.isArray(batch)) {
        const first = batch[0] as { sql: string; params: string[] };
        if (first.sql.includes("INSERT INTO players")) {
          [playerId, , displayName] = first.params;
          weaponId = "weapon-1";
        } else {
          [displayName] = first.params;
          weaponId = null;
        }
        return success(batch.map(() => ({ success: true, results: [] })));
      }

      const query = request.body as { sql: string; params: string[] };
      if (query.sql.includes("SELECT * FROM players")) {
        return success([{
          success: true,
          results: [{
            id: playerId,
            owner_user_id: "local-admin",
            display_name: displayName,
            icon_url: null,
            position_id: null,
            created_at: "2026-10-13T00:00:00.000Z",
            updated_at: "2026-10-13T00:00:00.000Z",
          }],
        }]);
      }
      return success([{
        success: true,
        results: [{
          id: playerId,
          display_name: displayName,
          icon_url: null,
          position_id: null,
          position_name: null,
          weapon_id: weaponId,
        }],
      }]);
    });

    const source = adminDataSource();
    const created = await source.createPlayer({
      displayName: "Created remotely",
      iconUrl: null,
      positionId: null,
      weaponIds: [weapon.id],
    });
    expect(created).toMatchObject({
      displayName: "Created remotely",
      iconUrl: null,
      position: null,
      weaponIds: [weapon.id],
    });

    const updated = await source.updatePlayer(created.id, {
      displayName: "Updated remotely",
      iconUrl: null,
      positionId: null,
      weaponIds: [],
    });
    expect(updated).toMatchObject({
      id: created.id,
      displayName: "Updated remotely",
      weaponIds: [],
    });

    const expectedEndpoint = "https://api.cloudflare.com/client/v4/accounts/"
      + `${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
    expect(requests.every((request) => request.url === expectedEndpoint)).toBe(true);
    expect(requests.every(
      (request) => request.authorization === `Bearer ${cloudflareToken}`,
    )).toBe(true);
    expect(requests.some((request) => JSON.stringify(request.body).includes(cloudflareToken))).toBe(false);

    const createBatch = requests.find((request) => Array.isArray(request.body.batch));
    const createStatements = createBatch?.body.batch as Array<{
      sql: string;
      params: string[];
    }>;
    expect(createStatements[0]?.sql).toContain("VALUES (?, ?, ?, NULL, NULL, ?, ?)");
    expect(createStatements[0]?.params).not.toContain("null");
    expect(createStatements[1]).toMatchObject({ params: [created.id, weapon.id, "1"] });
  });

  test("keeps failed upstream details on the server and returns a generic 500", async () => {
    const requests = installFetch(() => Response.json(
      { success: false, errors: [{ message: "remote credential rejected: secret detail" }] },
      { status: 401 },
    ));
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    const response = await adminWrite(adminApp(), {
      authorization: `Bearer ${adminToken}`,
      origin: adminOrigin,
    });

    expect(response.status).toBe(500);
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({ message: "Admin operation failed." });
    expect(errorLog).toHaveBeenCalledWith(
      "Admin operation failed.",
      expect.objectContaining({
        message: "D1 request failed (HTTP 401): remote credential rejected: secret detail",
      }),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.authorization).toBe(`Bearer ${cloudflareToken}`);
    expect(responseText).not.toContain("secret detail");
    errorLog.mockRestore();
  });

  test("rejects unauthenticated and wrong-origin writes before D1 access", async () => {
    const requests = installFetch(() => {
      throw new Error("D1 must not be called for rejected writes.");
    });
    const app = adminApp();

    const unauthorized = await adminWrite(app, { origin: adminOrigin });
    expect(unauthorized.status).toBe(401);
    const forbidden = await adminWrite(app, {
      authorization: `Bearer ${adminToken}`,
      origin: "http://evil.test",
    });
    expect(forbidden.status).toBe(403);
    expect(requests).toEqual([]);
  });
});
