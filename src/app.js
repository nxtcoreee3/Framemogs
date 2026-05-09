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
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    toast("Missing config", "Set Supabase URL and anon key in `src/config.js`.");
  }

  await authUI.init({ supabase, state });

  window.addEventListener("hashchange", () => render());
  await render();
}

async function render() {
  const routeView = document.getElementById("routeView");
  if (!routeView) return;

  const hash = window.location.hash || "#/";
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

bootstrap().catch((err) => {
  console.error(err);
  toast("App error", err?.message || String(err));
});
