CREATE TABLE weapons (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE positions (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 1)
);

CREATE TABLE players (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon_url TEXT,
  position_id TEXT REFERENCES positions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE player_weapons (
  player_id TEXT NOT NULL REFERENCES players(id),
  weapon_id TEXT NOT NULL REFERENCES weapons(id),
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  PRIMARY KEY (player_id, weapon_id),
  UNIQUE (player_id, display_order)
);

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY NOT NULL,
  organizer_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'registration', 'locked', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tournament_teams (
  id TEXT PRIMARY KEY NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 1),
  roster_locked_at TEXT,
  UNIQUE (tournament_id, display_order)
);

CREATE TABLE tournament_roster_entries (
  id TEXT PRIMARY KEY NOT NULL,
  tournament_team_id TEXT NOT NULL REFERENCES tournament_teams(id),
  registered_name TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  player_id TEXT REFERENCES players(id),
  position_snapshot_id TEXT REFERENCES positions(id),
  icon_url_snapshot TEXT,
  profile_captured_at TEXT,
  UNIQUE (tournament_team_id, display_order)
);

CREATE TABLE tournament_roster_weapons (
  roster_entry_id TEXT NOT NULL REFERENCES tournament_roster_entries(id),
  weapon_id TEXT NOT NULL REFERENCES weapons(id),
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  PRIMARY KEY (roster_entry_id, weapon_id),
  UNIQUE (roster_entry_id, display_order)
);

CREATE TABLE seed_history (
  name TEXT PRIMARY KEY NOT NULL
);
