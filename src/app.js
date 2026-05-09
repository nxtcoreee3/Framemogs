import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { cfg } from "./config.js";
import { routes, renderRoute } from "./router.js";
import { toast } from "./ui/toast.js";
import { authUI } from "./ui/auth.js";
import { state } from "./state.js";

export const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // important for OAuth
  },
});

async function bootstrap() {
  try {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      toast("Missing config", "Set Supabase URL and anon key in `src/config.js`.");
    }

    // 🔥 1. FORCE Supabase to process OAuth redirect
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Session error:", error);
    }

    // 🔥 2. CLEAN the ugly OAuth URL (VERY IMPORTANT)
    if (window.location.hash.includes("access_token")) {
      window.history.replaceState({}, document.title, "#/");
    }

    // 🔥 3. Listen for login/logout changes
    supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);

      if (event === "SIGNED_IN") {
        // redirect after login
        window.location.hash = "#/";
      }

      if (event === "SIGNED_OUT") {
        window.location.hash = "#/";
      }
    });

    // 🔥 4. Init your auth UI AFTER session is ready
    await authUI.init({ supabase, state });

    // 🔥 5. Router
    window.addEventListener("hashchange", () => render());

    await render();
  } catch (err) {
    console.error(err);
    toast("App error", err?.message || String(err));
  }
}

async function render() {
  const routeView = document.getElementById("routeView");
  if (!routeView) return;

  // 🛠 safer hash handling (prevents #/# bugs)
  let hash = window.location.hash || "#/";

  if (hash.includes("access_token")) {
    hash = "#/";
  }

  const route = routes.match(hash);

  routeView.innerHTML = "";

  await renderRoute({
    supabase,
    state,
    routeView,
    hash,
    route,
  });
}

// 🚀 start app
bootstrap();
