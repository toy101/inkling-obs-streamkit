ALTER TABLE tournament_teams
ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
CHECK (status IN ('draft', 'confirmed', 'hidden'));
