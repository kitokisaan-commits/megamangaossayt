CREATE TABLE public.rate_limits(id TEXT PRIMARY KEY,"window" BIGINT NOT NULL,count INTEGER NOT NULL CHECK(count>=1));
CREATE INDEX rate_limits_window ON public.rate_limits("window");
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon,authenticated;
GRANT ALL ON public.rate_limits TO service_role;
CREATE FUNCTION public.inkora_rate_limit(identity_key TEXT,window_value BIGINT,maximum INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql SET search_path=public AS $$
DECLARE accepted TEXT;
BEGIN
 INSERT INTO rate_limits(id,"window",count) VALUES(identity_key,window_value,1)
 ON CONFLICT(id) DO UPDATE SET "window"=excluded."window",count=CASE WHEN rate_limits."window"=excluded."window" THEN rate_limits.count+1 ELSE 1 END
 WHERE rate_limits."window" <> excluded."window" OR rate_limits.count < maximum RETURNING id INTO accepted;
 DELETE FROM rate_limits WHERE "window" < window_value - 2;
 RETURN accepted IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.inkora_rate_limit(TEXT,BIGINT,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inkora_rate_limit(TEXT,BIGINT,INTEGER) TO service_role;
