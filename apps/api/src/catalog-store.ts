import { requireEnvironmentVariable } from "./env";
import type { Rule, Stage, Weapon } from "./models/catalog";

const MAX_CATALOG_BYTES = 64 * 1024;
const CATALOG_TIMEOUT_MS = 10_000;

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

let store: CatalogStore | null = null;

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

function parseCatalogBaseUrl(): URL {
  const value = requireEnvironmentVariable("CATALOG_URL");
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("CATALOG_URL must be a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("CATALOG_URL must use HTTP or HTTPS.");
  }
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url;
}

function catalogLocation(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

async function readCatalogJson(
  response: Response,
  catalogName: string,
  location: string,
): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_CATALOG_BYTES) {
      throw new Error(
        `${catalogName} from ${location} exceeds ${MAX_CATALOG_BYTES} bytes.`,
      );
    }
  }

  if (response.body === null) {
    throw new Error(`${catalogName} from ${location} has no response body.`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;

    receivedBytes += result.value.byteLength;
    if (receivedBytes > MAX_CATALOG_BYTES) {
      await reader.cancel();
      throw new Error(
        `${catalogName} from ${location} exceeds ${MAX_CATALOG_BYTES} bytes.`,
      );
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${catalogName} from ${location} is not valid JSON: ${message}`,
    );
  }
}

async function loadCatalog<T extends CatalogItem>(
  definition: CatalogDefinition<T>,
  baseUrl: URL,
): Promise<LoadedCatalog<T>> {
  const catalogUrl = new URL(definition.fileName, baseUrl);
  const location = catalogLocation(catalogUrl);
  let response: Response;

  try {
    response = await fetch(catalogUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UnknownError";
    throw new Error(
      `Failed to fetch ${definition.catalogName} from ${location}: ${reason}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${definition.catalogName} from ${location}: HTTP ${response.status}`,
    );
  }

  const contentType = response.headers.get("content-type");
  if (contentType === null || !contentType.includes("application/json")) {
    throw new Error(
      `${definition.catalogName} from ${location} did not return application/json.`,
    );
  }

  const value = await readCatalogJson(
    response,
    definition.catalogName,
    location,
  );
  return { ...parseCatalog(value, definition), location };
}

function getStore(): CatalogStore {
  if (store === null) {
    throw new Error("Catalog store has not been initialized.");
  }
  return store;
}

export async function initializeCatalogStore(): Promise<void> {
  if (store !== null) return;

  const baseUrl = parseCatalogBaseUrl();
  const [weapons, rules, stages] = await Promise.all([
    loadCatalog(WEAPON_CATALOG, baseUrl),
    loadCatalog(RULE_CATALOG, baseUrl),
    loadCatalog(STAGE_CATALOG, baseUrl),
  ]);

  store = { weapons, rules, stages };
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

export function listWeapons(): Weapon[] {
  return getStore().weapons.items;
}

export function listRules(): Rule[] {
  return getStore().rules.items;
}

export function listStages(): Stage[] {
  return getStore().stages.items;
}

export function findRule(ruleId: string): Rule | null {
  return getStore().rules.itemsById.get(ruleId) ?? null;
}

export function findStage(stageId: string): Stage | null {
  return getStore().stages.itemsById.get(stageId) ?? null;
}

export function requireWeapon(weaponId: string, source: string): Weapon {
  const weapon = getStore().weapons.itemsById.get(weaponId) ?? null;
  if (weapon === null) {
    throw new Error(
      `Weapon catalog does not contain id ${weaponId} referenced by ${source}.`,
    );
  }
  return weapon;
}
