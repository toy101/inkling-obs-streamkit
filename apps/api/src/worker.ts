import { env } from "cloudflare:workers";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

import { catalogDataSource, initializeRemoteCatalogStore } from "./catalog-store";
import { createApp } from "./create-app";
import { createDataSource } from "./create-data-source";
import { createD1StorageDataSource } from "./db/queries";
import { createD1AdminDataSource } from "./db/admin-queries";
import { createWorkerDatabase } from "./db/worker-client";
import { parseHttpsOrigin, parseOriginList } from "./env";
import { createWeaponImageEnricher } from "./weapon-images";

const workerEnv = env;

function createWorkerApp() {
  const webOrigins = parseOriginList(workerEnv.CORS_ALLOWED_ORIGINS, "CORS_ALLOWED_ORIGINS");
  const imageOrigin = parseHttpsOrigin(workerEnv.IKACLO_API_ORIGIN, "IKACLO_API_ORIGIN");
  const database = createWorkerDatabase({
    prepare(sql) {
      return workerEnv.DB.prepare(sql);
    },
    batch(statements) {
      return workerEnv.DB.batch(statements);
    },
  });
  const dataSource = createDataSource({
    storageDataSource: createD1StorageDataSource(
      database,
      catalogDataSource,
    ),
    catalogDataSource,
    enrichMatchup: createWeaponImageEnricher(imageOrigin),
  });
  return createApp({
    dataSource,
    webOrigins,
    adapter: CloudflareAdapter,
    admin: {
      dataSource: createD1AdminDataSource(database, catalogDataSource),
      token: workerEnv.ADMIN_API_TOKEN?.trim() ?? "",
      origins: parseOriginList(
        workerEnv.ADMIN_ALLOWED_ORIGINS ?? "http://localhost:5174,http://127.0.0.1:5174",
        "ADMIN_ALLOWED_ORIGINS",
      ),
      environment: workerEnv.ADMIN_ENVIRONMENT ?? "production",
    },
  }).compile();
}

const app = createWorkerApp();
let catalogPromise: Promise<void> | null = null;

export default {
  async fetch(request: Request): Promise<Response> {
    if (typeof workerEnv.DB?.prepare !== "function") {
      console.error("The DB D1 binding is required.");
      return new Response("API database binding is unavailable.", {
        status: 503,
      });
    }

    catalogPromise ??= initializeRemoteCatalogStore(workerEnv.CATALOG_URL);
    try {
      await catalogPromise;
    } catch (error) {
      catalogPromise = null;
      console.error("API Worker initialization failed.", error);
      return new Response("API initialization failed.", { status: 503 });
    }
    return app.handle(request);
  },
};
