import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from "../lib/overlay-canvas";
import {
  DEBUG_OVERLAY_SLIDES,
  isDebugOverlayAutoplayMessage,
  isDebugOverlaySlideMessage,
} from "../lib/debug-overlay-preview";
import type { DebugOverlaySlideIndex } from "../lib/debug-overlay-preview";

import { api } from "../lib/api";
import type { OverlayMatchup } from "../lib/api";
import {
  DEFAULT_ACCENT_COLOR,
  getOverlaySelection,
  subscribeStageReveal,
  subscribeOverlaySelection,
} from "../lib/overlay-state";
import type { StageRevealRequest } from "../lib/overlay-state";

const SLIDE_DURATION_MS = 8_000;
const STAGE_REVEAL_ENTER_DURATION_MS = 2_600;
const STAGE_REVEAL_EXIT_DURATION_MS = 1_800;
const STAGE_REVEAL_VIDEO_START_DELAY_MS = 1_450;
const STAGE_REVEAL_REDUCED_DURATION_MS = 150;
const STAGE_REVEAL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const STAGE_REVEAL_VIDEO_URL = "/slected-stage.webm";
const STAGE_REVEAL_VIGNETTE_URL = "/stage-reveal-vignette.png";

type OverlayTeam = OverlayMatchup["alpha"];
type OverlayPlayer = OverlayTeam["players"][number];
type OverlayWeapon = OverlayPlayer["weapons"][number];
type TeamDesignation = "alpha" | "bravo";
type TeamPosition = "left" | "right";

type OverlayStyle = CSSProperties & {
  "--overlay-accent-color": string;
  "--overlay-accent-rgb": string;
  "--stage-reveal-easing": string;
  "--stage-reveal-enter-duration": string;
  "--stage-reveal-exit-duration": string;
  "--stage-reveal-reduced-duration": string;
};

type MatchupQuery = {
  tournamentId: string;
  alphaTournamentTeamId: string;
  bravoTournamentTeamId: string;
  ruleId: string;
  stageId: string;
};

const matchupRequests = new Map<string, Promise<OverlayMatchup | null>>();

function getMatchupDataSelectionKey(query: MatchupQuery): string {
  return [
    query.tournamentId,
    query.alphaTournamentTeamId,
    query.bravoTournamentTeamId,
    query.ruleId,
    query.stageId,
  ].join(":");
}

function toRgbChannels(color: string): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `${red} ${green} ${blue}`;
}

function requestMatchup(
  dataSelectionKey: string,
  query: MatchupQuery,
): Promise<OverlayMatchup | null> {
  const pendingRequest = matchupRequests.get(dataSelectionKey);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    try {
      const { data, error } = await api.overlay.matchup.get({ query });
      if (error) {
        console.error(error);
        return null;
      }
      return data;
    } catch (error) {
      console.error(error);
      return null;
    }
  })();

  matchupRequests.set(dataSelectionKey, request);
  void request.then(() => {
    if (matchupRequests.get(dataSelectionKey) === request) {
      matchupRequests.delete(dataSelectionKey);
    }
  });
  return request;
}

type PlayerAvatarProps = {
  player: OverlayPlayer;
};

function PlayerAvatar({ player }: PlayerAvatarProps) {
  return (
    <div className="overlay-player-avatar">
      {player.iconUrl ? (
        <img src={player.iconUrl} alt="" />
      ) : (
        <span aria-hidden="true">{player.registeredName.slice(0, 1)}</span>
      )}
    </div>
  );
}

type WeaponImageProps = {
  enabled: boolean;
  weapon: OverlayWeapon;
};

