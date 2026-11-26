import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const migration = await readFile(
  resolve(process.cwd(), "drizzle/migrations/0001_atomic_feedback_sync.sql"),
  "utf8",
);

let db: PGlite;

async function setUser(userId: string | null) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec("SET ROLE authenticated");
}

async function syncFeedback(input: {
  likes: unknown[];
  dislikes: unknown[];
  updated_at: string;
}) {
  const { rows } = await db.query<{ result: string }>(
    "SELECT public.sync_feedback($1::jsonb) AS result",
    [JSON.stringify(input)],
  );
  return rows[0]?.result;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

    CREATE TABLE public.music_feedback (
      user_id uuid NOT NULL DEFAULT auth.uid(),
      track_id text NOT NULL CHECK (char_length(track_id) BETWEEN 1 AND 100),
      kind text NOT NULL CHECK (kind IN ('like', 'dislike')),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, track_id)
    );
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_feedback TO authenticated;
    ALTER TABLE public.music_feedback ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "own feedback all" ON public.music_feedback
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  `);
  await db.exec(migration);
});

afterEach(async () => {
  await db.close();
});

describe("atomic music feedback migration", () => {
  it("replaces only the caller's snapshot and retains newer feedback", async () => {
    await setUser(USER_A);
    expect(
      await syncFeedback({
        likes: ["old-like"],
        dislikes: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("ok");

    await setUser(USER_B);
    expect(
      await syncFeedback({
        likes: ["other-account"],
        dislikes: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("ok");

    await setUser(USER_A);
    expect(
      await syncFeedback({
        likes: ["new-like"],
        dislikes: ["new-dislike"],
        updated_at: "2026-01-02T00:00:00.000Z",
      }),
    ).toBe("ok");

    await db.exec("RESET ROLE");
    const { rows } = await db.query<{
      user_id: string;
      track_id: string;
      kind: string;
    }>(
      "SELECT user_id, track_id, kind FROM public.music_feedback ORDER BY user_id, track_id",
    );
    expect(rows).toEqual([
      { user_id: USER_A, track_id: "new-dislike", kind: "dislike" },
      { user_id: USER_A, track_id: "new-like", kind: "like" },
      { user_id: USER_B, track_id: "other-account", kind: "like" },
    ]);
  });

  it("rejects an older snapshot without restoring removed feedback", async () => {
    await setUser(USER_A);
    await syncFeedback({
      likes: ["current"],
      dislikes: [],
      updated_at: "2026-02-02T00:00:00.000Z",
    });

    expect(
      await syncFeedback({
        likes: ["removed"],
        dislikes: [],
        updated_at: "2026-02-01T00:00:00.000Z",
      }),
    ).toBe("stale");

    await db.exec("RESET ROLE");
    const { rows } = await db.query<{ track_id: string }>(
      "SELECT track_id FROM public.music_feedback WHERE user_id = $1",
      [USER_A],
    );
    expect(rows).toEqual([{ track_id: "current" }]);
  });

  it("rolls back the whole replacement when a row write fails", async () => {
    await setUser(USER_A);
    await syncFeedback({
      likes: ["kept"],
      dislikes: [],
      updated_at: "2026-03-01T00:00:00.000Z",
    });

    await db.exec(`
      RESET ROLE;
      CREATE FUNCTION public.fail_feedback_test_row() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.track_id = 'trigger-failure' THEN
            RAISE EXCEPTION 'simulated feedback insert failure';
          END IF;
          RETURN NEW;
        END $$;
      CREATE TRIGGER fail_feedback_test_row
        BEFORE INSERT ON public.music_feedback
        FOR EACH ROW EXECUTE FUNCTION public.fail_feedback_test_row();
    `);
    await setUser(USER_A);

    await expect(
      syncFeedback({
        likes: ["new", "trigger-failure"],
        dislikes: [],
        updated_at: "2026-03-02T00:00:00.000Z",
      }),
    ).rejects.toThrow("simulated feedback insert failure");

    await db.exec("RESET ROLE");
    const { rows } = await db.query<{ track_id: string }>(
      "SELECT track_id FROM public.music_feedback WHERE user_id = $1",
      [USER_A],
    );
    expect(rows).toEqual([{ track_id: "kept" }]);
    const state = await db.query<{ updated_at: string }>(
      "SELECT updated_at::text AS updated_at FROM public.music_feedback_sync_state WHERE user_id = $1",
      [USER_A],
    );
    expect(state.rows[0]?.updated_at).toContain("2026-03-01");
  });

  it("rejects invalid or unauthenticated snapshots without deleting saved data", async () => {
    await setUser(USER_A);
    await syncFeedback({
      likes: ["keep"],
      dislikes: [],
      updated_at: "2026-04-01T00:00:00.000Z",
    });
    await expect(
      syncFeedback({
        likes: ["overlap"],
        dislikes: ["overlap"],
        updated_at: "2026-04-02T00:00:00.000Z",
      }),
    ).rejects.toThrow("both liked and disliked");

    await setUser(null);
    await expect(
      syncFeedback({
        likes: [],
        dislikes: [],
        updated_at: "2026-04-03T00:00:00.000Z",
      }),
    ).rejects.toThrow("not authenticated");

    await db.exec("RESET ROLE");
    const { rows } = await db.query<{ track_id: string }>(
      "SELECT track_id FROM public.music_feedback WHERE user_id = $1",
      [USER_A],
    );
    expect(rows).toEqual([{ track_id: "keep" }]);
  });
});
