import type { Rule, Stage, Weapon } from "./models/catalog";
import type { CatalogDataSource } from "./create-data-source";

const MAX_CATALOG_BYTES = 64 * 1024;

type CatalogItem = {
  id: string;
};

type CatalogIndex<T extends CatalogItem> = {
  items: T[];
  itemsById: Map<string, T>;
};

type CatalogDefinition<T extends CatalogItem> = {
  catalogName: string;
  fileName: string;
  itemName: string;
  properties: readonly string[];
  parseEntry(entry: Record<string, unknown>, index: number): T;
};

type LoadedCatalog<T extends CatalogItem> = CatalogIndex<T> & {
  location: string;
};

type CatalogStore = {
  rules: CatalogIndex<Rule>;
  stages: CatalogIndex<Stage>;
  weapons: CatalogIndex<Weapon>;
};

let store: CatalogDataSource | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyProperties(
  value: Record<string, unknown>,
  properties: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === properties.length &&
    keys.every((key) => properties.includes(key))
  );
}

function requiredString(
  entry: Record<string, unknown>,
  property: string,
  catalogName: string,
  index: number,
): string {
  const value = entry[property];
  if (typeof value !== "string" || !/\S/.test(value)) {
    throw new Error(
      `${catalogName} entry ${index} has an invalid ${property}.`,
    );
  }
  return value;
}

const WEAPON_CATALOG: CatalogDefinition<Weapon> = {
  catalogName: "Weapon catalog",
  fileName: "weapons.json",
  itemName: "weapons",
  properties: ["id", "name"],
  parseEntry(entry, index) {
    const id = requiredString(entry, "id", this.catalogName, index);
    if (!/^\d+$/.test(id)) {
      throw new Error(`${this.catalogName} entry ${index} has an invalid id.`);
    }
    return {
      id,
      name: requiredString(entry, "name", this.catalogName, index),
    };
  },
};

const RULE_CATALOG: CatalogDefinition<Rule> = {
  catalogName: "Rule catalog",
  fileName: "rules.json",
  itemName: "rules",
  properties: ["id", "name", "en", "description"],
  parseEntry(entry, index) {
    return {
      id: requiredString(entry, "id", this.catalogName, index),
      name: requiredString(entry, "name", this.catalogName, index),
      en: requiredString(entry, "en", this.catalogName, index),
      description: requiredString(
        entry,
        "description",
        this.catalogName,
        index,
      ),
    };
  },
};

const STAGE_CATALOG: CatalogDefinition<Stage> = {
  catalogName: "Stage catalog",
  fileName: "stages.json",
  itemName: "stages",
  properties: ["id", "name", "en"],
  parseEntry(entry, index) {
    return {
      id: requiredString(entry, "id", this.catalogName, index),
      name: requiredString(entry, "name", this.catalogName, index),
      en: requiredString(entry, "en", this.catalogName, index),
    };
  },
};

function parseCatalog<T extends CatalogItem>(
  value: unknown,
  definition: CatalogDefinition<T>,
): CatalogIndex<T> {
  if (!Array.isArray(value)) {
    throw new Error(`${definition.catalogName} must be a JSON array.`);
  }
  if (value.length === 0) {
    throw new Error(`${definition.catalogName} must not be empty.`);
  }

  const items: T[] = [];
  const itemsById = new Map<string, T>();

  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      throw new Error(
        `${definition.catalogName} entry ${index} must be an object.`,
      );
    }
    if (!hasOnlyProperties(entry, definition.properties)) {
      throw new Error(
        `${definition.catalogName} entry ${index} has an unexpected property.`,
      );
    }

    const item = definition.parseEntry(entry, index);
    if (itemsById.has(item.id)) {
      throw new Error(
        `${definition.catalogName} contains duplicate id: ${item.id}`,
      );
    }
    items.push(item);
    itemsById.set(item.id, item);
  }

  return { items, itemsById };
}

async function readCatalogJson(
  catalogUrl: URL,
  catalogName: string,
  location: string,
): Promise<unknown> {
  const catalogFile = Bun.file(catalogUrl);
  if (!(await catalogFile.exists())) {
    throw new Error(`${catalogName} is missing from ${location}.`);
  }
  if (catalogFile.size > MAX_CATALOG_BYTES) {
    throw new Error(
      `${catalogName} from ${location} exceeds ${MAX_CATALOG_BYTES} bytes.`,
    );
  }

  const bytes = new Uint8Array(await catalogFile.arrayBuffer());
  if (bytes.byteLength > MAX_CATALOG_BYTES) {
    throw new Error(
      `${catalogName} from ${location} exceeds ${MAX_CATALOG_BYTES} bytes.`,
    );
  }

  return parseCatalogBytes(bytes, catalogName, location);
}

