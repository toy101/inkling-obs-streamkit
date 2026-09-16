CREATE TABLE rules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE CHECK (display_order >= 1)
);

CREATE TABLE stages (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE CHECK (display_order >= 1)
);
