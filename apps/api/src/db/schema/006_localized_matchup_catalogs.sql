ALTER TABLE rules ADD COLUMN name_en TEXT NOT NULL DEFAULT '';
ALTER TABLE stages ADD COLUMN name_en TEXT NOT NULL DEFAULT '';

UPDATE rules SET id = 'turf_war', name_en = 'Turf War' WHERE id = 'turf-war';
UPDATE rules SET id = 'splat_zones', name_en = 'Splat Zones' WHERE id = 'splat-zones';
UPDATE rules SET id = 'tower_control', name_en = 'Tower Control' WHERE id = 'tower-control';
UPDATE rules SET id = 'rainmaker', name_en = 'Rainmaker' WHERE id = 'rainmaker';
UPDATE rules SET id = 'clam_blitz', name_en = 'Clam Blitz' WHERE id = 'clam-blitz';

UPDATE stages SET id = 'scorch_gorge', name_en = 'Scorch Gorge' WHERE id = 'scorch-gorge';
UPDATE stages SET id = 'eeltail_alley', name_en = 'Eeltail Alley' WHERE id = 'eeltail-alley';
UPDATE stages SET id = 'undertow_spillway', name_en = 'Undertow Spillway' WHERE id = 'undertow-spillway';
UPDATE stages SET id = 'mincemeat_metalworks', name_en = 'Mincemeat Metalworks' WHERE id = 'mincemeat-metalworks';
UPDATE stages SET id = 'hammerhead_bridge', name_en = 'Hammerhead Bridge' WHERE id = 'hammerhead-bridge';
