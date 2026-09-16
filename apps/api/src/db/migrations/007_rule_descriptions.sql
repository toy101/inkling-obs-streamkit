ALTER TABLE rules ADD COLUMN description TEXT NOT NULL DEFAULT '';

UPDATE rules
SET description = 'Teams have three minutes to try to ink more ground than their opponents!'
WHERE id = 'turf_war';

UPDATE rules
SET description = 'Splatter the Splat Zones with ink, then hold your turf to emerge victorious!'
WHERE id = 'splat_zones';

UPDATE rules
SET description = 'Whichever team rides the tower to the goal in the enemy base wins!'
WHERE id = 'tower_control';

UPDATE rules
SET description = 'Bring the Rainmaker to the goal in the enemy base to win!'
WHERE id = 'rainmaker';

UPDATE rules
SET description = 'The team that gets the most clams in their enemy’s basket wins! You’ll need to use a power clam to take down the basket’s barrier first.'
WHERE id = 'clam_blitz';
