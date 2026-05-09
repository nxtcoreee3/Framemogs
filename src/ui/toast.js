export function toast(title, body, { ms = 3600 } = {}) {
  const root = document.getElementById("toasts");
  if (!root) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="tTitle"></div><div class="tBody"></div>`;
  el.querySelector(".tTitle").textContent = title;
  el.querySelector(".tBody").textContent = body || "";
  root.appendChild(el);

  const t = window.setTimeout(() => {
    el.remove();
  }, ms);

  el.addEventListener("click", () => {
    window.clearTimeout(t);
    el.remove();
  });
}
