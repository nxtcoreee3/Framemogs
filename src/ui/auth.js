import { cfg } from "../config.js";
import { toast } from "./toast.js";
import { refreshViewerContext } from "../util/viewer.js";

export const authUI = {
  async init({ supabase, state }) {
    const authBtn = document.getElementById("authBtn");
    const signOutBtn = document.getElementById("signOutBtn");

    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    state.user = data.session?.user || null;
    await refreshViewerContext({ supabase, state });
    updateButtons();

    supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      state.user = session?.user || null;
      await refreshViewerContext({ supabase, state });
      updateButtons();
    });

    authBtn?.addEventListener("click", async () => {
      try {
        const providers = cfg.preferGoogleOnly ? ["google"] : ["google"];
        const provider = providers[0];
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: window.location.href,
          },
        });
        if (error) throw error;
      } catch (e) {
        console.error(e);
        toast("Sign-in failed", e?.message || String(e));
      }
    });

    signOutBtn?.addEventListener("click", async () => {
      await supabase.auth.signOut();
      toast("Signed out", "See you.");
    });

    function updateButtons() {
      const signedIn = Boolean(state.user);
      if (authBtn) authBtn.classList.toggle("hidden", signedIn);
      if (signOutBtn) signOutBtn.classList.toggle("hidden", !signedIn);

      for (const link of document.querySelectorAll("[data-requires]")) {
        const role = link.getAttribute("data-requires");
        const ok = role === "owner" ? state.roles.has("owner") : state.roles.has("mod") || state.roles.has("owner");
        link.classList.toggle("hidden", !ok);
      }
    }
  },
};
