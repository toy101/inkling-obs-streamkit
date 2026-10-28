import type { OverlayMatchup } from "./api";

const ICON_LOAD_TIMEOUT_MS = 10_000;

function loadIcon(image: HTMLImageElement, url: string, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      if (!loaded) image.removeAttribute("src");
      resolve(loaded);
    };
    const abort = () => finish(false);
    const timeoutId = window.setTimeout(abort, ICON_LOAD_TIMEOUT_MS);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    image.onload = () => {
      void image.decode().then(() => finish(true), () => finish(false));
    };
    image.onerror = () => finish(false);
    image.src = url;
  });
}

export async function preloadPlayerIcons(
  matchup: OverlayMatchup,
  signal: AbortSignal,
): Promise<{ matchup: OverlayMatchup; icons: HTMLImageElement[] }> {
  const urls = new Set(
    [...matchup.alpha.players, ...matchup.bravo.players]
      .map((player) => player.iconUrl)
      .filter((url): url is string => Boolean(url)),
  );
  const icons: HTMLImageElement[] = [];
  const failedUrls = new Set<string>();
  await Promise.all([...urls].map(async (url) => {
    const image = new Image();
    icons.push(image);
    if (!await loadIcon(image, url, signal)) failedUrls.add(url);
  }));

  const prepareTeam = (team: OverlayMatchup["alpha"]) => ({
    ...team,
    players: team.players.map((player) => ({
      ...player,
      iconUrl: player.iconUrl && failedUrls.has(player.iconUrl)
        ? null
        : player.iconUrl,
    })) as OverlayMatchup["alpha"]["players"],
  });

  return {
    matchup: {
      ...matchup,
      alpha: prepareTeam(matchup.alpha),
      bravo: prepareTeam(matchup.bravo),
    },
    // Retain decoded images while this matchup is displayed, including no-store URLs.
    icons,
  };
}
