import type { Rule, Stage, Weapon } from "./models/catalog";

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
): Promise<LoadedCatalog<T>> {
  const catalogUrl = new URL(`./data/${definition.fileName}`, import.meta.url);
  const location = catalogUrl.pathname;
  const value = await readCatalogJson(catalogUrl, definition.catalogName, location);
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

  const [weapons, rules, stages] = await Promise.all([
    loadCatalog(WEAPON_CATALOG),
    loadCatalog(RULE_CATALOG),
    loadCatalog(STAGE_CATALOG),
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