function WeaponImage({ enabled, weapon }: WeaponImageProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = weapon.imageUrl;
  const isUnavailable = imageUrl === null || imageFailed;

  return (
    <li
      className="overlay-detail-weapon"
      aria-label={
        isUnavailable
          ? `${weapon.name}の画像を取得できませんでした`
          : weapon.name
      }
    >
      {isUnavailable ? (
        <span className="overlay-detail-weapon-placeholder" aria-hidden="true">
          ?
        </span>
      ) : enabled ? (
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          loading="eager"
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </li>
  );
}

type TeamPanelProps = {
  position: TeamPosition;
  team: OverlayTeam;
};

function TeamPanel({ position, team }: TeamPanelProps) {
  return (
    <section className={`overlay-team overlay-team--${position}`}>
      <h2 className="overlay-team-name">{team.name}</h2>

      <ol className="overlay-player-grid">
        {team.players.map((player) => (
          <li className="overlay-player-card" key={player.rosterEntryId}>
            <PlayerAvatar player={player} />

            <strong className="overlay-player-name">
              {player.registeredName}
            </strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

type MatchupSlideProps = {
  matchup: OverlayMatchup;
};

type MatchupCardSlideProps = MatchupSlideProps & {
  matchLabel: string;
};

type OverlayCarouselProps = MatchupCardSlideProps & {
  suspended: boolean;
};

function MatchupSlide({ matchup, matchLabel }: MatchupCardSlideProps) {
  return (
    <div className="overlay-matchup">
      <header className="overlay-matchup-header">
        <div className="overlay-matchup-kicker" aria-hidden="true">
          <span>MATCH UP</span>
        </div>
        <div className="overlay-matchup-title-frame">
          <svg
            className="overlay-matchup-title-outline"
            viewBox="0 0 900 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <polygon points="25,2 875,2 898,50 875,98 25,98 2,50" />
          </svg>
          <div className="overlay-matchup-title-plate">
            <h1>{matchup.tournament.name}</h1>
            {matchLabel && <p>{matchLabel}</p>}
          </div>
        </div>
      </header>

      <div className="overlay-matchup-body">
        <div className="overlay-team-grid">
          <TeamPanel position="left" team={matchup.alpha} />
          <TeamPanel position="right" team={matchup.bravo} />
        </div>
        <span className="overlay-matchup-versus" aria-label="vs">
          VS
        </span>
      </div>
    </div>
  );
}

type TeamDetailSlideProps = {
  loadWeaponImages: boolean;
  position: TeamPosition;
  teamDesignation: TeamDesignation;
  team: OverlayTeam;
};

function TeamDetailSlide({
  loadWeaponImages,
  position,
  teamDesignation,
  team,
}: TeamDetailSlideProps) {
  const teamLabel = teamDesignation === "alpha" ? "ALPHA TEAM" : "BRAVO TEAM";

  return (
    <section
      className={`overlay-team-detail overlay-team-detail--${position}`}
      aria-label={`${team.name}の詳細情報`}
    >
      <header className="overlay-slide-header">
        <span className="overlay-slide-eyebrow">{teamLabel}</span>
        <h1>{team.name}</h1>
      </header>

      <div className="overlay-detail-columns" aria-hidden="true">
        <span>PLAYER</span>
        <span>POSITION</span>
        <span>WEAPONS</span>
      </div>

      <ol className="overlay-detail-player-list">
        {team.players.map((player) => (
          <li className="overlay-detail-player" key={player.rosterEntryId}>
            <PlayerAvatar player={player} />

            <div className="overlay-detail-player-profile">
              <strong>{player.registeredName}</strong>
            </div>

            <span className="overlay-detail-position">
              {player.position?.name ?? "Unknown"}
            </span>

            <div className="overlay-detail-weapons">
              <ul>
                {player.weapons.length > 0 ? (
                  player.weapons.map((weapon) => (
                    <WeaponImage
                      enabled={loadWeaponImages}
                      weapon={weapon}
                      key={weapon.id}
                    />
                  ))
                ) : (
                  <li className="overlay-detail-empty">Unknown</li>
                )}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

type CarouselState = {
  animateActiveSlide: boolean;
  autoplay: boolean;
  loadBravoTeamImages: boolean;
  slideIndex: DebugOverlaySlideIndex;
  slideVersion: number;
};

function selectCarouselSlide(
  current: CarouselState,
  slideIndex: DebugOverlaySlideIndex,
): CarouselState {
  return {
    animateActiveSlide: true,
    autoplay: current.autoplay,
    loadBravoTeamImages:
      current.loadBravoTeamImages || slideIndex === 1 || slideIndex === 2,
    slideIndex,
    slideVersion: current.slideVersion + 1,
  };
}

function OverlayCarousel({
  matchup,
  matchLabel,
  suspended,
}: OverlayCarouselProps) {
  const [carouselState, setCarouselState] = useState<CarouselState>({
    animateActiveSlide: true,
    autoplay: true,
    loadBravoTeamImages: false,
    slideIndex: 0,
    slideVersion: 0,
  });
  const {
    animateActiveSlide,
    autoplay,
    loadBravoTeamImages,
    slideIndex,
    slideVersion,
  } = carouselState;

  useEffect(() => {
    if (!suspended) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCarouselState((current) =>
        current.animateActiveSlide
          ? { ...current, animateActiveSlide: false }
          : current,
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [suspended]);

  useEffect(() => {
    if (!autoplay || suspended) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCarouselState((current) => {
        const nextSlide =
          DEBUG_OVERLAY_SLIDES[
            (current.slideIndex + 1) % DEBUG_OVERLAY_SLIDES.length
          ];
        return nextSlide
          ? selectCarouselSlide(current, nextSlide.index)
          : current;
      });
    }, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [autoplay, slideVersion, suspended]);

  useEffect(() => {
    const receiveDebugSlide = (event: MessageEvent<unknown>) => {
      const message = event.data;

      if (
        window.parent === window ||
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        (!isDebugOverlaySlideMessage(message) &&
          !isDebugOverlayAutoplayMessage(message))
      ) {
        return;
      }

      setCarouselState((current) => {
        if (isDebugOverlaySlideMessage(message)) {
          return selectCarouselSlide(current, message.slideIndex);
        }

        return {
          ...current,
          animateActiveSlide: message.autoplay
            ? current.animateActiveSlide
            : false,
          autoplay: message.autoplay,
          slideVersion: current.slideVersion + 1,
        };
      });
    };

    window.addEventListener("message", receiveDebugSlide);
    return () => window.removeEventListener("message", receiveDebugSlide);
  }, []);

  const slides = [
    {
      id: "matchup",
      content: <MatchupSlide matchup={matchup} matchLabel={matchLabel} />,
    },
    {
      id: "alpha-team",
      content: (
        <TeamDetailSlide
          loadWeaponImages
          position="left"
          teamDesignation="alpha"
          team={matchup.alpha}
        />
      ),
    },
    {
      id: "bravo-team",
      content: (
        <TeamDetailSlide
          loadWeaponImages={loadBravoTeamImages}
          position="right"
          teamDesignation="bravo"
          team={matchup.bravo}
        />
      ),
    },
  ];

  return (
    <div
      className={`overlay-carousel${
        autoplay && !suspended && animateActiveSlide ? "" : " is-paused"
      }`}
    >
      {slides.map((slide, index) => (
        <div
          className={`overlay-slide${index === slideIndex ? " is-active" : ""}`}
          aria-hidden={index !== slideIndex}
          key={`${slide.id}-${index === slideIndex ? slideVersion : 0}`}
          style={{ animationDuration: `${SLIDE_DURATION_MS}ms` }}
        >
          {slide.content}
        </div>
      ))}

      <ol className="overlay-slide-indicators" aria-hidden="true">
        {DEBUG_OVERLAY_SLIDES.map(({ index }) => (
          <li className={index === slideIndex ? "is-active" : ""} key={index} />
        ))}
      </ol>
    </div>
  );
}

type LoadedMatchup = {
  dataSelectionKey: string;
  matchup: OverlayMatchup | null;
};

type StageRevealPhase = "ready" | "entering" | "playing" | "exiting";

type StageRevealPlayback = {
  requestId: string;
  rule: OverlayMatchup["rule"];
  sourceUrl: string;
  stage: OverlayMatchup["stage"];
  phase: StageRevealPhase;
};

type StageRevealContentProps = Pick<StageRevealPlayback, "rule" | "stage">;

function StageRevealContent({ rule, stage }: StageRevealContentProps) {
  const stageNameBreakIndex = stage.en.indexOf(" ");

  return (
    <div className="overlay-stage-reveal-content">
      <section className="overlay-stage-reveal-rule" aria-label="選択ルール">
        <strong lang="en">{rule.en}</strong>
        <p lang="en">{rule.description}</p>
        <span lang="ja">{rule.name}</span>
      </section>

      <section className="overlay-stage-reveal-stage" aria-label="選択ステージ">
        <span lang="ja">{stage.name}</span>
        <strong lang="en">
          {stageNameBreakIndex >= 0 ? (
            <>
              {stage.en.slice(0, stageNameBreakIndex)}
              <br />
              {stage.en.slice(stageNameBreakIndex + 1)}
            </>
          ) : (
            stage.en
          )}
        </strong>
      </section>
    </div>
  );
}

export function Overlay() {
  const [selection, setSelection] = useState(getOverlaySelection);
  const [loaded, setLoaded] = useState<LoadedMatchup | null>(null);
  const [stageRevealRequest, setStageRevealRequest] =
    useState<StageRevealRequest | null>(null);
  const [stageRevealPlayback, setStageRevealPlayback] =
    useState<StageRevealPlayback | null>(null);
  const stageRevealVideoRef = useRef<HTMLVideoElement>(null);

  const tournamentId = selection?.tournamentId ?? "";
  const alphaTournamentTeamId = selection?.alphaTournamentTeamId ?? "";
  const bravoTournamentTeamId = selection?.bravoTournamentTeamId ?? "";
  const ruleId = selection?.ruleId ?? "";
  const stageId = selection?.stageId ?? "";
  const accentColor = selection?.accentColor ?? DEFAULT_ACCENT_COLOR;
  const matchLabel = selection?.matchLabel ?? "";
  const dataSelectionKey = getMatchupDataSelectionKey({
    tournamentId,
    alphaTournamentTeamId,
    bravoTournamentTeamId,
    ruleId,
    stageId,
  });
  const stageRevealDataSelectionKey = stageRevealRequest
    ? getMatchupDataSelectionKey({
        tournamentId,
        alphaTournamentTeamId,
        bravoTournamentTeamId,
        ruleId: stageRevealRequest.ruleId,
        stageId: stageRevealRequest.stageId,
      })
    : "";
  const stageRevealMatchupIsLoaded = Boolean(
    stageRevealDataSelectionKey &&
    loaded?.dataSelectionKey === stageRevealDataSelectionKey,
  );
  const stageRevealMatchup = stageRevealMatchupIsLoaded
    ? (loaded?.matchup ?? null)
    : null;

  useEffect(() => {
    return subscribeOverlaySelection(setSelection);
  }, []);

  useEffect(() => {
    return subscribeStageReveal(setStageRevealRequest);
  }, []);

  useEffect(() => {
    if (!stageRevealRequest || !stageRevealMatchupIsLoaded) {
      return;
    }

    if (!stageRevealMatchup) {
      console.error(
        "ステージ紹介に必要なルール・ステージ情報を取得できませんでした",
      );
      const timeoutId = window.setTimeout(
        () => setStageRevealRequest(null),
        0,
      );
      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    const clearPlaybackTimeoutId = window.setTimeout(
      () => setStageRevealPlayback(null),
      0,
    );

    const downloadStageVideo = async () => {
      try {
        const response = await fetch(STAGE_REVEAL_VIDEO_URL, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `ステージ動画のダウンロードに失敗しました: ${response.status}`,
          );
        }

        const videoBlob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }

        objectUrl = URL.createObjectURL(videoBlob);
        setStageRevealPlayback({
          requestId: stageRevealRequest.requestId,
          rule: stageRevealMatchup.rule,
          sourceUrl: objectUrl,
          stage: stageRevealMatchup.stage,
          phase: "ready",
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(error);
        setStageRevealRequest(null);
      }
    };

    void downloadStageVideo();

    return () => {
      window.clearTimeout(clearPlaybackTimeoutId);
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [stageRevealMatchup, stageRevealMatchupIsLoaded, stageRevealRequest]);

  useEffect(() => {
    if (!stageRevealPlayback) {
      return;
    }

    const requestId = stageRevealPlayback.requestId;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const transitionDuration = prefersReducedMotion
      ? STAGE_REVEAL_REDUCED_DURATION_MS
      : stageRevealPlayback.phase === "exiting"
        ? STAGE_REVEAL_EXIT_DURATION_MS
        : STAGE_REVEAL_ENTER_DURATION_MS;
    const videoStartDelay = prefersReducedMotion
      ? 0
      : STAGE_REVEAL_VIDEO_START_DELAY_MS;

    if (stageRevealPlayback.phase === "ready") {
      let enterFrameId = 0;
      const mountFrameId = window.requestAnimationFrame(() => {
        enterFrameId = window.requestAnimationFrame(() => {
          setStageRevealPlayback((current) =>
            current?.requestId === requestId && current.phase === "ready"
              ? { ...current, phase: "entering" }
              : current,
          );
        });
      });

      return () => {
        window.cancelAnimationFrame(mountFrameId);
        window.cancelAnimationFrame(enterFrameId);
      };
    }

    if (stageRevealPlayback.phase === "entering") {
      const playTimeoutId = window.setTimeout(() => {
        const video = stageRevealVideoRef.current;
        if (!video) {
          setStageRevealPlayback((current) =>
            current?.requestId === requestId
              ? { ...current, phase: "exiting" }
              : current,
          );
          return;
        }

        video.currentTime = 0;
        const exitPlayback = () => {
          setStageRevealPlayback((current) =>
            current?.requestId === requestId
              ? { ...current, phase: "exiting" }
              : current,
          );
        };

        void video.play().catch(async (error: unknown) => {
          console.warn(
            "音声付き動画の自動再生が拒否されたため、ミュートで再試行します",
            error,
          );
          video.muted = true;

          try {
            await video.play();
          } catch (mutedError: unknown) {
            console.error(mutedError);
            exitPlayback();
          }
        });
      }, videoStartDelay);

      const completeTransitionTimeoutId = window.setTimeout(() => {
        setStageRevealPlayback((current) =>
          current?.requestId === requestId && current.phase === "entering"
            ? { ...current, phase: "playing" }
            : current,
        );
      }, transitionDuration);

      return () => {
        window.clearTimeout(playTimeoutId);
        window.clearTimeout(completeTransitionTimeoutId);
      };
    }

    if (stageRevealPlayback.phase === "exiting") {
      const timeoutId = window.setTimeout(() => {
        setStageRevealPlayback(null);
        setStageRevealRequest(null);
      }, transitionDuration);

      return () => window.clearTimeout(timeoutId);
    }
  }, [stageRevealPlayback]);

  useEffect(() => {
    if (
      !tournamentId ||
      !alphaTournamentTeamId ||
      !bravoTournamentTeamId ||
      !ruleId ||
      !stageId
    ) {
      return;
    }

    if (loaded?.dataSelectionKey === dataSelectionKey) {
      return;
    }

    let cancelled = false;

    const loadMatchup = async () => {
      const data = await requestMatchup(dataSelectionKey, {
        tournamentId,
        alphaTournamentTeamId,
        bravoTournamentTeamId,
        ruleId,
        stageId,
      });

      if (!cancelled) {
        setLoaded({ dataSelectionKey, matchup: data });
      }
    };

    void loadMatchup();

    return () => {
      cancelled = true;
    };
  }, [
    alphaTournamentTeamId,
    bravoTournamentTeamId,
    dataSelectionKey,
    loaded?.dataSelectionKey,
    ruleId,
    stageId,
    tournamentId,
  ]);

  const matchup =
    loaded?.dataSelectionKey === dataSelectionKey ? loaded.matchup : null;
  const overlayStyle: OverlayStyle = {
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    "--overlay-accent-color": accentColor,
    "--overlay-accent-rgb": toRgbChannels(accentColor),
    "--stage-reveal-easing": STAGE_REVEAL_EASING,
    "--stage-reveal-enter-duration": `${STAGE_REVEAL_ENTER_DURATION_MS}ms`,
    "--stage-reveal-exit-duration": `${STAGE_REVEAL_EXIT_DURATION_MS}ms`,
    "--stage-reveal-reduced-duration": `${STAGE_REVEAL_REDUCED_DURATION_MS}ms`,
  };

  return (
    <main className="overlay" style={overlayStyle}>
      <div className="overlay-background" aria-hidden="true">
        <div className="overlay-background-sweep" />
        <div className="overlay-background-rings" />
      </div>

      {matchup && (
        <OverlayCarousel
          key={dataSelectionKey}
          matchup={matchup}
          matchLabel={matchLabel}
          suspended={stageRevealPlayback !== null}
        />
      )}

      {stageRevealPlayback && (
        <div className={`overlay-stage-reveal is-${stageRevealPlayback.phase}`}>
          <video
            aria-label="選択ステージ紹介動画"
            onEnded={() =>
              setStageRevealPlayback((current) =>
                current ? { ...current, phase: "exiting" } : current,
              )
            }
            onError={() => {
              console.error("ステージ動画を再生できませんでした");
              setStageRevealPlayback((current) =>
                current ? { ...current, phase: "exiting" } : current,
              );
            }}
            playsInline
            preload="auto"
            ref={stageRevealVideoRef}
            src={stageRevealPlayback.sourceUrl}
          />

          <img
            className="overlay-stage-reveal-vignette"
            src={STAGE_REVEAL_VIGNETTE_URL}
            alt=""
            aria-hidden="true"
          />

          <StageRevealContent
            rule={stageRevealPlayback.rule}
            stage={stageRevealPlayback.stage}
          />

          <div className="overlay-stage-transition" aria-hidden="true">
            <div className="overlay-stage-transition-grid" />
            <div className="overlay-stage-transition-panel is-left" />
            <div className="overlay-stage-transition-panel is-right" />
            <span className="overlay-stage-transition-scanline" />
            <span className="overlay-stage-transition-corner is-top-left" />
            <span className="overlay-stage-transition-corner is-top-right" />
            <span className="overlay-stage-transition-corner is-bottom-left" />
            <span className="overlay-stage-transition-corner is-bottom-right" />

            <div className="overlay-stage-transition-copy">
              <span className="overlay-stage-transition-overline">
                MAP // LOCKED
              </span>
              <strong>Next Stage</strong>
              <span className="overlay-stage-transition-meta">
                Coming Soon
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
