-- Append-only upgrade: publication timestamps and privacy-preserving counters.
ALTER TABLE chapters ADD COLUMN published_at TEXT;
ALTER TABLE chapters ADD COLUMN views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0);
ALTER TABLE view_events ADD COLUMN chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS view_events_day ON view_events(day);
CREATE INDEX IF NOT EXISTS titles_popular_public ON titles(visibility,deleted_at,views DESC);
UPDATE chapters SET published_at=coalesce(publish_at,updated_at) WHERE status='Published';
CREATE TRIGGER chapter_publication_insert AFTER INSERT ON chapters WHEN NEW.status='Published' AND NEW.published_at IS NULL BEGIN
 UPDATE chapters SET published_at=coalesce(NEW.publish_at,NEW.updated_at) WHERE id=NEW.id;
END;
CREATE TRIGGER chapter_publication_update AFTER UPDATE OF status,publish_at ON chapters WHEN NEW.status='Published' AND (OLD.status <> 'Published' OR coalesce(NEW.publish_at,'') <> coalesce(OLD.publish_at,'')) BEGIN
 UPDATE chapters SET published_at=coalesce(NEW.publish_at,NEW.updated_at) WHERE id=NEW.id;
END;
CREATE TRIGGER view_count_insert AFTER INSERT ON view_events BEGIN
 UPDATE titles SET views=views+1 WHERE id=NEW.title_id AND NEW.chapter_id IS NULL;
 UPDATE chapters SET views=views+1 WHERE id=NEW.chapter_id;
END;
PRAGMA optimize;
