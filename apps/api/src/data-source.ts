import {
  createDataSource,
  type CatalogDataSource,
  type StorageDataSource,
} from "./create-data-source";
import { jsonDataSource } from "./data/queries";
import * as tursoDataSource from "./db/queries";
import {
  findRule,
  findStage,
  listRules,
  listStages,
  listWeapons,
  requireWeapon,
} from "./catalog-store";
import { requireEnvironmentVariable } from "./env";
import { attachWeaponImages } from "./weapon-images";

function selectDataSource(name: string): StorageDataSource {
  switch (name) {
    case "json":
      return jsonDataSource;
    case "turso":
      return tursoDataSource;
    default:
      throw new Error('API_DATA_SOURCE must be either "json" or "turso".');
  }
}

export const dataSourceName = requireEnvironmentVariable("API_DATA_SOURCE");
const selectedDataSource = selectDataSource(dataSourceName);

const catalogDataSource: CatalogDataSource = {
  listWeapons,
  listRules,
  listStages,
  findRule,
  findStage,
  requireWeapon,
};

export const dataSource = createDataSource({
  storageDataSource: selectedDataSource,
  catalogDataSource,
  enrichMatchup: attachWeaponImages,
});