function parseCatalogBytes(
  bytes: Uint8Array,
  catalogName: string,
  location: string,
): unknown {
  if (bytes.byteLength > MAX_CATALOG_BYTES) {
    throw new Error(`${catalogName} from ${location} exceeds ${MAX_CATALOG_BYTES} bytes.`);
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${catalogName} from ${location} is not valid JSON: ${message}`);
  }
}

async function loadCatalog<T extends CatalogItem>(
  definition: CatalogDefinition<T>,
  directory: URL,
): Promise<LoadedCatalog<T>> {
  const catalogUrl = new URL(definition.fileName, directory);
  const location = catalogUrl.pathname;
  const value = await readCatalogJson(catalogUrl, definition.catalogName, location);
  return { ...parseCatalog(value, definition), location };
}

async function loadRemoteCatalog<T extends CatalogItem>(
  definition: CatalogDefinition<T>,
  baseUrl: URL,
): Promise<LoadedCatalog<T>> {
  const url = new URL(definition.fileName, baseUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`${definition.catalogName} download failed: HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${definition.catalogName} from ${url.href} has an invalid content type.`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`${definition.catalogName} from ${url.href} has no response body.`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CATALOG_BYTES) {
      await reader.cancel();
      throw new Error(`${definition.catalogName} from ${url.href} exceeds ${MAX_CATALOG_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = parseCatalogBytes(bytes, definition.catalogName, url.href);
  return { ...parseCatalog(value, definition), location: url.href };
}

function getStore(): CatalogDataSource {
  if (store === null) {
    throw new Error("Catalog store has not been initialized.");
  }
  return store;
}

export async function initializeCatalogStore(): Promise<void> {
  if (store !== null) return;

  const { weapons, rules, stages } = await loadLocalCatalogs(
    new URL("./data/", import.meta.url),
  );

  store = createCatalogDataSource({ weapons, rules, stages });
  for (const [definition, loaded] of [
    [WEAPON_CATALOG, weapons],
    [RULE_CATALOG, rules],
    [STAGE_CATALOG, stages],
  ] as const) {
    console.log(
      `Loaded ${loaded.items.length} ${definition.itemName} from ${loaded.location}`,
    );
  }
}

export async function initializeRemoteCatalogStore(baseUrlValue: string): Promise<void> {
  if (store !== null) return;
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new Error("CATALOG_URL must be a valid HTTPS URL in a Worker.");
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new Error("CATALOG_URL must be an HTTPS URL without credentials in a Worker.");
  }
  baseUrl.pathname = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
  const [weapons, rules, stages] = await Promise.all([
    loadRemoteCatalog(WEAPON_CATALOG, baseUrl),
    loadRemoteCatalog(RULE_CATALOG, baseUrl),
    loadRemoteCatalog(STAGE_CATALOG, baseUrl),
  ]);
  store = createCatalogDataSource({ weapons, rules, stages });
}

function createCatalogDataSource(catalogs: CatalogStore): CatalogDataSource {
  return {
    listWeapons: () => catalogs.weapons.items,
    listRules: () => catalogs.rules.items,
    listStages: () => catalogs.stages.items,
    findRule: (ruleId) => catalogs.rules.itemsById.get(ruleId) ?? null,
    findStage: (stageId) => catalogs.stages.itemsById.get(stageId) ?? null,
    requireWeapon(weaponId, source) {
      const weapon = catalogs.weapons.itemsById.get(weaponId) ?? null;
      if (weapon === null) {
        throw new Error(
          `Weapon catalog does not contain id ${weaponId} referenced by ${source}.`,
        );
      }
      return weapon;
    },
  };
}

async function loadLocalCatalogs(directory: URL) {
  const [weapons, rules, stages] = await Promise.all([
    loadCatalog(WEAPON_CATALOG, directory),
    loadCatalog(RULE_CATALOG, directory),
    loadCatalog(STAGE_CATALOG, directory),
  ]);
  return { weapons, rules, stages };
}

// Load an independent local store without initializing the process-wide singleton.
export async function createLocalCatalogDataSource(directory: URL): Promise<CatalogDataSource> {
  return createCatalogDataSource(await loadLocalCatalogs(directory));
}

export function listWeapons(): Weapon[] {
  return getStore().listWeapons();
}

export function listRules(): Rule[] {
  return getStore().listRules();
}

export function listStages(): Stage[] {
  return getStore().listStages();
}

export function findRule(ruleId: string): Rule | null {
  return getStore().findRule(ruleId);
}

export function findStage(stageId: string): Stage | null {
  return getStore().findStage(stageId);
}

export function requireWeapon(weaponId: string, source: string): Weapon {
  return getStore().requireWeapon(weaponId, source);
}

export const catalogDataSource: CatalogDataSource = {
  listWeapons,
  listRules,
  listStages,
  findRule,
  findStage,
  requireWeapon,
};
