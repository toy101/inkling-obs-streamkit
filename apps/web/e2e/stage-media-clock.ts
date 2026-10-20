import type { Locator } from "@playwright/test";

type MediaState = {
  duration: number;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  seeking: boolean;
  waiting: boolean;
};

type ControlledVideo = HTMLVideoElement & {
  updateMediaClock: (update: Partial<MediaState>, event: string) => void;
};

// Decode the real fixture first, then advance media time with Playwright's clock.
// This keeps boundary assertions independent of the host's decoding speed.
export async function installMediaClock(video: Locator): Promise<void> {
  await video.evaluate((element) => {
    const media = element as ControlledVideo;
    const state: MediaState = {
      duration: 10,
      currentTime: 0,
      playbackRate: 1,
      paused: false,
      seeking: false,
      waiting: false,
    };
    let anchor = performance.now();
    const currentTime = () => state.currentTime + (
      state.paused || state.seeking || state.waiting
        ? 0
        : (performance.now() - anchor) / 1_000 * state.playbackRate
    );
    Object.defineProperties(media, {
      duration: { configurable: true, get: () => state.duration },
      currentTime: { configurable: true, get: currentTime },
      playbackRate: { configurable: true, get: () => state.playbackRate },
      paused: { configurable: true, get: () => state.paused },
      seeking: { configurable: true, get: () => state.seeking },
      ended: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => state.waiting ? 2 : 4 },
    });
    media.updateMediaClock = (update, event) => {
      state.currentTime = currentTime();
      anchor = performance.now();
      Object.assign(state, update);
      media.dispatchEvent(new Event(event));
    };
    media.dispatchEvent(new Event("playing"));
  });
}

export async function updateMediaClock(
  video: Locator,
  update: Partial<MediaState>,
  event: string,
): Promise<void> {
  await video.evaluate((element, { update, event }) => {
    (element as ControlledVideo).updateMediaClock(update, event);
  }, { update, event });
}
