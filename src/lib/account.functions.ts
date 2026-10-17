import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently deletes the caller's account. Private rows are removed as the
 * user (row-level policies apply), then the login itself is deleted with the
 * admin client, which cascades the profile. Only ever acts on the caller.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    for (const table of ["step_events", "focus_sessions", "music_feedback", "active_sessions", "task_steps", "tasks"] as const) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) {
        console.error("delete account", table, error);
        throw new Error("Could not delete your data. Nothing was removed from your login; please try again.");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("delete account user", error);
      throw new Error("Your data was deleted but the login could not be removed. Please try again.");
    }
    return { ok: true };
  });
