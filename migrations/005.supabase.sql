-- Preserve existing rows; compound content saves roll back completely on any failure.
CREATE OR REPLACE FUNCTION public.inkora_save_title(target TEXT,metadata JSONB,alt_names TEXT[],genre_names TEXT[],actor_id TEXT,create_new BOOLEAN,stamp TEXT)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE name_value TEXT; genre_id_value TEXT;
BEGIN
  IF create_new THEN
    INSERT INTO titles(id,slug,title,created_by,created_at,updated_at) VALUES(target,metadata->>'slug',metadata->>'title',actor_id,stamp,stamp);
  END IF;
  PERFORM 1 FROM titles WHERE id=target FOR UPDATE;
  UPDATE titles SET title=(metadata->>'title'),
    slug=(metadata->>'slug'),
    description=(metadata->>'description'),
    type=(metadata->>'type'),
    status=(metadata->>'status'),
    year=(metadata->>'year')::INTEGER,
    author=(metadata->>'author'),
    artist=(metadata->>'artist'),
    tags=(metadata->>'tags'),
    age_label=(metadata->>'age_label'),
    direction=(metadata->>'direction'),
    origin=(metadata->>'origin'),
    language=(metadata->>'language'),
    publication_status=(metadata->>'publication_status'),
    featured=(metadata->>'featured')::INTEGER,
    visibility=(metadata->>'visibility'),
    seo_title=(metadata->>'seo_title'),
    seo_description=(metadata->>'seo_description'),updated_at=stamp WHERE id=target;
  DELETE FROM title_alt_names WHERE title_id=target;
  DELETE FROM title_genres WHERE title_id=target;
  FOREACH name_value IN ARRAY alt_names LOOP
    INSERT INTO title_alt_names(id,title_id,name) VALUES(gen_random_uuid()::text,target,name_value);
  END LOOP;
  FOREACH name_value IN ARRAY genre_names LOOP
    INSERT INTO genres(id,name) VALUES(gen_random_uuid()::text,name_value) ON CONFLICT(name) DO NOTHING;
    SELECT id INTO genre_id_value FROM genres WHERE name=name_value;
    INSERT INTO title_genres(id,title_id,genre_id) VALUES(gen_random_uuid()::text,target,genre_id_value);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.inkora_assign_editors(target TEXT,editor_ids TEXT[])
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE editor_id_value TEXT;
BEGIN
  PERFORM 1 FROM titles WHERE id=target FOR UPDATE;
  IF EXISTS(SELECT 1 FROM unnest(editor_ids) x WHERE NOT EXISTS(SELECT 1 FROM admin_users WHERE id=x AND role='EDITOR' AND active=1))
  THEN RAISE EXCEPTION 'Faol editor topilmadi.'; END IF;
  DELETE FROM title_editors WHERE title_id=target;
  FOREACH editor_id_value IN ARRAY editor_ids LOOP
    INSERT INTO title_editors(id,title_id,user_id) VALUES(gen_random_uuid()::text,target,editor_id_value);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.inkora_replace_page(chapter TEXT,target TEXT,replacement TEXT,expected_asset TEXT)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE replacement_asset TEXT;
BEGIN
  PERFORM 1 FROM chapters WHERE id=chapter FOR UPDATE;
  SELECT asset_id INTO replacement_asset FROM chapter_pages WHERE id=replacement AND chapter_id=chapter;
  IF target=replacement OR replacement_asset IS NULL OR NOT EXISTS(SELECT 1 FROM chapter_pages WHERE id=target AND chapter_id=chapter AND asset_id=expected_asset)
  THEN RAISE EXCEPTION 'Sahifalar ro‘yxati o‘zgargan. Yangilang.'; END IF;
  UPDATE chapter_pages SET asset_id=replacement_asset,rotation=0 WHERE id=target;
  DELETE FROM chapter_pages WHERE id=replacement;
END $$;
CREATE OR REPLACE FUNCTION public.inkora_remove_page(chapter TEXT,target TEXT,expected_asset TEXT)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM chapters WHERE id=chapter FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM chapter_pages WHERE id=target AND chapter_id=chapter AND asset_id=expected_asset)
  THEN RAISE EXCEPTION 'Sahifalar ro‘yxati o‘zgargan. Yangilang.'; END IF;
  IF EXISTS(SELECT 1 FROM chapters WHERE id=chapter AND status='Published') AND (SELECT count(*) FROM chapter_pages WHERE chapter_id=chapter)<=1
  THEN RAISE EXCEPTION 'Oxirgi sahifani o‘chirishdan oldin bobni draft qiling.'; END IF;
  DELETE FROM chapter_pages WHERE id=target;
END $$;
REVOKE ALL ON FUNCTION public.inkora_save_title(TEXT,JSONB,TEXT[],TEXT[],TEXT,BOOLEAN,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_save_title(TEXT,JSONB,TEXT[],TEXT[],TEXT,BOOLEAN,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.inkora_assign_editors(TEXT,TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_assign_editors(TEXT,TEXT[]) TO service_role;
REVOKE ALL ON FUNCTION public.inkora_replace_page(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_replace_page(TEXT,TEXT,TEXT,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.inkora_remove_page(TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_remove_page(TEXT,TEXT,TEXT) TO service_role;
