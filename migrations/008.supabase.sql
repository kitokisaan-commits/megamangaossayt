CREATE INDEX chapters_title_public_order ON public.chapters(title_id,status,deleted_at,sort_order DESC,number DESC);
-- Catalogue/home receive two chapters and a count per title, not every chapter.
CREATE FUNCTION public.inkora_chapter_summaries(title_ids TEXT[],stamp TEXT) RETURNS TABLE(title_id TEXT,chapter_count BIGINT,latest_chapter_at TEXT,chapters JSONB) LANGUAGE sql STABLE SET search_path=public AS $$
 WITH ranked AS (
  SELECT c.*, count(*) OVER(PARTITION BY c.title_id) AS total,
   max(coalesce(c.published_at,c.publish_at,c.updated_at)) OVER(PARTITION BY c.title_id) AS latest,
   row_number() OVER(PARTITION BY c.title_id ORDER BY coalesce(c.published_at,c.publish_at,c.updated_at) DESC,c.sort_order DESC,c.number DESC) AS rank
  FROM chapters c WHERE c.title_id=ANY(title_ids) AND c.deleted_at IS NULL AND c.status='Published'
   AND (c.publish_at IS NULL OR c.publish_at::timestamptz <= stamp::timestamptz)
 )
 SELECT r.title_id,max(r.total),max(r.latest),jsonb_agg(jsonb_build_object(
 'id',r.id,'title_id',r.title_id,'number',r.number,'name',r.name,'sort_order',r.sort_order,
 'status',r.status,'published_at',r.published_at,'publish_at',r.publish_at,'updated_at',r.updated_at,'page_count',r.page_count
 ) ORDER BY r.rank) FROM ranked r WHERE r.rank <= 2 GROUP BY r.title_id;
$$;
REVOKE ALL ON FUNCTION public.inkora_chapter_summaries(TEXT[],TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_chapter_summaries(TEXT[],TEXT) TO service_role;
