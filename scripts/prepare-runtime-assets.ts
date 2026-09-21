import { file, write } from "bun";
import { resolve } from "node:path";

const DEFAULT_CDN_BASE_URL =
  "https://inkling-obs-streamkit.toy101-mov.org/";
export const MAX_CATALOG_BYTES = 64 * 1024;

type RuntimeAssetTarget = "api" | "web";

type RuntimeAsset = {
  contentType: string;
  destinationPath: string;
  maxBytes: number;
  sourceUrl: URL;
  validate(bytes: Uint8Array): void;
};

export type AssetFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type PrepareAssetsOptions = {
  catalogBaseUrl?: string;
  destinationDirectory?: string;
  fetcher?: AssetFetcher;
};

function parseTarget(value: string | undefined): RuntimeAssetTarget {
  if (value === "api" || value === "web") return value;
  throw new Error("Usage: bun run scripts/prepare-runtime-assets.ts <api|web>");
}

export function parseCatalogBaseUrl(
  value = process.env.CATALOG_URL?.trim() || DEFAULT_CDN_BASE_URL,
): URL {
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

function validateJson(bytes: Uint8Array): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) {
    throw new Error("Catalog response must be a JSON array.");
  }
}

function validatePng(bytes: Uint8Array): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.byteLength < signature.length ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    throw new Error("Image response is not a valid PNG file.");
  }
}

function getAssets(
  target: RuntimeAssetTarget,
  options: PrepareAssetsOptions,
): RuntimeAsset[] {
  const workspaceRoot = resolve(import.meta.dir, "..");

  if (target === "web") {
    return [
      {
        contentType: "image/png",
        destinationPath: resolve(
          options.destinationDirectory ?? resolve(workspaceRoot, "apps/web/public"),
          "stage-reveal-vignette.png",
        ),
        maxBytes: 5 * 1024 * 1024,
        sourceUrl: new URL(
          "stage-reveal-vignette.png",
          DEFAULT_CDN_BASE_URL,
        ),
        validate: validatePng,
      },
    ];
  }

  const catalogBaseUrl = parseCatalogBaseUrl(options.catalogBaseUrl);
  const destinationDirectory =
    options.destinationDirectory ?? resolve(workspaceRoot, "apps/api/src/data");
  return ["weapons.json", "rules.json", "stages.json"].map((fileName) => ({
    contentType: "application/json",
    destinationPath: resolve(destinationDirectory, fileName),
    maxBytes: MAX_CATALOG_BYTES,
    sourceUrl: new URL(fileName, catalogBaseUrl),
    validate: validateJson,
  }));
}

async function prepareAsset(
  asset: RuntimeAsset,
  fetcher: AssetFetcher,
): Promise<void> {
  const destination = file(asset.destinationPath);
  if (await destination.exists()) {
    console.info(`${destination.name} already exists; skipping download`);
    return;
  }

  const response = await fetcher(asset.sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${asset.sourceUrl.pathname}: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes(asset.contentType)) {
    throw new Error(
      `${asset.sourceUrl.pathname} returned an unexpected content type: ${contentType || "missing"}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`${asset.sourceUrl.pathname} returned an empty response`);
  }
  if (bytes.byteLength > asset.maxBytes) {
    throw new Error(
      `${asset.sourceUrl.pathname} exceeds ${asset.maxBytes} bytes`,
    );
  }

  asset.validate(bytes);
  await write(asset.destinationPath, bytes);
  console.info(`Downloaded ${destination.name}`);
}

export async function prepareAssets(
  target: RuntimeAssetTarget,
  options: PrepareAssetsOptions = {},
): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  await Promise.all(
    getAssets(target, options).map((asset) => prepareAsset(asset, fetcher)),
  );
}

async function main(targetValue: string | undefined): Promise<void> {
  await prepareAssets(parseTarget(targetValue));
}

if (import.meta.main) {
  await main(Bun.argv[2]);
}
