import { el } from "../util/dom.js";
import { computeRank } from "../util/rank.js";
import { toast } from "../ui/toast.js";

function safe(s) {
  return (s || "").toString();
}

export async function pageProfile({ supabase, state, routeView, route }) {
  const handle = route.params.handle;
  const wrapper = el("div", { class: "grid2" });

  const left = el("div", { class: "card" }, [
    el("div", { class: "cardBody" }, [el("div", { class: "muted" }, ["Loading…"])]),
  ]);
  const right = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Comments"]),
      el("div", { class: "cardSub" }, ["Be respectful. No doxxing."]),
    ]),
    el("div", { class: "cardBody" }, [
      el("div", { class: "muted" }, ["Loading…"]),
    ]),
  ]);
  wrapper.appendChild(left);
  wrapper.appendChild(right);
  routeView.appendChild(wrapper);

  const { data: prof, error } = await supabase
    .from("public_profile_cards")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !prof) {
    left.innerHTML = "";
    left.appendChild(
      el("div", { class: "cardBody" }, [
        el("div", { class: "cardTitle" }, ["Profile not found"]),
        el("div", { class: "cardSub" }, ["It may be unapproved or removed."]),
      ]),
    );
    return;
  }

  const { rank, score } = computeRank({ upvotes: prof.upvotes, downvotes: prof.downvotes });

  left.innerHTML = "";
  const header = el("div", { class: "cardBody" }, [
    el("div", { class: "row" }, [
      el("div", { class: "avatar", style: "width:86px;height:86px;border-radius:22px" }, [
        prof.photo_url ? el("img", { src: prof.photo_url, alt: "" }) : null,
      ]),
      el("div", { class: "itemMain" }, [
        el("div", { class: "row" }, [
          el("div", { class: "cardTitle" }, [prof.display_name || prof.handle]),
          el("div", { class: "spacer" }),
          el("span", { class: "rankTag", "data-rank": rank }, [rank]),
        ]),
        el("div", { class: "row" }, [
          el("span", { class: "itemMeta" }, [`@${prof.handle}`]),
          el("span", { class: "badge", "data-kind": prof.kind === "celebrity" ? "celeb" : "user" }, [
            prof.kind === "celebrity" ? "Celebrity" : "User",
          ]),
          el("span", { class: "score" }, [`score ${score} (+${prof.upvotes || 0}/-${prof.downvotes || 0})`]),
        ]),
      ]),
    ]),
    el("div", { class: "divider" }),
    el("div", { class: "row" }, [
      el("div", { class: "votes" }, [
        el("button", { class: "voteBtn", "data-kind": "up", id: "upBtn" }, ["▲ Upvote"]),
        el("button", { class: "voteBtn", "data-kind": "down", id: "downBtn" }, ["▼ Downvote"]),
      ]),
      el("div", { class: "spacer" }),
      el("button", { class: "btn", id: "followBtn" }, ["Follow"]),
    ]),
    el("div", { class: "divider" }),
    el("div", { class: "fields" }, [
      el("div", { class: "field" }, [el("label", {}, ["Bio"]), el("div", { class: "muted", id: "bio" }, [safe(prof.bio) || "—"])]),
    ]),
    el("div", { class: "divider" }),
    el("div", { class: "muted small" }, [
      "Reports and removals are handled by moderators. Voting and commenting requires sign-in.",
    ]),
  ]);
  left.appendChild(header);

  // Celebrity details (mods can edit; public can view)
  if (prof.kind === "celebrity") {
    const { data: celeb } = await supabase.from("celebrity_details").select("*").eq("profile_id", prof.profile_id).maybeSingle();
    left.appendChild(
      el("div", { class: "cardBody" }, [
        el("div", { class: "cardTitle" }, ["About"]),
        el("div", { class: "cardSub" }, ["Entered by moderators."]),
        el("div", { class: "divider" }),
        el("div", { class: "fields" }, [
          el("div", { class: "field" }, [el("label", {}, ["Moderator name"]), el("div", { class: "muted" }, [safe(celeb?.mod_name) || "—"])]),
          el("div", { class: "field" }, [el("label", {}, ["Social media"]), el("div", { class: "muted" }, [safe(celeb?.social) || "—"])]),
          el("div", { class: "field" }, [el("label", {}, ["Age"]), el("div", { class: "muted" }, [celeb?.age ? String(celeb.age) : "—"])]),
          el("div", { class: "field" }, [el("label", {}, ["Summary"]), el("div", { class: "muted" }, [safe(celeb?.summary) || "—"])]),
        ]),
      ]),
    );
  }

  const upBtn = left.querySelector("#upBtn");
  const downBtn = left.querySelector("#downBtn");
  const followBtn = left.querySelector("#followBtn");

  async function ensureSignedIn() {
    if (!state.user) {
      toast("Sign in", "You need to sign in first.");
      return false;
    }
    return true;
  }

  upBtn.addEventListener("click", async () => {
    if (!(await ensureSignedIn())) return;
    const { error: e } = await supabase.from("votes").upsert(
      { profile_id: prof.profile_id, voter_id: state.user.id, value: 1 },
      { onConflict: "profile_id,voter_id" },
    );
    if (e) return toast("Vote failed", e.message);
    toast("Upvoted", "Your vote was recorded.");
    window.location.reload();
  });

  downBtn.addEventListener("click", async () => {
    if (!(await ensureSignedIn())) return;
    const { error: e } = await supabase.from("votes").upsert(
      { profile_id: prof.profile_id, voter_id: state.user.id, value: -1 },
      { onConflict: "profile_id,voter_id" },
    );
    if (e) return toast("Vote failed", e.message);
    toast("Downvoted", "Your vote was recorded.");
    window.location.reload();
  });

  // Follow state
  async function refreshFollow() {
    if (!state.user) {
      followBtn.textContent = "Follow (sign in)";
      followBtn.disabled = false;
      return;
    }
    const { data } = await supabase
      .from("follows")
      .select("follower_id,followed_profile_id")
      .eq("follower_id", state.user.id)
      .eq("followed_profile_id", prof.profile_id)
      .maybeSingle();
    followBtn.dataset.following = data ? "1" : "0";
    followBtn.textContent = data ? "Unfollow" : "Follow";
  }
  await refreshFollow();

  followBtn.addEventListener("click", async () => {
    if (!(await ensureSignedIn())) return;
    const isFollowing = followBtn.dataset.following === "1";
    if (isFollowing) {
      const { error: e } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", state.user.id)
        .eq("followed_profile_id", prof.profile_id);
      if (e) return toast("Unfollow failed", e.message);
      toast("Unfollowed", "Done.");
    } else {
      const { error: e } = await supabase
        .from("follows")
        .insert({ follower_id: state.user.id, followed_profile_id: prof.profile_id });
      if (e) return toast("Follow failed", e.message);
      toast("Following", "Done.");
    }
    await refreshFollow();
  });

  // Comments
  right.innerHTML = "";
  const commentsBox = el("div", { class: "cardBody" });
  right.appendChild(
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Comments"]),
      el("div", { class: "cardSub" }, ["No hate, threats, or personal info."]),
    ]),
  );
  right.appendChild(commentsBox);

  const composer = el("div", { class: "fields" }, [
    el("div", { class: "field" }, [
      el("label", {}, ["Add comment"]),
      el("textarea", { class: "textarea", id: "cBody", placeholder: state.user ? "Write a comment…" : "Sign in to comment." }),
    ]),
    el("div", { class: "row" }, [
      el("span", { class: "muted small" }, ["Comments are public."]),
      el("div", { class: "spacer" }),
      el("button", { class: "btn btnPrimary", id: "cPost" }, ["Post"]),
    ]),
  ]);
  commentsBox.appendChild(composer);
  commentsBox.appendChild(el("div", { class: "divider" }));
  const list = el("div", { class: "list", id: "cList" }, [el("div", { class: "muted" }, ["Loading…"])]);
  commentsBox.appendChild(list);

  async function loadComments() {
    list.innerHTML = "";
    const { data, error: e } = await supabase
      .from("comments_view")
      .select("*")
      .eq("profile_id", prof.profile_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (e) return list.appendChild(el("div", { class: "muted" }, ["Failed to load comments."]));
    if (!data?.length) return list.appendChild(el("div", { class: "muted" }, ["No comments yet."]));
    for (const c of data) {
      list.appendChild(
        el("div", { class: "item" }, [
          el("div", { class: "itemMain" }, [
            el("div", { class: "row" }, [
              el("div", { class: "itemTitle" }, [c.author_display || c.author_handle ? `@${c.author_handle}` : "User"]),
              el("div", { class: "spacer" }),
              el("div", { class: "itemMeta" }, [new Date(c.created_at).toLocaleString()]),
            ]),
            el("div", { class: "muted" }, [safe(c.body)]),
          ]),
        ]),
      );
    }
  }
  await loadComments();

  const cBody = commentsBox.querySelector("#cBody");
  const cPost = commentsBox.querySelector("#cPost");
  cPost.addEventListener("click", async () => {
    if (!(await ensureSignedIn())) return;
    const body = (cBody.value || "").trim();
    if (body.length < 2) return toast("Too short", "Write a longer comment.");
    if (body.length > 500) return toast("Too long", "Keep comments under 500 characters.");
    const { error: e } = await supabase.from("comments").insert({ profile_id: prof.profile_id, author_id: state.user.id, body });
    if (e) return toast("Comment failed", e.message);
    cBody.value = "";
    toast("Posted", "Your comment is live.");
    await loadComments();
  });
}

