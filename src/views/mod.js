import { el, moneyTime } from "../util/dom.js";
import { toast } from "../ui/toast.js";

export async function pageMod({ supabase, state, routeView }) {
  const root = el("div", { class: "routeView" });
  routeView.appendChild(root);

  root.appendChild(
    el("div", { class: "card" }, [
      el("div", { class: "cardHeader" }, [
        el("div", { class: "cardTitle" }, ["Moderator panel"]),
        el("div", { class: "cardSub" }, ["Approve user uploads, add celebrities, edit celebrity details."]),
      ]),
      el("div", { class: "cardBody" }, [
        el("span", { class: "pill" }, ["Signed in as ", el("b", {}, [state.user?.email || state.user?.id || ""]) ]),
      ]),
    ]),
  );

  // Pending requests
  const reqCard = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Pending profile requests"]),
      el("div", { class: "cardSub" }, ["Approve to publish. Reject to block."]),
    ]),
    el("div", { class: "cardBody" }, [el("div", { class: "list", id: "reqList" }, [el("div", { class: "muted" }, ["Loading…"])])]),
  ]);
  root.appendChild(reqCard);

  // Celebrity creator
  const celebCard = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Add celebrity"]),
      el("div", { class: "cardSub" }, ["Creates a celebrity profile visible in rankings."]),
    ]),
    el("div", { class: "cardBody" }, []),
  ]);
  root.appendChild(celebCard);

  const cBody = celebCard.querySelector(".cardBody");
  const cHandle = el("input", { class: "input", placeholder: "handle e.g. tom_hardy" });
  const cName = el("input", { class: "input", placeholder: "display name" });
  const cBio = el("textarea", { class: "textarea", placeholder: "bio (optional)" });
  const cFile = el("input", { type: "file", accept: "image/*", class: "input" });
  const cCreate = el("button", { class: "btn btnPrimary" }, ["Create celebrity"]);
  cBody.appendChild(
    el("div", { class: "fields" }, [
      el("div", { class: "field" }, [el("label", {}, ["Handle"]), cHandle]),
      el("div", { class: "field" }, [el("label", {}, ["Display name"]), cName]),
      el("div", { class: "field" }, [el("label", {}, ["Bio"]), cBio]),
      el("div", { class: "field" }, [el("label", {}, ["Photo (image file)"]), cFile]),
      el("div", { class: "row" }, [el("div", { class: "spacer" }), cCreate]),
    ]),
  );

  // Celebrity details editor
  const editCard = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Edit celebrity details"]),
      el("div", { class: "cardSub" }, ["On a celebrity profile page, the public sees these fields."]),
    ]),
    el("div", { class: "cardBody" }, []),
  ]);
  root.appendChild(editCard);

  const eBody = editCard.querySelector(".cardBody");
  const eSelect = el("select", { class: "select", id: "celebSel" }, [el("option", { value: "" }, ["Select a celebrity…"])]);
  const eMod = el("input", { class: "input", placeholder: "your name (as moderator)" });
  const eSocial = el("input", { class: "input", placeholder: "social links/handles" });
  const eAge = el("input", { class: "input", type: "number", min: "0", max: "120", placeholder: "age" });
  const eSummary = el("textarea", { class: "textarea", placeholder: "summary" });
  const eSave = el("button", { class: "btn btnPrimary" }, ["Save details"]);
  eBody.appendChild(
    el("div", { class: "fields" }, [
      el("div", { class: "field" }, [el("label", {}, ["Celebrity"]), eSelect]),
      el("div", { class: "field" }, [el("label", {}, ["Moderator name"]), eMod]),
      el("div", { class: "field" }, [el("label", {}, ["Social media"]), eSocial]),
      el("div", { class: "field" }, [el("label", {}, ["Age"]), eAge]),
      el("div", { class: "field" }, [el("label", {}, ["Summary"]), eSummary]),
      el("div", { class: "row" }, [el("div", { class: "spacer" }), eSave]),
    ]),
  );

  const reqList = reqCard.querySelector("#reqList");

  async function loadRequests() {
    reqList.innerHTML = "";
    const { data, error } = await supabase
      .from("profile_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) {
      toast("Load failed", error.message);
      reqList.appendChild(el("div", { class: "muted" }, ["Failed to load."]));
      return;
    }
    if (!data?.length) {
      reqList.appendChild(el("div", { class: "muted" }, ["No pending requests."]));
      return;
    }
    for (const r of data) reqList.appendChild(requestRow(r));
  }

  function requestRow(r) {
    const av = el("div", { class: "avatar" }, [r.photo_url ? el("img", { src: r.photo_url, alt: "" }) : null]);
    const approveBtn = el("button", { class: "btn btnPrimary" }, ["Approve"]);
    const rejectBtn = el("button", { class: "btn btnDanger" }, ["Reject"]);
    const reason = el("input", { class: "input", placeholder: "reject reason (optional)" });

    approveBtn.addEventListener("click", async () => {
      try {
        approveBtn.disabled = "true";
        rejectBtn.disabled = "true";

        const { error: e } = await supabase.rpc("approve_profile_request", {
          request_id: r.id,
          moderator_id: state.user.id,
        });
        if (e) throw e;
        toast("Approved", `@${r.handle} is now public.`);
        await loadRequests();
      } catch (err) {
        toast("Approve failed", err?.message || String(err));
        approveBtn.disabled = null;
        rejectBtn.disabled = null;
      }
    });

    rejectBtn.addEventListener("click", async () => {
      try {
        approveBtn.disabled = "true";
        rejectBtn.disabled = "true";
        const { error: e } = await supabase
          .from("profile_requests")
          .update({ status: "rejected", decided_by: state.user.id, decided_at: new Date().toISOString(), reject_reason: (reason.value || "").trim().slice(0, 140) })
          .eq("id", r.id);
        if (e) throw e;
        toast("Rejected", `Request @${r.handle} rejected.`);
        await loadRequests();
      } catch (err) {
        toast("Reject failed", err?.message || String(err));
        approveBtn.disabled = null;
        rejectBtn.disabled = null;
      }
    });

    return el("div", { class: "item" }, [
      av,
      el("div", { class: "itemMain" }, [
        el("div", { class: "row" }, [
          el("div", { class: "itemTitle" }, [`@${r.handle}`]),
          el("div", { class: "spacer" }),
          el("div", { class: "itemMeta" }, [moneyTime(r.created_at)]),
        ]),
        el("div", { class: "itemMeta" }, [r.display_name || ""]),
        el("div", { class: "muted small" }, [(r.bio || "").slice(0, 180) || "—"]),
        el("div", { class: "divider" }),
        el("div", { class: "fields" }, [
          el("div", { class: "field" }, [el("label", {}, ["Reject reason"]), reason]),
          el("div", { class: "row" }, [approveBtn, rejectBtn, el("div", { class: "spacer" }), el("span", { class: "pill" }, ["User ", el("b", {}, [r.requester_id])])]),
        ]),
      ]),
    ]);
  }

  async function loadCelebsForEdit() {
    eSelect.innerHTML = "";
    eSelect.appendChild(el("option", { value: "" }, ["Select a celebrity…"]));
    const { data } = await supabase.from("profiles").select("id,handle,display_name").eq("kind", "celebrity").eq("status", "approved").order("handle");
    for (const p of data || []) {
      eSelect.appendChild(el("option", { value: p.id }, [`@${p.handle} — ${p.display_name || ""}`]));
    }
  }

  eSelect.addEventListener("change", async () => {
    const pid = eSelect.value;
    eMod.value = "";
    eSocial.value = "";
    eAge.value = "";
    eSummary.value = "";
    if (!pid) return;
    const { data } = await supabase.from("celebrity_details").select("*").eq("profile_id", pid).maybeSingle();
    if (!data) return;
    eMod.value = data.mod_name || "";
    eSocial.value = data.social || "";
    eAge.value = data.age ?? "";
    eSummary.value = data.summary || "";
  });

  eSave.addEventListener("click", async () => {
    try {
      const pid = eSelect.value;
      if (!pid) throw new Error("Select a celebrity first.");
      const payload = {
        profile_id: pid,
        mod_name: (eMod.value || "").trim().slice(0, 60),
        social: (eSocial.value || "").trim().slice(0, 160),
        age: eAge.value ? Number(eAge.value) : null,
        summary: (eSummary.value || "").trim().slice(0, 800),
        updated_by: state.user.id,
      };
      const { error: e } = await supabase.from("celebrity_details").upsert(payload, { onConflict: "profile_id" });
      if (e) throw e;
      toast("Saved", "Celebrity details updated.");
    } catch (err) {
      toast("Save failed", err?.message || String(err));
    }
  });

  cCreate.addEventListener("click", async () => {
    try {
      cCreate.disabled = "true";
      const h = (cHandle.value || "").trim().toLowerCase();
      const dn = (cName.value || "").trim();
      if (!/^[a-z0-9_]{3,24}$/i.test(h)) throw new Error("Handle must be 3–24 chars: letters/numbers/_");
      if (dn.length < 2) throw new Error("Display name too short.");
      const file = cFile.files?.[0];
      if (!file) throw new Error("Pick a photo file.");

      const path = `celebs/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("profile_photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("profile_photos").getPublicUrl(path);
      const photoUrl = pub?.publicUrl || null;

      const { error: e } = await supabase.rpc("create_celebrity_profile", {
        moderator_id: state.user.id,
        handle: h,
        display_name: dn,
        bio: (cBio.value || "").trim().slice(0, 240),
        photo_url: photoUrl,
        photo_path: path,
      });
      if (e) throw e;
      toast("Created", `Celebrity @${h} created.`);
      cHandle.value = "";
      cName.value = "";
      cBio.value = "";
      cFile.value = "";
      await loadCelebsForEdit();
    } catch (err) {
      toast("Create failed", err?.message || String(err));
    } finally {
      cCreate.disabled = null;
    }
  });

  await loadRequests();
  await loadCelebsForEdit();
}

