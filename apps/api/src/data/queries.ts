import { requireWeapon } from "../catalog-store";
import { createJsonDataSource } from "./json-data-source";
import { players } from "./players";
import {
  tournamentRosterEntries,
  tournaments,
  tournamentTeams,
} from "./tournaments";

export const jsonDataSource = createJsonDataSource({
  players,
  tournaments,
  tournamentTeams,
  tournamentRosterEntries,
  weaponCatalog: { requireWeapon },
});
