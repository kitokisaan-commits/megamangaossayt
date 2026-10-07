-- Local compound CMS writes use BEGIN IMMEDIATE in server/db.ts.
CREATE INDEX IF NOT EXISTS chapters_updated ON chapters(updated_at);

ALTER TABLE upload_jobs ADD COLUMN master_key TEXT;
