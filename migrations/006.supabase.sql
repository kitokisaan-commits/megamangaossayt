ALTER TABLE public.chapters ADD COLUMN published_at TEXT;
ALTER TABLE public.chapters ADD COLUMN views BIGINT NOT NULL DEFAULT 0 CHECK(views >= 0);
ALTER TABLE public.view_events ADD COLUMN chapter_id TEXT REFERENCES public.chapters(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS view_events_day ON public.view_events(day);
CREATE INDEX IF NOT EXISTS titles_popular_public ON public.titles(visibility,deleted_at,views DESC);
UPDATE public.chapters SET published_at=coalesce(publish_at,updated_at) WHERE status='Published';
CREATE FUNCTION public.inkora_publication_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='Published' THEN
  IF TG_OP='INSERT' THEN NEW.published_at=coalesce(NEW.publish_at,NEW.updated_at);
  ELSIF OLD.status <> 'Published' OR NEW.publish_at IS DISTINCT FROM OLD.publish_at THEN
   NEW.published_at=coalesce(NEW.publish_at,NEW.updated_at);
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER chapter_publication_stamp BEFORE INSERT OR UPDATE OF status,publish_at ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.inkora_publication_stamp();
CREATE FUNCTION public.inkora_count_view() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.chapter_id IS NULL THEN UPDATE public.titles SET views=views+1 WHERE id=NEW.title_id;
 ELSE UPDATE public.chapters SET views=views+1 WHERE id=NEW.chapter_id; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER view_count_insert AFTER INSERT ON public.view_events FOR EACH ROW EXECUTE FUNCTION public.inkora_count_view();
-- Invoker-only RPC: no browser access. Publication is rechecked in the transaction.
CREATE FUNCTION public.inkora_record_view(target TEXT, chapter TEXT, title_event TEXT, chapter_event TEXT, stamp TEXT) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM titles WHERE id=target AND inkora_public_title(id)) THEN RETURN; END IF;
 IF chapter IS NOT NULL AND NOT EXISTS(SELECT 1 FROM chapters WHERE id=chapter AND title_id=target AND inkora_public_chapter(id)) THEN RETURN; END IF;
 INSERT INTO view_events(id,title_id,day) VALUES(title_event,target,stamp) ON CONFLICT(id) DO NOTHING;
 IF chapter IS NOT NULL THEN
  INSERT INTO view_events(id,title_id,chapter_id,day) VALUES(chapter_event,target,chapter,stamp) ON CONFLICT(id) DO NOTHING;
 END IF;
 DELETE FROM view_events WHERE day < (current_date - 2)::text;
END; $$;
REVOKE ALL ON FUNCTION public.inkora_publication_stamp(),public.inkora_count_view(),public.inkora_record_view(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_record_view(TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
