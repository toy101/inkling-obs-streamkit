import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

export type StageVideoMockWindow = typeof window & {
  stageVideoMock: {
    requests: () => {
      url: string;
      hasAbortSignal: boolean;
      aborted: boolean;
      headersSent: boolean;
      bodyCompleted: boolean;
      bodyRead: boolean;
    }[];
    respond: (index: number, status?: number) => void;
    finishBody: (index: number) => void;
    failNetwork: (index: number) => void;
    createdUrls: string[];
    revokedUrls: string[];
  };
};

export async function installStageVideoMock(page: Page): Promise<void> {
  const video = await readFile(
    new URL("./fixtures/stage-reveal.webm", import.meta.url),
  );
  await page.addInitScript((bytes) => {
    type Download = {
      url: string;
      signal: AbortSignal | null;
      headersSent: boolean;
      bodyCompleted: boolean;
      bodyRead: boolean;
      controller: ReadableStreamDefaultController<Uint8Array> | null;
      resolve: (response: Response) => void;
      reject: (error: Error) => void;
    };
    const downloads: Download[] = [];
    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];
    const getDownload = (index: number): Download => {
      const download = downloads[index];
      if (!download) throw new Error(`Missing video download: ${index}`);
      return download;
    };

    const originalFetch = window.fetch.bind(window);
    const mockFetch: typeof window.fetch = (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL ? input.href : input.url;
      if (!new URL(url, location.href).pathname.startsWith("/stage-video/")) {
        return originalFetch(input, init);
      }

      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
        downloads.push({
          url, signal, resolve, reject,
          headersSent: false,
          bodyCompleted: false,
          bodyRead: false,
          controller: null,
        });
        if (signal?.aborted) {
          reject(signal.reason);
        } else {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }
      });
    };
    mockFetch.preconnect = originalFetch.preconnect;
    window.fetch = mockFetch;

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectURL(blob);
      createdUrls.push(url);
      return url;
    };
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      revokedUrls.push(url);
      originalRevokeObjectURL(url);
    };

    (window as StageVideoMockWindow).stageVideoMock = {
      requests: () => downloads.map((download) => ({
        url: download.url,
        hasAbortSignal: download.signal !== null,
        aborted: download.signal?.aborted ?? false,
        headersSent: download.headersSent,
        bodyCompleted: download.bodyCompleted,
        bodyRead: download.bodyRead,
      })),
      respond: (index, status = 200) => {
        const download = getDownload(index);
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => { download.controller = controller; },
        });
        download.headersSent = true;
        const response = new Response(body, {
          status,
          headers: { "content-type": "video/webm" },
        });
        const originalBlob = response.blob.bind(response);
        response.blob = async () => {
          const blob = await originalBlob();
          download.bodyRead = true;
          return blob;
        };
        download.resolve(response);
      },
      finishBody: (index) => {
        const download = getDownload(index);
        if (!download.controller) throw new Error("Video headers have not been sent.");
        // Deliver even an aborted body to exercise a late completion race.
        download.controller.enqueue(new Uint8Array(bytes));
        download.controller.close();
        download.bodyCompleted = true;
      },
      failNetwork: (index) => {
        getDownload(index).reject(new TypeError("Failed to fetch"));
      },
      createdUrls,
      revokedUrls,
    };
  }, Array.from(video));
}
