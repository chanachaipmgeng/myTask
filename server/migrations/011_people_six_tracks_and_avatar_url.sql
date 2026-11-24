ALTER TABLE people DROP CONSTRAINT IF EXISTS people_track_check;
ALTER TABLE people ADD CONSTRAINT people_track_check
  CHECK (track IN ('Implement', 'RD', 'IMP', 'RND', 'QA', 'UXBA', 'SUP', 'INFRA'));

UPDATE people
SET avatar_url = regexp_replace(avatar_url, '^(https?://[^/]+)/users/([0-9]+)/avatar/?$', '\1/api/v3/users/\2/avatar')
WHERE avatar_url ~ '^https?://[^/]+/users/[0-9]+/avatar/?$';
