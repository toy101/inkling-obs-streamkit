ALTER TABLE player_weapons RENAME TO player_weapons_legacy;

CREATE TABLE player_weapons (
  player_id TEXT NOT NULL REFERENCES players(id),
  weapon_id TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  PRIMARY KEY (player_id, weapon_id),
  UNIQUE (player_id, display_order)
);

INSERT INTO player_weapons (player_id, weapon_id, display_order)
SELECT player_id, weapon_id, display_order
FROM player_weapons_legacy;

DROP TABLE player_weapons_legacy;

ALTER TABLE tournament_roster_weapons RENAME TO tournament_roster_weapons_legacy;

CREATE TABLE tournament_roster_weapons (
  roster_entry_id TEXT NOT NULL REFERENCES tournament_roster_entries(id),
  weapon_id TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  PRIMARY KEY (roster_entry_id, weapon_id),
  UNIQUE (roster_entry_id, display_order)
);

INSERT INTO tournament_roster_weapons (roster_entry_id, weapon_id, display_order)
SELECT roster_entry_id, weapon_id, display_order
FROM tournament_roster_weapons_legacy;

DROP TABLE tournament_roster_weapons_legacy;

DROP TABLE weapons;
