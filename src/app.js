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
    detectSessionInUrl: true,
  },
});

async function bootstrap() {
  try {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      toast("Missing config", "Set Supabase URL and anon key in `src/config.js`.");
    }

    // ✅ 1. Let Supabase finish processing OAuth BEFORE anything else
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("Session error:", error);
    }

    console.log("Initial session:", session);

    // ❗ 2. ONLY clean URL AFTER session is read
    if (window.location.hash.includes("access_token")) {
      window.history.replaceState({}, document.title, "#/");
    }

    // ✅ 3. Auth listener (NO reloads — this was breaking Chrome)
    supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);

      if (event === "SIGNED_IN") {
        // just update UI, don't reload page
        render();
      }

      if (event === "SIGNED_OUT") {
        render();
      }
    });

    // ✅ 4. Init UI AFTER session exists
    await authUI.init({ supabase, state });

    // ✅ 5. Router
    window.addEventListener("hashchange", render);

    await render();
  } catch (err) {
    console.error(err);
    toast("App error", err?.message || String(err));
  }
}

async function render() {
  const routeView = document.getElementById("routeView");
  if (!routeView) return;

  let hash = window.location.hash || "#/";

  // safety cleanup for broken OAuth hash
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
