import { el } from "../util/dom.js";
import { toast } from "../ui/toast.js";

export async function pageDev({ supabase, state, routeView }) {
  const card = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Developer panel (Owner)"]),
      el("div", { class: "cardSub" }, ["Add/remove moderators. This is protected by Supabase RLS + owner id."]),
    ]),
    el("div", { class: "cardBody" }, []),
  ]);
  routeView.appendChild(card);
  const body = card.querySelector(".cardBody");

  body.appendChild(el("div", { class: "pill" }, ["Owner: ", el("b", {}, [state.user?.id || ""]) ]));
  body.appendChild(el("div", { class: "divider" }));

  const userIdInput = el("input", { class: "input", placeholder: "Supabase auth user id (uuid)" });
  const addBtn = el("button", { class: "btn btnPrimary" }, ["Add moderator"]);
  body.appendChild(
    el("div", { class: "fields" }, [
      el("div", { class: "field" }, [el("label", {}, ["User id to add as moderator"]), userIdInput]),
      el("div", { class: "row" }, [el("div", { class: "spacer" }), addBtn]),
    ]),
  );
  body.appendChild(el("div", { class: "divider" }));

  const list = el("div", { class: "list" }, [el("div", { class: "muted" }, ["Loading…"])]);
  body.appendChild(list);

  async function loadRoles() {
    list.innerHTML = "";
    const { data, error } = await supabase.from("roles").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) {
      toast("Load failed", error.message);
      list.appendChild(el("div", { class: "muted" }, ["Failed to load roles."]));
      return;
    }
    if (!data?.length) {
      list.appendChild(el("div", { class: "muted" }, ["No roles found."]));
      return;
    }
    for (const r of data) {
      const remove = el("button", { class: "btn btnDanger" }, ["Remove"]);
      remove.addEventListener("click", async () => {
        const { error: e } = await supabase.from("roles").delete().eq("id", r.id);
        if (e) toast("Remove failed", e.message);
        else toast("Removed", "Role removed.");
        await loadRoles();
      });
      list.appendChild(
        el("div", { class: "item" }, [
          el("div", { class: "itemMain" }, [
            el("div", { class: "row" }, [
              el("div", { class: "itemTitle" }, [r.role]),
              el("div", { class: "spacer" }),
              remove,
            ]),
            el("div", { class: "itemMeta" }, [r.user_id]),
          ]),
        ]),
      );
    }
  }

  addBtn.addEventListener("click", async () => {
    try {
      addBtn.disabled = "true";
      const uid = (userIdInput.value || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Error("Enter a valid uuid.");
      const { error } = await supabase.from("roles").insert({ user_id: uid, role: "mod" });
      if (error) throw error;
      toast("Added", "Moderator added.");
      userIdInput.value = "";
      await loadRoles();
    } catch (err) {
      toast("Add failed", err?.message || String(err));
    } finally {
      addBtn.disabled = null;
    }
  });

  await loadRoles();
}

