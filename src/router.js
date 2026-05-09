import { pageHome } from "./views/home.js";
import { pageUpload } from "./views/upload.js";
import { pageProfile } from "./views/profile.js";
import { pageFollowing } from "./views/following.js";
import { pageMod } from "./views/mod.js";
import { pageDev } from "./views/dev.js";
import { pageNotFound } from "./views/notfound.js";
import { toast } from "./ui/toast.js";

export const routes = {
  match(hash) {
    const clean = hash.replace(/^#/, "");
    const [path, qs] = clean.split("?");
    const parts = path.split("/").filter(Boolean);
    const query = new URLSearchParams(qs || "");

    if (parts.length === 0) return { name: "home", params: {}, query };
    if (parts[0] === "upload") return { name: "upload", params: {}, query };
    if (parts[0] === "following") return { name: "following", params: {}, query };
    if (parts[0] === "p" && parts[1]) return { name: "profile", params: { handle: parts[1] }, query };
    if (parts[0] === "mod") return { name: "mod", params: {}, query };
    if (parts[0] === "dev") return { name: "dev", params: {}, query };
    return { name: "404", params: {}, query };
  },
};

export async function renderRoute({ supabase, state, routeView, route, hash }) {
  try {
    switch (route.name) {
      case "home":
        return pageHome({ supabase, state, routeView, route, hash });
      case "upload":
        return pageUpload({ supabase, state, routeView, route, hash });
      case "profile":
        return pageProfile({ supabase, state, routeView, route, hash });
      case "following":
        return pageFollowing({ supabase, state, routeView, route, hash });
      case "mod":
        if (!state.roles.has("mod") && !state.roles.has("owner")) {
          toast("Mods only", "You need moderator access to view this page.");
          window.location.hash = "#/";
          return;
        }
        return pageMod({ supabase, state, routeView, route, hash });
      case "dev":
        if (!state.roles.has("owner")) {
          toast("Owner only", "You need owner access to view this page.");
          window.location.hash = "#/";
          return;
        }
        return pageDev({ supabase, state, routeView, route, hash });
      default:
        return pageNotFound({ routeView });
    }
  } catch (err) {
    console.error(err);
    toast("Route error", err?.message || String(err));
    return pageNotFound({ routeView });
  }
}
