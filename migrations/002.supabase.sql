-- Append-only Part 1 hardening. Apply after 001.supabase.sql.
BEGIN;
ALTER TABLE titles ADD CONSTRAINT titles_type_check CHECK(type IN ('Manga','Manhwa','Manhua','Webtoon'));
ALTER TABLE titles ADD CONSTRAINT titles_status_check CHECK(status IN ('Ongoing','Completed','Hiatus','Cancelled'));
ALTER TABLE titles ADD CONSTRAINT titles_direction_check CHECK(direction IN ('ltr','rtl','vertical'));
ALTER TABLE titles ADD CONSTRAINT titles_year_check CHECK(year IS NULL OR year BETWEEN 1000 AND 2200);
ALTER TABLE titles ADD CONSTRAINT titles_views_check CHECK(views>=0);
ALTER TABLE assets ADD CONSTRAINT assets_dimensions_check CHECK(width>0 AND height>0 AND bytes>=0 AND source_bytes>=0);
ALTER TABLE chapter_pages ADD CONSTRAINT pages_position_check CHECK(position>=0);
ALTER TABLE chapter_pages ADD CONSTRAINT pages_rotation_check CHECK(rotation IN (0,90,180,270));
ALTER TABLE chapters ADD COLUMN page_count INTEGER NOT NULL DEFAULT 0 CHECK(page_count>=0);
UPDATE chapters c SET page_count=(SELECT count(*) FROM chapter_pages p WHERE p.chapter_id=c.id);
CREATE FUNCTION public.inkora_page_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN UPDATE chapters SET page_count=(SELECT count(*) FROM chapter_pages WHERE chapter_id=OLD.chapter_id) WHERE id=OLD.chapter_id; END IF;
 IF TG_OP <> 'DELETE' THEN UPDATE chapters SET page_count=(SELECT count(*) FROM chapter_pages WHERE chapter_id=NEW.chapter_id) WHERE id=NEW.chapter_id; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER chapters_page_count AFTER INSERT OR DELETE OR UPDATE OF chapter_id ON chapter_pages FOR EACH ROW EXECUTE FUNCTION public.inkora_page_count();
CREATE FUNCTION public.inkora_page_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM assets a JOIN chapters c ON c.id=NEW.chapter_id WHERE a.id=NEW.asset_id AND a.chapter_id=c.id AND a.title_id=c.title_id) THEN RAISE EXCEPTION 'Page asset must belong to its chapter and title' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pages_same_chapter BEFORE INSERT OR UPDATE ON chapter_pages FOR EACH ROW EXECUTE FUNCTION public.inkora_page_owner();
REVOKE ALL ON FUNCTION public.inkora_page_count(), public.inkora_page_owner() FROM PUBLIC;
-- Private metadata and settings remain inaccessible directly to anonymous clients.
-- Future public-account tables must use auth.uid() ownership; no public signup in V1.
COMMIT;
