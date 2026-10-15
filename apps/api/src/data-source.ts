import {
  createDataSource,
  type StorageDataSource,
} from "./create-data-source";
import { jsonDataSource } from "./data/queries";
import { createD1StorageDataSource } from "./db/queries";
import { createD1AdminDataSource } from "./db/admin-queries";
import { db } from "./db/client";
import { catalogDataSource, requireWeapon } from "./catalog-store";
import { readHttpsOriginEnvironmentVariable, requireEnvironmentVariable } from "./env";
import { createWeaponImageEnricher } from "./weapon-images";

function selectDataSource(name: string): StorageDataSource {
  switch (name) {
    case "json":
      return jsonDataSource;
    case "d1":
      requireEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
      requireEnvironmentVariable("D1_DATABASE_ID");
      requireEnvironmentVariable("CLOUDFLARE_API_TOKEN");
      return createD1StorageDataSource(db, { requireWeapon });
    default:
      throw new Error('API_DATA_SOURCE must be either "json" or "d1".');
  }
}

export const dataSourceName = requireEnvironmentVariable("API_DATA_SOURCE");
const selectedDataSource = selectDataSource(dataSourceName);

// Management always targets D1; JSON remains the existing read-only workflow.
export const adminDataSource = dataSourceName === "d1"
  ? createD1AdminDataSource(db, { requireWeapon })
  : null;

export const dataSource = createDataSource({
  storageDataSource: selectedDataSource,
  catalogDataSource,
  enrichMatchup: createWeaponImageEnricher(
    readHttpsOriginEnvironmentVariable("IKACLO_API_ORIGIN"),
  ),
});
