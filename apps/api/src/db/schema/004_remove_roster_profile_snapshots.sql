ALTER TABLE tournament_roster_weapons RENAME TO tournament_roster_weapons_legacy;

ALTER TABLE tournament_roster_entries RENAME TO tournament_roster_entries_legacy;

CREATE TABLE tournament_roster_entries (
  id TEXT PRIMARY KEY NOT NULL,
  tournament_team_id TEXT NOT NULL REFERENCES tournament_teams(id),
  registered_name TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  player_id TEXT REFERENCES players(id),
  UNIQUE (tournament_team_id, display_order)
);

INSERT INTO tournament_roster_entries (
  id,
  tournament_team_id,
  registered_name,
  display_order,
  player_id
)
SELECT
  id,
  tournament_team_id,
  registered_name,
  display_order,
  player_id
FROM tournament_roster_entries_legacy;

CREATE TABLE tournament_roster_weapons (
  roster_entry_id TEXT NOT NULL REFERENCES tournament_roster_entries(id),
  weapon_id TEXT NOT NULL REFERENCES weapons(id),
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  PRIMARY KEY (roster_entry_id, weapon_id),
  UNIQUE (roster_entry_id, display_order)
);

INSERT INTO tournament_roster_weapons (
  roster_entry_id,
  weapon_id,
  display_order
)
SELECT
  roster_entry_id,
  weapon_id,
  display_order
FROM tournament_roster_weapons_legacy;

DROP TABLE tournament_roster_weapons_legacy;

DROP TABLE tournament_roster_entries_legacy;
