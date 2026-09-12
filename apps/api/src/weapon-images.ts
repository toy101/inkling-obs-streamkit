import type { OverlayMatchup, OverlayTeam } from "./models/overlay";
import { readHttpsOriginEnvironmentVariable } from "./env";

const IKACLO_API_ORIGIN =
  readHttpsOriginEnvironmentVariable("IKACLO_API_ORIGIN");
const IKACLO_WEAPON_PATH = "/v1/3/weapons";
const REQUEST_TIMEOUT_MS = 10_000;
const weaponImageUrlCache = new Map<string, Promise<string | null>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === IKACLO_API_ORIGIN
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function fetchWeaponImageUrl(weaponId: string): Promise<string | null> {
  if (!/^\d+$/.test(weaponId)) return null;

  try {
    const response = await fetch(
      `${IKACLO_API_ORIGIN}${IKACLO_WEAPON_PATH}/${weaponId}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`Ikaclo API returned ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.data)) return null;

    const expectedId = Number(weaponId);
    if (
      !Number.isSafeInteger(expectedId) ||
      payload.data.id !== expectedId ||
      payload.data.kind !== "weapon"
    ) {
      return null;
    }

    return validateImageUrl(payload.data.image_url);
  } catch (error) {
    console.warn(`Failed to load Ikaclo image for weapon ${weaponId}.`, error);
    return null;
  }
}

function getWeaponImageUrl(weaponId: string): Promise<string | null> {
  const cached = weaponImageUrlCache.get(weaponId);
  if (cached) return cached;

  // Retain the promise so concurrent and later matchups reuse both successes
  // and failures for the lifetime of this API process.
  const request = fetchWeaponImageUrl(weaponId);
  weaponImageUrlCache.set(weaponId, request);
  return request;
}

function withWeaponImages(
  team: OverlayTeam,
  imageUrls: ReadonlyMap<string, string | null>,
): OverlayTeam {
  const withImages = (player: OverlayTeam["players"][number]) => ({
    ...player,
    weapons: player.weapons.map((weapon) => ({
      ...weapon,
      imageUrl: imageUrls.get(weapon.id) ?? null,
    })),
  });

  return {
    ...team,
    players: [
      withImages(team.players[0]),
      withImages(team.players[1]),
      withImages(team.players[2]),
      withImages(team.players[3]),
    ],
  };
}

export async function attachWeaponImages(
  matchup: OverlayMatchup,
): Promise<OverlayMatchup> {
  const weaponIds = new Set<string>();

  for (const team of [matchup.alpha, matchup.bravo]) {
    for (const player of team.players) {
      for (const weapon of player.weapons) {
        weaponIds.add(weapon.id);
      }
    }
  }

  const imageUrlEntries = await Promise.all(
    Array.from(weaponIds, async (weaponId) => {
      const imageUrl = await getWeaponImageUrl(weaponId);
      return [weaponId, imageUrl] as const;
    }),
  );
  const imageUrls = new Map(imageUrlEntries);

  return {
    ...matchup,
    alpha: withWeaponImages(matchup.alpha, imageUrls),
    bravo: withWeaponImages(matchup.bravo, imageUrls),
  };
}
