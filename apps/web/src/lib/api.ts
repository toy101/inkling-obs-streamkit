import { treaty } from "@elysia/eden";
import type { Treaty } from "@elysia/eden";

import type { App } from "../../../api/src";

function readApiUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      "VITE_API_URL must be set. Copy apps/web/.env.example to apps/web/.env.local.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_URL must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("VITE_API_URL must use HTTP or HTTPS.");
  }
  return url.href.replace(/\/$/, "");
}

export const api = treaty<App>(readApiUrl(import.meta.env.VITE_API_URL));

export type PlayerProfile = Treaty.Data<typeof api.players.get>[number];
export type Weapon = Treaty.Data<typeof api.weapons.get>[number];
export type Rule = Treaty.Data<typeof api.rules.get>[number];
export type Stage = Treaty.Data<typeof api.stages.get>[number];
export type Tournament = Treaty.Data<typeof api.tournaments.get>[number];

type TournamentRoute = ReturnType<typeof api.tournaments>;
export type TournamentTeam = Treaty.Data<
  TournamentRoute["teams"]["get"]
>[number];

export type OverlayParticipants = NonNullable<
  Treaty.Data<typeof api.overlay.participants.get>
>;
export type OverlayMatchup = NonNullable<
  Treaty.Data<typeof api.overlay.matchup.get>
>;
