import { el } from "../util/dom.js";
import { computeRank } from "../util/rank.js";
import { toast } from "../ui/toast.js";

function profileRowCard(p) {
  const { rank, score } = computeRank({ upvotes: p.upvotes, downvotes: p.downvotes });
  const avatar = el("div", { class: "avatar" }, [
    p.photo_url ? el("img", { src: p.photo_url, alt: "" }) : el("div", { class: "avatarFallback" }),
  ]);

  return el(
    "a",
    { class: "item", href: `#/p/${encodeURIComponent(p.handle)}` },
    [
      avatar,
      el("div", { class: "itemMain" }, [
        el("div", { class: "row" }, [
          el("div", { class: "itemTitle" }, [p.display_name || p.handle || "Unknown"]),
          el("div", { class: "spacer" }),
          el("span", { class: "rankTag", "data-rank": rank }, [rank]),
        ]),
        el("div", { class: "row" }, [
          el("span", { class: "itemMeta" }, [`@${p.handle}`]),
          el("span", { class: "badge", "data-kind": p.kind === "celebrity" ? "celeb" : "user" }, [
            p.kind === "celebrity" ? "Celebrity" : "User",
          ]),
          el("span", { class: "score" }, [`score ${score} (+${p.upvotes || 0}/-${p.downvotes || 0})`]),
        ]),
      ]),
    ],
  );
}

export async function pageHome({ supabase, state, routeView }) {
  const left = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Rankings"]),
      el("div", { class: "cardSub" }, [
        "Vote and comment. User profiles must be approved by moderators before they appear.",
      ]),
    ]),
    el("div", { class: "cardBody" }, [
      el("div", { class: "row" }, [
        el("span", { class: "pill" }, ["Signed in: ", el("b", {}, [state.user ? "yes" : "no"])]),
        el("span", { class: "pill" }, ["Role: ", el("b", {}, [state.roles.size ? [...state.roles].join(", ") : "user"])]),
        el("div", { class: "spacer" }),
        el("a", { class: "btn btnPrimary", href: "#/upload" }, ["Upload yourself"]),
      ]),
      el("div", { class: "divider" }),
      el("div", { class: "fields" }, [
        el("div", { class: "field" }, [
          el("label", {}, ["Search"]),
          el("input", { class: "input", id: "search", placeholder: "Search handle or name…" }),
        ]),
      ]),
      el("div", { class: "divider" }),
      el("div", { class: "list", id: "list" }, [
        el("div", { class: "muted" }, ["Loading…"]),
      ]),
    ]),
  ]);

  const right = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["How ranks work"]),
      el("div", { class: "cardSub" }, ["Based on score = upvotes − downvotes (tunable)."]),
    ]),
    el("div", { class: "cardBody" }, [
      el("div", { class: "kpi" }, [
        el("div", { class: "kpiBox" }, [el("div", { class: "label" }, ["NPC"]), el("div", { class: "value" }, ["< 10"])]),
        el("div", { class: "kpiBox" }, [el("div", { class: "label" }, ["Average"]), el("div", { class: "value" }, ["10–39"])]),
        el("div", { class: "kpiBox" }, [el("div", { class: "label" }, ["Mogger"]), el("div", { class: "value" }, ["40–99"])]),
        el("div", { class: "kpiBox" }, [el("div", { class: "label" }, ["Chad"]), el("div", { class: "value" }, ["100–249"])]),
        el("div", { class: "kpiBox" }, [el("div", { class: "label" }, ["Framegod"]), el("div", { class: "value" }, ["250+"])]),
        el("div", { class: "kpiBox" }, [el("div", { class: "label" }, ["Banned"]), el("div", { class: "value" }, ["≤ -10"])]),
      ]),
      el("div", { class: "divider" }),
      el("div", { class: "muted small" }, [
        "Safety: avoid harassment and doxxing. Moderators can remove content and reject profiles.",
      ]),
    ]),
  ]);

  routeView.appendChild(el("div", { class: "grid2" }, [left, right]));

  const listEl = left.querySelector("#list");
  const searchEl = left.querySelector("#search");
  let cached = [];

  async function load() {
    listEl.innerHTML = "";
    const { data, error } = await supabase
      .from("public_profile_cards")
      .select("*")
      .order("score", { ascending: false })
      .limit(100);
    if (error) {
      console.error(error);
      listEl.appendChild(el("div", { class: "muted" }, ["Failed to load profiles. Did you run the Supabase SQL?"]));
      toast("Supabase", error.message);
      return;
    }
    cached = data || [];
    renderList();
  }

  function renderList() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const rows = q
      ? cached.filter((p) => (p.handle || "").toLowerCase().includes(q) || (p.display_name || "").toLowerCase().includes(q))
      : cached;

    listEl.innerHTML = "";
    if (!rows.length) {
      listEl.appendChild(el("div", { class: "muted" }, ["No results."]));
      return;
    }
    for (const p of rows) listEl.appendChild(profileRowCard(p));
  }

  searchEl.addEventListener("input", () => renderList());
  await load();
}

