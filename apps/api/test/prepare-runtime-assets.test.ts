import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_CATALOG_BYTES,
  parseCatalogBaseUrl,
  prepareAssets,
  type AssetFetcher,
} from "../../../scripts/prepare-runtime-assets";

const catalogFiles = ["weapons.json", "rules.json", "stages.json"] as const;
type CatalogFileName = (typeof catalogFiles)[number];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const temporaryDirectories: string[] = [];

function catalogPath(directory: string, fileName: CatalogFileName): string {
  return join(directory, fileName);
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "inkling-catalog-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function jsonResponse(
  body: Uint8Array | string,
  contentType = "application/json; charset=utf-8",
  status = 200,
): Response {
  return new Response(body as BodyInit, {
    status,
    headers: { "content-type": contentType },
  });
}

function createFetcher(
  responseFactory: (url: URL) => Response,
): { fetcher: AssetFetcher; requests: string[] } {
  const requests: string[] = [];
  const fetcher: AssetFetcher = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(url);
    return responseFactory(new URL(url));
  };
  return { fetcher, requests };
}

async function writeExistingCatalogs(
  directory: string,
  content = '[{"id":"existing"}]',
): Promise<void> {
  await Promise.all(
    catalogFiles.slice(1).map((fileName) =>
      writeFile(catalogPath(directory, fileName), content),
    ),
  );
}

async function readCatalog(directory: string, fileName: CatalogFileName) {
  return textDecoder.decode(await readFile(catalogPath(directory, fileName)));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.length = 0;
});

describe("prepareRuntimeAssets API catalogs", () => {
  test("reuses all existing files without fetching or changing them", async () => {
    const directory = await createTemporaryDirectory();
    const existingContent = new Map<CatalogFileName, string>(
      catalogFiles.map((fileName) => [
        fileName,
        `[{"id":"${fileName}"}]`,
      ]),
    );
    await Promise.all(
      catalogFiles.map((fileName) =>
        writeFile(catalogPath(directory, fileName), existingContent.get(fileName) ?? ""),
      ),
    );
    const { fetcher, requests } = createFetcher(() => {
      throw new Error("fetch should not be called for existing files");
    });

    await prepareAssets("api", {
      catalogBaseUrl: "https://cdn.example.test/catalog",
      destinationDirectory: directory,
      fetcher,
    });

    expect(requests).toEqual([]);
    for (const fileName of catalogFiles) {
      expect(await readCatalog(directory, fileName)).toBe(
        existingContent.get(fileName) ?? "",
      );
    }
  });

  test("downloads only a missing file and normalizes the base URL slash", async () => {
    const requestedUrls: string[][] = [];

    for (const catalogBaseUrl of [
      "https://cdn.example.test/catalog",
      "https://cdn.example.test/catalog/",
    ]) {
      const directory = await createTemporaryDirectory();
      await writeExistingCatalogs(directory);
      const { fetcher, requests } = createFetcher(() =>
        jsonResponse(textEncoder.encode("[]")),
      );

      await prepareAssets("api", {
        catalogBaseUrl,
        destinationDirectory: directory,
        fetcher,
      });

      requestedUrls.push(requests);
      expect(await readCatalog(directory, "weapons.json")).toBe("[]");
    }

    expect(requestedUrls).toEqual([
      ["https://cdn.example.test/catalog/weapons.json"],
      ["https://cdn.example.test/catalog/weapons.json"],
    ]);
    expect(requestedUrls[0]).toEqual(requestedUrls[1]);
  });

  test("downloads and saves each missing catalog exactly once", async () => {
    const directory = await createTemporaryDirectory();
    const { fetcher, requests } = createFetcher(() =>
      jsonResponse(textEncoder.encode("[]")),
    );

    await prepareAssets("api", {
      catalogBaseUrl: "https://cdn.example.test/catalog/",
      destinationDirectory: directory,
      fetcher,
    });

    expect([...new Set(requests)].sort()).toEqual(
      catalogFiles
        .map((fileName) => `https://cdn.example.test/catalog/${fileName}`)
        .sort(),
    );
    expect(requests).toHaveLength(catalogFiles.length);
    for (const fileName of catalogFiles) {
      expect(await readCatalog(directory, fileName)).toBe("[]");
    }
  });

  test("accepts a response exactly at the 64 KiB limit", async () => {
    const directory = await createTemporaryDirectory();
    await writeExistingCatalogs(directory);
    const body = textEncoder.encode(
      `[${" ".repeat(MAX_CATALOG_BYTES - 2)}]`,
    );
    const { fetcher } = createFetcher(() => jsonResponse(body));

    await prepareAssets("api", {
      catalogBaseUrl: "https://cdn.example.test/catalog/",
      destinationDirectory: directory,
      fetcher,
    });

    expect(body.byteLength).toBe(MAX_CATALOG_BYTES);
    expect((await readFile(catalogPath(directory, "weapons.json"))).byteLength).toBe(
      MAX_CATALOG_BYTES,
    );
  });

  const rejectedResponses: Array<{
    name: string;
    response: () => Response;
  }> = [
    {
      name: "a non-2xx response",
      response: () => jsonResponse("[]", "application/json", 503),
    },
    {
      name: "a non-JSON content type",
      response: () => jsonResponse("[]", "text/plain"),
    },
    {
      name: "an empty response",
      response: () => jsonResponse(""),
    },
    {
      name: "a response over 64 KiB",
      response: () =>
        jsonResponse(
          textEncoder.encode(`[${" ".repeat(MAX_CATALOG_BYTES - 2)}] `),
        ),
    },
    {
      name: "invalid UTF-8",
      response: () => jsonResponse(new Uint8Array([0xc3, 0x28])),
    },
    {
      name: "broken JSON",
      response: () => jsonResponse("{]"),
    },
    {
      name: "a non-array JSON value",
      response: () => jsonResponse("{}"),
    },
  ];

  for (const { name, response } of rejectedResponses) {
    test(`rejects ${name} without leaving a file`, async () => {
      const directory = await createTemporaryDirectory();
      await writeExistingCatalogs(directory);
      const { fetcher } = createFetcher(response);

      await expect(
        prepareAssets("api", {
          catalogBaseUrl: "https://cdn.example.test/catalog/",
          destinationDirectory: directory,
          fetcher,
        }),
      ).rejects.toThrow();

      expect(existsSync(catalogPath(directory, "weapons.json"))).toBe(false);
      expect(await readCatalog(directory, "rules.json")).toBe(
        '[{"id":"existing"}]',
      );
      expect(await readCatalog(directory, "stages.json")).toBe(
        '[{"id":"existing"}]',
      );
    });
  }

  test("rejects invalid catalog URLs with clear errors", () => {
    expect(() => parseCatalogBaseUrl("not-a-url")).toThrow(
      "CATALOG_URL must be a valid URL.",
    );
    expect(() => parseCatalogBaseUrl("ftp://cdn.example.test/catalog")).toThrow(
      "CATALOG_URL must use HTTP or HTTPS.",
    );
  });
});
