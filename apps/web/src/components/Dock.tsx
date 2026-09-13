import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { api } from "../lib/api";
import type { Rule, Stage, Tournament, TournamentTeam } from "../lib/api";
import {
  DEFAULT_ACCENT_COLOR,
  getOverlaySelection,
  isAccentColor,
  MATCH_LABEL_MAX_LENGTH,
  setOverlaySelection,
} from "../lib/overlay-state";

type DockStyle = CSSProperties & {
  "--dock-accent-color": string;
};

const ACCENT_SATURATION = 95;
const ACCENT_LIGHTNESS = 50;

function getHueFromHex(color: string): number {
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;

  if (difference === 0) {
    return 0;
  }

  let hue: number;

  if (maximum === red) {
    hue = 60 * (((green - blue) / difference) % 6);
  } else if (maximum === green) {
    hue = 60 * ((blue - red) / difference + 2);
  } else {
    hue = 60 * ((red - green) / difference + 4);
  }

  return Math.round((hue + 360) % 360);
}

function getAccentColorFromHue(hue: number): string {
  const saturation = ACCENT_SATURATION / 100;
  const lightness = ACCENT_LIGHTNESS / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export function Dock() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(
    () => getOverlaySelection()?.tournamentId ?? "",
  );
  const [alphaTeamId, setAlphaTeamId] = useState(
    () => getOverlaySelection()?.alphaTournamentTeamId ?? "",
  );
  const [bravoTeamId, setBravoTeamId] = useState(
    () => getOverlaySelection()?.bravoTournamentTeamId ?? "",
  );
  const [ruleId, setRuleId] = useState(
    () => getOverlaySelection()?.ruleId ?? "",
  );
  const [stageId, setStageId] = useState(
    () => getOverlaySelection()?.stageId ?? "",
  );
  const [matchLabel, setMatchLabel] = useState(
    () => getOverlaySelection()?.matchLabel ?? "",
  );
  const [accentColor, setAccentColor] = useState(() => {
    const storedAccentColor =
      getOverlaySelection()?.accentColor ?? DEFAULT_ACCENT_COLOR;

    return getAccentColorFromHue(getHueFromHex(storedAccentColor));
  });

  useEffect(() => {
    let cancelled = false;

    const loadTournaments = async () => {
      const { data, error } = await api.tournaments.get();

      if (error) {
        console.error(error);
        return;
      }

      if (cancelled) {
        return;
      }

      setTournaments(data);

      const storedTournamentId = getOverlaySelection()?.tournamentId;
      const initialTournamentId = data.some(
        (tournament) => tournament.id === storedTournamentId,
      )
        ? (storedTournamentId ?? "")
        : (data[0]?.id ?? "");
      setSelectedTournamentId(initialTournamentId);
    };

    void loadTournaments();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadMatchupCatalogs = async () => {
      const [rulesResponse, stagesResponse] = await Promise.all([
        api.rules.get(),
        api.stages.get(),
      ]);

      if (rulesResponse.error) {
        console.error(rulesResponse.error);
        return;
      }
      if (stagesResponse.error) {
        console.error(stagesResponse.error);
        return;
      }
      if (cancelled) {
        return;
      }

      const storedSelection = getOverlaySelection();
      const initialRuleId = rulesResponse.data.some(
        (rule) => rule.id === storedSelection?.ruleId,
      )
        ? (storedSelection?.ruleId ?? "")
        : (rulesResponse.data[0]?.id ?? "");
      const initialStageId = stagesResponse.data.some(
        (stage) => stage.id === storedSelection?.stageId,
      )
        ? (storedSelection?.stageId ?? "")
        : (stagesResponse.data[0]?.id ?? "");

      setRules(rulesResponse.data);
      setStages(stagesResponse.data);
      setRuleId(initialRuleId);
      setStageId(initialStageId);
    };

    void loadMatchupCatalogs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTournamentId) {
      return;
    }

    let cancelled = false;

    const loadTeams = async () => {
      const { data, error } = await api
        .tournaments({ id: selectedTournamentId })
        .teams.get();

      if (error) {
        console.error(error);
        return;
      }

      if (cancelled) {
        return;
      }

      const storedSelection = getOverlaySelection();
      const canReuseStoredTeams =
        storedSelection?.tournamentId === selectedTournamentId;
      const storedAlphaTeamId = canReuseStoredTeams
        ? storedSelection.alphaTournamentTeamId
        : "";
      const initialAlphaTeamId = data.some(
        (team) => team.id === storedAlphaTeamId,
      )
        ? storedAlphaTeamId
        : (data[0]?.id ?? "");
      const storedBravoTeamId = canReuseStoredTeams
        ? storedSelection.bravoTournamentTeamId
        : "";
      const initialBravoTeamId = data.some(
        (team) =>
          team.id === storedBravoTeamId && team.id !== initialAlphaTeamId,
      )
        ? storedBravoTeamId
        : (data.find((team) => team.id !== initialAlphaTeamId)?.id ?? "");

      setTeams(data);
      setAlphaTeamId(initialAlphaTeamId);
      setBravoTeamId(initialBravoTeamId);
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, [selectedTournamentId]);

  const handleTournamentChange = (tournamentId: string) => {
    setTeams([]);
    setAlphaTeamId("");
    setBravoTeamId("");
    setSelectedTournamentId(tournamentId);
  };

  const canSubmit = Boolean(
    selectedTournamentId &&
    alphaTeamId &&
    bravoTeamId &&
    ruleId &&
    stageId &&
    isAccentColor(accentColor) &&
    alphaTeamId !== bravoTeamId,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setOverlaySelection({
      tournamentId: selectedTournamentId,
      alphaTournamentTeamId: alphaTeamId,
      bravoTournamentTeamId: bravoTeamId,
      ruleId,
      stageId,
      accentColor,
      matchLabel,
    });
  };

  const dockStyle: DockStyle = {
    "--dock-accent-color": accentColor,
  };
  const accentHue = getHueFromHex(accentColor);

  return (
    <main className="dock">
      <form onSubmit={handleSubmit} style={dockStyle}>
        <h3>Inkling StreamKit Controller</h3>
        <label>
          大会
          <select
            value={selectedTournamentId}
            onChange={(event) => handleTournamentChange(event.target.value)}
          >
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dock-match-label">
          対戦名
          <input
            type="text"
            value={matchLabel}
            maxLength={MATCH_LABEL_MAX_LENGTH}
            placeholder="例：1回戦、決勝戦"
            onChange={(event) => setMatchLabel(event.target.value)}
          />
        </label>
        <div className="dock-team-selectors">
          <label>
            アルファチーム
            <select
              value={alphaTeamId}
              disabled={teams.length < 2}
              onChange={(event) => setAlphaTeamId(event.target.value)}
            >
              {teams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={team.id === bravoTeamId}
                >
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <span className="dock-versus" aria-hidden="true">
            VS
          </span>

          <label>
            ブラボーチーム
            <select
              value={bravoTeamId}
              disabled={teams.length < 2}
              onChange={(event) => setBravoTeamId(event.target.value)}
            >
              {teams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={team.id === alphaTeamId}
                >
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dock-match-settings">
          <h2>次の対戦</h2>

          <label>
            ルール
            <select
              value={ruleId}
              disabled={rules.length === 0}
              onChange={(event) => setRuleId(event.target.value)}
            >
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            ステージ
            <select
              value={stageId}
              disabled={stages.length === 0}
              onChange={(event) => setStageId(event.target.value)}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dock-accent-setting">
          アクセントカラー
          <span className="dock-accent-control">
            <input
              id="dock-accent-hue"
              type="range"
              min="0"
              max="359"
              step="1"
              value={accentHue}
              onChange={(event) =>
                setAccentColor(
                  getAccentColorFromHue(Number(event.target.value)),
                )
              }
              aria-label="accent-control-hue"
              aria-valuetext={accentColor.toUpperCase()}
            />
          </span>
        </label>
        <button className="dock-submit" type="submit" disabled={!canSubmit}>
          Overlayへ反映
        </button>
      </form>
    </main>
  );
}
