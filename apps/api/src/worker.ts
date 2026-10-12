import { env } from "cloudflare:workers";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

import { catalogDataSource, initializeRemoteCatalogStore } from "./catalog-store";
import { createApp } from "./create-app";
import { createDataSource } from "./create-data-source";
import { createD1StorageDataSource } from "./db/queries";
import { createWorkerDatabase } from "./db/worker-client";
import { parseHttpsOrigin, parseOriginList } from "./env";
import { createWeaponImageEnricher } from "./weapon-images";

const workerEnv = env;

function createWorkerApp() {
  if (typeof workerEnv.DB?.prepare !== "function") {
    throw new Error("The DB D1 binding is required.");
  }
  const webOrigins = parseOriginList(workerEnv.CORS_ALLOWED_ORIGINS, "CORS_ALLOWED_ORIGINS");
  const imageOrigin = parseHttpsOrigin(workerEnv.IKACLO_API_ORIGIN, "IKACLO_API_ORIGIN");
  const dataSource = createDataSource({
    storageDataSource: createD1StorageDataSource(
      createWorkerDatabase(workerEnv.DB),
      catalogDataSource,
    ),
    catalogDataSource,
    enrichMatchup: createWeaponImageEnricher(imageOrigin),
  });
  return createApp({
    dataSource,
    webOrigins,
    adapter: CloudflareAdapter,
  }).compile();
}

const app = createWorkerApp();
let catalogPromise: Promise<void> | null = null;

export default {
  async fetch(request: Request): Promise<Response> {
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
