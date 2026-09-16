import type { PlayerProfile } from "../models/player";
import playerData from "../data/players.json";

// 編集しやすいJSONを開発中の正本とし、APIとTursoのseedで共用する。
export const players: PlayerProfile[] = playerData;
