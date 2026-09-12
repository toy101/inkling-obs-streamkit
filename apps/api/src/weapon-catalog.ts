import type { Weapon } from "./models/catalog";
import { requireEnvironmentVariable } from "./env";

const MAX_WEAPON_CATALOG_BYTES = 64 * 1024;
const WEAPON_CATALOG_TIMEOUT_MS = 10_000;

type WeaponCatalog = {
  weapons: Weapon[];
  weaponsById: Map<string, Weapon>;
};

let catalog: WeaponCatalog | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWeaponCatalog(value: unknown): WeaponCatalog {
  if (!Array.isArray(value)) {
    throw new Error("Weapon catalog must be a JSON array.");
  }
  if (value.length === 0) {
    throw new Error("Weapon catalog must not be empty.");
  }

  const weapons: Weapon[] = [];
  const weaponsById = new Map<string, Weapon>();

  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      throw new Error(`Weapon catalog entry ${index} must be an object.`);
    }

    const { id, name } = entry;
    if (typeof id !== "string" || !/^\d+$/.test(id)) {
      throw new Error(`Weapon catalog entry ${index} has an invalid id.`);
    }
    if (typeof name !== "string" || !/\S/.test(name)) {
      throw new Error(`Weapon catalog entry ${index} has an invalid name.`);
    }
    if (Object.keys(entry).some((key) => key !== "id" && key !== "name")) {
      throw new Error(`Weapon catalog entry ${index} has an unexpected property.`);
    }
    if (weaponsById.has(id)) {
      throw new Error(`Weapon catalog contains duplicate id: ${id}`);
    }

    const weapon = { id, name };
    weapons.push(weapon);
    weaponsById.set(id, weapon);
  }

  return { weapons, weaponsById };
}

function getCatalog(): WeaponCatalog {
  if (catalog === null) {
    throw new Error("Weapon catalog has not been initialized.");
  }
  return catalog;
}

function parseCatalogUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("WEAPON_CATALOG_URL must be a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("WEAPON_CATALOG_URL must use HTTP or HTTPS.");
  }
  return url;
}

function catalogLocation(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

async function readCatalogJson(response: Response, location: string): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_WEAPON_CATALOG_BYTES) {
      throw new Error(
        `Weapon catalog from ${location} exceeds ${MAX_WEAPON_CATALOG_BYTES} bytes.`,
      );
    }
  }

  if (response.body === null) {
    throw new Error(`Weapon catalog from ${location} has no response body.`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;

    receivedBytes += result.value.byteLength;
    if (receivedBytes > MAX_WEAPON_CATALOG_BYTES) {
      await reader.cancel();
      throw new Error(
        `Weapon catalog from ${location} exceeds ${MAX_WEAPON_CATALOG_BYTES} bytes.`,
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
    throw new Error(`Weapon catalog from ${location} is not valid JSON: ${message}`);
  }
}

export async function initializeWeaponCatalog(): Promise<void> {
  if (catalog !== null) return;

  const catalogUrl = parseCatalogUrl(
    requireEnvironmentVariable("WEAPON_CATALOG_URL"),
  );
  const location = catalogLocation(catalogUrl);
  let response: Response;

  try {
    response = await fetch(catalogUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(WEAPON_CATALOG_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UnknownError";
    throw new Error(`Failed to fetch weapon catalog from ${location}: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch weapon catalog from ${location}: HTTP ${response.status}`,
    );
  }

  const contentType = response.headers.get("content-type");
  if (contentType === null || !contentType.includes("application/json")) {
    throw new Error(
      `Weapon catalog from ${location} did not return application/json.`,
    );
  }

  const value = await readCatalogJson(response, location);
  catalog = parseWeaponCatalog(value);
  console.log(`Loaded ${catalog.weapons.length} weapons from ${location}`);
}

export function listWeapons(): Weapon[] {
  return getCatalog().weapons;
}

export function requireWeapon(weaponId: string, source: string): Weapon {
  const weapon = getCatalog().weaponsById.get(weaponId) ?? null;
  if (weapon === null) {
    throw new Error(`Weapon catalog does not contain id ${weaponId} referenced by ${source}.`);
  }
  return weapon;
}
