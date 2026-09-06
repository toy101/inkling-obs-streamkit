import { useEffect, useState } from "react";

import type { Player } from "../../../api/src";
import { api } from "../lib/api";
import { getSelectedPlayerId, setSelectedPlayerId } from "../lib/overlay-state";

export function Dock() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelected] = useState(
    () => getSelectedPlayerId() ?? "",
  );

  useEffect(() => {
    const loadPlayers = async () => {
      const { data, error } = await api.players.get();

      if (error) {
        console.error(error);
        return;
      }

      setPlayers(data);

      // まだ何も選択されていなければ最初のプレイヤー
      if (!getSelectedPlayerId() && data.length > 0) {
        const id = data[0].id;

        setSelected(id);
        setSelectedPlayerId(id);
      }
    };

    void loadPlayers();
  }, []);

  const handleChange = (playerId: string) => {
    setSelected(playerId);
    setSelectedPlayerId(playerId);
  };

  return (
    <main className="dock">
      <h1>Overlay Controller</h1>

      <label>
        Player
        <select
          value={selectedPlayerId}
          onChange={(event) => handleChange(event.target.value)}
        >
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
    </main>
  );
}
