import { el } from "../util/dom.js";
import { toast } from "../ui/toast.js";

function supportsFaceDetector() {
  return typeof window.FaceDetector === "function";
}

async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

function stopCamera(stream) {
  try {
    for (const t of stream?.getTracks?.() || []) t.stop();
  } catch {
    // ignore
  }
}

function captureJpegFromVideo(videoEl, { quality = 0.92, maxSize = 900 } = {}) {
  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, cw, ch);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function pageUpload({ supabase, state, routeView }) {
  const card = el("div", { class: "card" }, [
    el("div", { class: "cardHeader" }, [
      el("div", { class: "cardTitle" }, ["Upload yourself (request)"]),
      el("div", { class: "cardSub" }, [
        "You must complete a liveness scan and submit a request. A moderator must approve before you appear in rankings.",
      ]),
    ]),
    el("div", { class: "cardBody" }, []),
  ]);
  routeView.appendChild(card);
  const body = card.querySelector(".cardBody");

  if (!state.user) {
    body.appendChild(el("div", { class: "muted" }, ["Sign in first, then come back here."]));
    body.appendChild(el("div", { class: "divider" }));
    body.appendChild(el("div", { class: "muted small" }, ["Sign-in uses Supabase Google OAuth."]));
    return;
  }

  const info = el("div", { class: "muted small" }, [
    "Privacy: your camera runs locally in your browser. We upload only the final profile photo plus scan metadata.",
  ]);
  body.appendChild(info);
  body.appendChild(el("div", { class: "divider" }));

  const video = el("video", { playsinline: "true", muted: "true" });
  const videoBox = el("div", { class: "videoBox" }, [video]);
  const prompt = el("div", { class: "pill" }, ["Scan not started"]);
  const progress = el("div", { class: "progress" }, [el("div", { id: "bar" })]);
  const startBtn = el("button", { class: "btn btnPrimary" }, ["Start scan"]);
  const stopBtn = el("button", { class: "btn btnGhost hidden" }, ["Stop camera"]);
  const captureBtn = el("button", { class: "btn hidden", id: "captureBtn" }, ["Capture profile photo"]);

  body.appendChild(videoBox);
  body.appendChild(el("div", { class: "divider" }));
  body.appendChild(el("div", { class: "row" }, [prompt, el("div", { class: "spacer" }), startBtn, stopBtn, captureBtn]));
  body.appendChild(progress);

  const preview = el("div", { class: "card", style: "margin-top:14px" }, [
    el("div", { class: "cardHeader" }, [el("div", { class: "cardTitle" }, ["Profile details"])]),
    el("div", { class: "cardBody" }, []),
  ]);
  body.appendChild(preview);
  const pBody = preview.querySelector(".cardBody");

  const photoPreview = el("div", { class: "avatar", style: "width:110px;height:110px;border-radius:26px" }, []);
  const handle = el("input", { class: "input", placeholder: "username (letters/numbers/_) e.g. framemogger" });
  const display = el("input", { class: "input", placeholder: "display name" });
  const bio = el("textarea", { class: "textarea", placeholder: "bio (no personal info)" });
  const adult = el("input", { type: "checkbox", id: "adult" });
  const agree = el("input", { type: "checkbox", id: "agree" });
  const submitBtn = el("button", { class: "btn btnPrimary", disabled: "true" }, ["Submit for approval"]);

  pBody.appendChild(
    el("div", { class: "row" }, [
      photoPreview,
      el("div", { class: "itemMain" }, [
        el("div", { class: "muted" }, ["Complete the scan, then capture a profile photo from the camera."]),
        el("div", { class: "muted small" }, ["We currently require camera capture (no file upload) to reduce spoofing."]),
      ]),
    ]),
  );
  pBody.appendChild(el("div", { class: "divider" }));
  pBody.appendChild(
    el("div", { class: "fields" }, [
      el("div", { class: "field" }, [el("label", {}, ["Username"]), handle]),
      el("div", { class: "field" }, [el("label", {}, ["Display name"]), display]),
      el("div", { class: "field" }, [el("label", {}, ["Bio"]), bio]),
      el("div", { class: "row" }, [
        el("label", { for: "adult", style: "margin:0; display:flex; gap:10px; align-items:center" }, [
          adult,
          el("span", {}, ["I confirm I am 18+"]),
        ]),
      ]),
      el("div", { class: "row" }, [
        el("label", { for: "agree", style: "margin:0; display:flex; gap:10px; align-items:center" }, [
          agree,
          el("span", {}, ["I agree to be rated and to follow community rules"]),
        ]),
      ]),
      el("div", { class: "row" }, [el("div", { class: "spacer" }), submitBtn]),
    ]),
  );

  let stream = null;
  let scan = {
    startedAt: null,
    steps: [],
    ok: false,
  };
  let profilePhotoBlob = null;
  let profilePhotoPath = null;
  let profilePhotoUrl = null;

  function setProgress(pct) {
    const bar = progress.querySelector("#bar");
    bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function canSubmit() {
    const h = (handle.value || "").trim();
    const d = (display.value || "").trim();
    const b = (bio.value || "").trim();
    const okHandle = /^[a-z0-9_]{3,20}$/i.test(h);
    const okBio = b.length >= 0 && b.length <= 240;
    const ok = scan.ok && Boolean(profilePhotoBlob) && okHandle && d.length >= 2 && okBio && adult.checked && agree.checked;
    submitBtn.disabled = ok ? null : "true";
  }

  handle.addEventListener("input", canSubmit);
  display.addEventListener("input", canSubmit);
  bio.addEventListener("input", canSubmit);
  adult.addEventListener("change", canSubmit);
  agree.addEventListener("change", canSubmit);

  stopBtn.addEventListener("click", () => {
    stopCamera(stream);
    stream = null;
    prompt.textContent = "Camera stopped";
    stopBtn.classList.add("hidden");
    startBtn.classList.remove("hidden");
  });

  startBtn.addEventListener("click", async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported in this browser.");

      scan = { startedAt: new Date().toISOString(), steps: [], ok: false };
      profilePhotoBlob = null;
      profilePhotoPath = null;
      profilePhotoUrl = null;
      photoPreview.innerHTML = "";
      captureBtn.classList.add("hidden");
      setProgress(0);
      canSubmit();

      stream = await startCamera(video);
      stopBtn.classList.remove("hidden");
      startBtn.classList.add("hidden");

      const useFD = supportsFaceDetector();
      if (!useFD) {
        toast("FaceDetector missing", "Your browser lacks FaceDetector. Scan will be weaker. Prefer Chrome.");
      }

      prompt.textContent = "Center your face in view…";
      await new Promise((r) => setTimeout(r, 650));

      const detector = useFD ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;

      const directions = [
        { key: "left", label: "Turn LEFT", axis: "x", sign: -1 },
        { key: "right", label: "Turn RIGHT", axis: "x", sign: 1 },
        { key: "up", label: "Look UP", axis: "y", sign: -1 },
        { key: "down", label: "Look DOWN", axis: "y", sign: 1 },
      ];

      // Baseline
      const baseline = await sampleFace(detector, video, 1600);
      if (!baseline) throw new Error("No face detected. Improve lighting and try again.");

      scan.steps.push({ kind: "baseline", at: new Date().toISOString(), box: baseline.box });
      setProgress(10);

      for (let i = 0; i < directions.length; i++) {
        const d = directions[i];
        prompt.textContent = `Liveness: ${d.label}`;
        const step = await waitForMovement(detector, video, baseline.box, d, 3600);
        if (!step) throw new Error(`Could not confirm movement for: ${d.label}`);
        scan.steps.push(step);
        setProgress(10 + Math.round(((i + 1) / directions.length) * 70));
      }

      scan.ok = true;
      prompt.textContent = "Scan complete. Capture your profile photo.";
      setProgress(85);
      captureBtn.classList.remove("hidden");
      canSubmit();
    } catch (e) {
      console.error(e);
      toast("Scan failed", e?.message || String(e));
      prompt.textContent = "Scan failed. Try again.";
      scan.ok = false;
      setProgress(0);
      canSubmit();
      stopCamera(stream);
      stream = null;
      stopBtn.classList.add("hidden");
      startBtn.classList.remove("hidden");
    }
  });

  captureBtn.addEventListener("click", async () => {
    try {
      if (!stream) throw new Error("Camera not running.");
      const blob = await captureJpegFromVideo(video);
      if (!blob) throw new Error("Failed to capture photo.");
      profilePhotoBlob = blob;
      const url = URL.createObjectURL(blob);
      photoPreview.innerHTML = "";
      photoPreview.appendChild(el("img", { src: url, alt: "" }));
      prompt.textContent = "Photo captured. Fill details and submit.";
      setProgress(100);
      canSubmit();
    } catch (e) {
      toast("Capture failed", e?.message || String(e));
    }
  });

  submitBtn.addEventListener("click", async () => {
    try {
      submitBtn.disabled = "true";
      if (!scan.ok) throw new Error("Complete the scan first.");
      if (!profilePhotoBlob) throw new Error("Capture a profile photo first.");
      const h = (handle.value || "").trim().toLowerCase();
      const d = (display.value || "").trim();
      const b = (bio.value || "").trim();
      if (!/^[a-z0-9_]{3,20}$/i.test(h)) throw new Error("Username must be 3–20 chars: letters, numbers, underscore.");
      if (d.length < 2) throw new Error("Display name too short.");
      if (b.length > 240) throw new Error("Bio too long.");
      if (!adult.checked) throw new Error("You must confirm 18+ to create a profile.");
      if (!agree.checked) throw new Error("You must agree to the rules.");

      // Upload to storage
      const ts = Date.now();
      profilePhotoPath = `${state.user.id}/${ts}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("profile_photos")
        .upload(profilePhotoPath, profilePhotoBlob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("profile_photos").getPublicUrl(profilePhotoPath);
      profilePhotoUrl = pub?.publicUrl || null;

      // Insert request
      const { error: reqErr } = await supabase.from("profile_requests").insert({
        requester_id: state.user.id,
        handle: h,
        display_name: d,
        bio: b,
        photo_path: profilePhotoPath,
        photo_url: profilePhotoUrl,
        scan_meta: scan,
        attested_adult: true,
        status: "pending",
      });
      if (reqErr) throw reqErr;

      toast("Submitted", "Your profile request was submitted for moderator approval.");
      stopCamera(stream);
      stream = null;
      window.location.hash = "#/";
    } catch (e) {
      console.error(e);
      toast("Submit failed", e?.message || String(e));
      canSubmit();
    }
  });
}

async function sampleFace(detector, videoEl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const box = await detectFaceBox(detector, videoEl);
    if (box) return { box, at: new Date().toISOString() };
    await sleep(120);
  }
  return null;
}

async function waitForMovement(detector, videoEl, baseBox, dir, timeoutMs) {
  const started = Date.now();
  const base = centerOf(baseBox);
  const threshold = Math.max(14, Math.min(60, Math.round(Math.min(baseBox.width, baseBox.height) * 0.12)));
  while (Date.now() - started < timeoutMs) {
    const box = await detectFaceBox(detector, videoEl);
    if (!box) {
      await sleep(120);
      continue;
    }
    const c = centerOf(box);
    const dx = c.x - base.x;
    const dy = c.y - base.y;
    const v = dir.axis === "x" ? dx : dy;
    if (Math.sign(v) === dir.sign && Math.abs(v) >= threshold) {
      return { kind: "move", dir: dir.key, at: new Date().toISOString(), box, delta: { dx, dy }, threshold };
    }
    await sleep(120);
  }
  return null;
}

function centerOf(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function detectFaceBox(detector, videoEl) {
  if (!detector) return null;
  try {
    const faces = await detector.detect(videoEl);
    const f = faces?.[0];
    if (!f?.boundingBox) return null;
    const b = f.boundingBox;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

