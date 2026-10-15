UPDATE tournament_teams
SET status = CASE
  WHEN 4 = (
    SELECT COUNT(*)
    FROM tournament_roster_entries roster
    WHERE roster.tournament_team_id = tournament_teams.id
  ) THEN 'confirmed'
  ELSE 'draft'
END
WHERE status <> 'hidden';
