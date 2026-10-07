CREATE INDEX chapters_title_public_order ON chapters(title_id,status,deleted_at,sort_order DESC,number DESC);
PRAGMA optimize;
