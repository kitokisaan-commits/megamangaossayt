-- Compound CMS mutations are atomic. No browser role can execute these RPCs.
CREATE OR REPLACE FUNCTION public.inkora_reorder_pages(target TEXT, page_ids TEXT[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM chapters WHERE id=target FOR UPDATE;
  IF cardinality(page_ids) <> (SELECT count(*) FROM chapter_pages WHERE chapter_id=target)
    OR cardinality(page_ids) <> (SELECT count(DISTINCT x) FROM unnest(page_ids) x)
    OR EXISTS (SELECT 1 FROM unnest(page_ids) x WHERE NOT EXISTS (SELECT 1 FROM chapter_pages p WHERE p.id=x AND p.chapter_id=target))
  THEN RAISE EXCEPTION 'Sahifalar ro‘yxati o‘zgargan. Yangilang.'; END IF;
  UPDATE chapter_pages p SET position=ordered.ordinality-1
    FROM unnest(page_ids) WITH ORDINALITY ordered(id,ordinality) WHERE p.id=ordered.id AND p.chapter_id=target;
END $$;
CREATE OR REPLACE FUNCTION public.inkora_bulk_chapters(target TEXT, chapter_ids TEXT[], operation TEXT, actor_id TEXT, timestamp_value TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF operation NOT IN ('publish','draft','archive') OR cardinality(chapter_ids)<1 OR cardinality(chapter_ids)>100
    OR cardinality(chapter_ids)<>(SELECT count(DISTINCT x) FROM unnest(chapter_ids) x)
  THEN RAISE EXCEPTION 'Boblar ro‘yxati noto‘g‘ri.'; END IF;
  PERFORM 1 FROM chapters WHERE id=ANY(chapter_ids) ORDER BY id FOR UPDATE;
  IF cardinality(chapter_ids)<>(SELECT count(*) FROM chapters WHERE id=ANY(chapter_ids) AND title_id=target AND deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Boblar ro‘yxati o‘zgargan.'; END IF;
  IF operation='publish' AND EXISTS (SELECT 1 FROM chapters c WHERE id=ANY(chapter_ids) AND NOT EXISTS(SELECT 1 FROM chapter_pages p WHERE p.chapter_id=c.id))
  THEN RAISE EXCEPTION 'Bo‘sh bobni nashr qilib bo‘lmaydi.'; END IF;
  UPDATE chapters SET status=CASE WHEN operation='publish' THEN 'Published' ELSE 'Draft' END,
    publish_at=NULL, deleted_at=CASE WHEN operation='archive' THEN timestamp_value ELSE NULL END,
    updated_by=actor_id,updated_at=timestamp_value WHERE id=ANY(chapter_ids);
END $$;
REVOKE ALL ON FUNCTION public.inkora_reorder_pages(TEXT,TEXT[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.inkora_bulk_chapters(TEXT,TEXT[],TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_reorder_pages(TEXT,TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.inkora_bulk_chapters(TEXT,TEXT[],TEXT,TEXT,TEXT) TO service_role;

ALTER TABLE upload_jobs ADD COLUMN master_key TEXT;
