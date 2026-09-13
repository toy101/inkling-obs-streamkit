import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  subscribeOverlaySelection,
} from "../lib/overlay-state";

const SLIDE_DURATION_MS = 8_000;
const MAX_TEAM_NAME_FONT_SIZE = 62;
const MIN_TEAM_NAME_FONT_SIZE = 36;

type OverlayTeam = OverlayMatchup["alpha"];
type OverlayPlayer = OverlayTeam["players"][number];
type OverlayWeapon = OverlayPlayer["weapons"][number];
type TeamDesignation = "alpha" | "bravo";
type TeamPosition = "left" | "right";

type OverlayStyle = CSSProperties & {
  "--overlay-accent-color": string;
  "--overlay-accent-rgb": string;
};

type MatchupQuery = {
  tournamentId: string;
  alphaTournamentTeamId: string;
  bravoTournamentTeamId: string;
  ruleId: string;
  stageId: string;
};

const matchupRequests = new Map<string, Promise<OverlayMatchup | null>>();

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

type FittedTeamNameProps = {
  name: string;
};

function FittedTeamName({ name }: FittedTeamNameProps) {
  const elementRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let fontSize = MAX_TEAM_NAME_FONT_SIZE;
    element.style.fontSize = `${fontSize}px`;

    while (
      fontSize > MIN_TEAM_NAME_FONT_SIZE &&
      element.scrollWidth > element.clientWidth
    ) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;
    }
  }, [name]);

  return <span ref={elementRef}>{name}</span>;
}

function MatchInfoSlide({ matchup }: MatchupSlideProps) {
  return (
    <section className="overlay-match-info" aria-label="次の対戦情報">
      <header className="overlay-slide-header overlay-match-info-header">
        <span className="overlay-slide-eyebrow">NEXT MATCH</span>
        <p>{matchup.tournament.name}</p>
        <h1>
          <FittedTeamName name={matchup.alpha.name} />
          <b aria-label="対">VS</b>
          <FittedTeamName name={matchup.bravo.name} />
        </h1>
      </header>

      <dl className="overlay-match-info-grid">
        <div>
          <dt>RULE</dt>
          <dd>{matchup.rule.name}</dd>
        </div>
        <div>
          <dt>STAGE</dt>
          <dd>{matchup.stage.name}</dd>
        </div>
      </dl>
    </section>
  );
}

type CarouselState = {
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
    autoplay: current.autoplay,
    loadBravoTeamImages:
      current.loadBravoTeamImages || slideIndex === 1 || slideIndex === 2,
    slideIndex,
    slideVersion: current.slideVersion + 1,
  };
}

function OverlayCarousel({ matchup, matchLabel }: MatchupCardSlideProps) {
  const [carouselState, setCarouselState] = useState<CarouselState>({
    autoplay: true,
    loadBravoTeamImages: false,
    slideIndex: 0,
    slideVersion: 0,
  });
  const { autoplay, loadBravoTeamImages, slideIndex, slideVersion } =
    carouselState;

  useEffect(() => {
    if (!autoplay) {
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
  }, [autoplay, slideVersion]);

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
    { id: "match-info", content: <MatchInfoSlide matchup={matchup} /> },
  ];

  return (
    <div className={`overlay-carousel${autoplay ? "" : " is-paused"}`}>
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

export function Overlay() {
  const [selection, setSelection] = useState(getOverlaySelection);
  const [loaded, setLoaded] = useState<LoadedMatchup | null>(null);

  const tournamentId = selection?.tournamentId ?? "";
  const alphaTournamentTeamId = selection?.alphaTournamentTeamId ?? "";
  const bravoTournamentTeamId = selection?.bravoTournamentTeamId ?? "";
  const ruleId = selection?.ruleId ?? "";
  const stageId = selection?.stageId ?? "";
  const accentColor = selection?.accentColor ?? DEFAULT_ACCENT_COLOR;
  const matchLabel = selection?.matchLabel ?? "";
  const dataSelectionKey = [
    tournamentId,
    alphaTournamentTeamId,
    bravoTournamentTeamId,
    ruleId,
    stageId,
  ].join(":");

  useEffect(() => {
    return subscribeOverlaySelection(setSelection);
  }, []);

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
    ruleId,
    dataSelectionKey,
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
        />
      )}
    </main>
  );
}
