import { el } from "../util/dom.js";
import { computeRank } from "../util/rank.js";
import { toast } from "../ui/toast.js";

function card(p) {
  const { rank, score } = computeRank({ upvotes: p.upvotes, downvotes: p.downvotes });
  return el("a", { class: "item", href: `#/p/${encodeURIComponent(p.handle)}` }, [
    el("div", { class: "avatar" }, [p.photo_url ? el("img", { src: p.photo_url, alt: "" }) : null]),
    el("div", { class: "itemMain" }, [
      el("div", { class: "row" }, [
        el("div", { class: "itemTitle" }, [p.display_name || p.handle]),
        el("div", { class: "spacer" }),
        el("span", { class: "rankTag", "data-rank": rank }, [rank]),
      ]),
      el("div", { class: "row" }, [
        el("span", { class: "itemMeta" }, [`@${p.handle}`]),
        el("span", { class: "score" }, [`score ${score}`]),
      ]),
    ]),
  ]);
}

export async function pageFollowing({ supabase, state, routeView }) {
  const box = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Following"]),
      el("div", { class: "cardSub" }, ["Profiles you follow."]),
    ]),
    el("div", { class: "cardBody" }, [
      el("div", { class: "list", id: "list" }, []),
    ]),
  ]);
  routeView.appendChild(box);

  const list = box.querySelector("#list");
  if (!state.user) {
    list.appendChild(el("div", { class: "muted" }, ["Sign in to see who you follow."]));
    return;
  }

  const { data, error } = await supabase
    .from("following_cards")
    .select("*")
    .eq("follower_id", state.user.id)
    .order("score", { ascending: false });
  if (error) {
    toast("Load failed", error.message);
    list.appendChild(el("div", { class: "muted" }, ["Failed to load."]));
    return;
  }
  if (!data?.length) {
    list.appendChild(el("div", { class: "muted" }, ["You're not following anyone yet."]));
    return;
  }
  for (const p of data) list.appendChild(card(p));
}

