import { useEffect, useState } from "react";

import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from "../lib/overlay-canvas";

import type { Player } from "../../../api/src";
import { api } from "../lib/api";
import {
  getSelectedPlayerId,
  subscribeSelectedPlayerId,
} from "../lib/overlay-state";

export function Overlay() {
  const [playerId, setPlayerId] = useState<string | null>(getSelectedPlayerId);

  const [loadedPlayer, setLoadedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    return subscribeSelectedPlayerId(setPlayerId);
  }, []);

  useEffect(() => {
    if (!playerId) {
      return;
    }

    const loadPlayer = async () => {
      const { data, error } = await api
        .players({
          id: playerId,
        })
        .get();

      if (error) {
        console.error(error);
        return;
      }

      setLoadedPlayer(data);
    };

    void loadPlayer();
  }, [playerId]);

  // 未選択時のクリアは effect ではなく描画時に決める
  const player = playerId ? loadedPlayer : null;

  return (
    <main
      className="overlay"
      style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT }}
    >
      {player && (
        <div className="player">
          <h1>{player.name}</h1>
          <p>{player.team}</p>
        </div>
      )}
    </main>
  );
}
