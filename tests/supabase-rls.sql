-- Run in a TEST Supabase project after the migration. All fixtures roll back.
BEGIN;
INSERT INTO public.titles(id,slug,title,visibility,created_at,updated_at)
VALUES ('rls-test-public','rls-test-public','Public fixture','Published',now()::text,now()::text),
('rls-test-draft','rls-test-draft','Private fixture','Draft',now()::text,now()::text);
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.titles WHERE id='rls-test-public')<>1 THEN RAISE EXCEPTION 'Published title hidden'; END IF;
 IF EXISTS(SELECT 1 FROM public.titles WHERE id='rls-test-draft') THEN RAISE EXCEPTION 'Draft exposed'; END IF;
 BEGIN
  PERFORM * FROM public.admin_users;
  RAISE EXCEPTION 'Admin table exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.titles SET title='tampered' WHERE id='rls-test-public';
  RAISE EXCEPTION 'Anonymous mutation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
