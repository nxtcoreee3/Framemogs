import { cfg } from "../config.js";

export async function refreshViewerContext({ supabase, state }) {
  state.roles = new Set();
  state.profile = null;

  if (!state.user) return;

  if (cfg.ownerUserId && state.user.id === cfg.ownerUserId) {
    state.roles.add("owner");
    state.roles.add("mod");
  }

  // Roles table (if exists). Fallback gracefully if schema not installed yet.
  try {
    const { data: roles } = await supabase.from("roles").select("role").eq("user_id", state.user.id);
    for (const r of roles || []) state.roles.add(r.role);
  } catch {
    // ignore
  }

  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", state.user.id)
      .eq("status", "approved")
      .maybeSingle();
    state.profile = prof || null;
  } catch {
    // ignore
  }
}
