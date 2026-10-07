-- Compound metadata/page writes use synchronous SQLite transactions.
CREATE INDEX IF NOT EXISTS pages_asset ON chapter_pages(asset_id);
