-- Keep a per-account revision even when the latest snapshot contains no rows.
CREATE TABLE public.music_feedback_sync_state (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_feedback_sync_state TO authenticated;
GRANT ALL ON public.music_feedback_sync_state TO service_role;
--> statement-breakpoint
ALTER TABLE public.music_feedback_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback sync state" ON public.music_feedback_sync_state
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

-- Replace one user's feedback snapshot in a single transaction. The separate
-- state row makes deletes versioned too, so an older device cannot resurrect
-- feedback that a newer snapshot removed.
CREATE OR REPLACE FUNCTION public.sync_feedback(p jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  incoming_updated_at timestamptz;
  accepted_updated_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '42501';
  END IF;

  IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'feedback payload must be an object';
  END IF;
  IF jsonb_typeof(p->'likes') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p->'dislikes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'likes and dislikes must be arrays';
  END IF;
  IF jsonb_array_length(p->'likes') > 5000
      OR jsonb_array_length(p->'dislikes') > 5000 THEN
    RAISE EXCEPTION 'feedback snapshot is too large';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT value FROM jsonb_array_elements(p->'likes') AS liked(value)
      UNION ALL
      SELECT value FROM jsonb_array_elements(p->'dislikes') AS disliked(value)
    ) AS entries
    WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
      OR char_length(value #>> '{}') NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION 'track IDs must be strings between 1 and 100 characters';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p->'likes') AS liked(track_id)
    JOIN jsonb_array_elements_text(p->'dislikes') AS disliked(track_id) USING (track_id)
  ) THEN
    RAISE EXCEPTION 'a track cannot be both liked and disliked';
  END IF;

  incoming_updated_at := NULLIF(p->>'updated_at', '')::timestamptz;
  IF incoming_updated_at IS NULL THEN
    RAISE EXCEPTION 'updated_at is required';
  END IF;

  INSERT INTO public.music_feedback_sync_state (user_id, updated_at)
  VALUES (actor, incoming_updated_at)
  ON CONFLICT (user_id) DO UPDATE
    SET updated_at = EXCLUDED.updated_at
    WHERE public.music_feedback_sync_state.updated_at <= EXCLUDED.updated_at
  RETURNING updated_at INTO accepted_updated_at;

  IF NOT FOUND THEN
    RETURN 'stale';
  END IF;

  DELETE FROM public.music_feedback WHERE user_id = actor;

  INSERT INTO public.music_feedback (user_id, track_id, kind, updated_at)
  SELECT actor, feedback.track_id, feedback.kind, incoming_updated_at
  FROM (
    SELECT DISTINCT track_id, 'like'::text AS kind
    FROM jsonb_array_elements_text(p->'likes') AS liked(track_id)
    UNION ALL
    SELECT DISTINCT track_id, 'dislike'::text AS kind
    FROM jsonb_array_elements_text(p->'dislikes') AS disliked(track_id)
  ) AS feedback;

  RETURN 'ok';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sync_feedback(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_feedback(jsonb) TO authenticated;
