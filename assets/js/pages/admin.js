/* Admin moderation queue. Admin-only: a non-admin or signed-out visitor is
   sent away. Lists submissions by status, previews one inline using the recipe
   styles, and approves or rejects (with a reason). */

import { initChrome, safeNext } from "../ui/chrome.js";
import { me, adminListSubmissions, adminGetSubmission, adminModerate } from "../data/api.js";
import {
  escapeHtml, statusBadge, formatMinutes, skeletonCards, emptyState,
} from "../ui/render.js";

initChrome();

const queue = document.getElementById("admin-queue");
let status = "pending";

start();

async function start() {
  const user = await me().catch(() => null);
  if (!user) {
    location.replace(`login.html?next=${encodeURIComponent(safeNext("/admin.html"))}`);
    return;
  }
  if (user.role !== "admin") {
    queue.innerHTML = emptyState("This page is for admins only.", '<a href="index.html" class="state-retry">Back to recipes</a>');
    document.getElementById("admin-tabs").hidden = true;
    return;
  }

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      status = tab.dataset.status;
      load();
    });
  });
  load();
}

async function load() {
  queue.innerHTML = skeletonCards(3, "result");
  let data;
  try {
    data = await adminListSubmissions(status);
  } catch (error) {
    queue.innerHTML = emptyState(error.message ?? "Couldn't load the queue.");
    return;
  }
  render(data.submissions);
}

function render(submissions) {
  if (!submissions.length) {
    queue.innerHTML = emptyState(`Nothing ${status}.`);
    return;
  }
  queue.innerHTML = submissions.map(card).join("");
  submissions.forEach((s) => wire(s.id));
}

function card(s) {
  return `
    <article class="admin-card" data-card="${s.id}">
      <div class="admin-card-head">
        <img class="admin-thumb" src="${escapeHtml(s.imageUrl)}" alt="" loading="lazy">
        <div class="admin-card-meta">
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.category)} · ${escapeHtml(formatMinutes(s.timeMinutes))} · by ${escapeHtml(s.authorName ?? "unknown")}</p>
          ${statusBadge(s.status)}
        </div>
        <button type="button" class="admin-preview-toggle" data-preview="${s.id}">Preview</button>
      </div>
      <div class="admin-preview" id="preview-${s.id}" hidden></div>
      ${s.status === "pending" ? `
      <div class="admin-actions">
        <button type="button" class="admin-approve" data-approve="${s.id}">Approve</button>
        <div class="admin-reject">
          <input type="text" class="admin-reason" id="reason-${s.id}" placeholder="Reason (optional)" maxlength="400">
          <button type="button" class="admin-reject-btn" data-reject="${s.id}">Reject</button>
        </div>
      </div>` : ""}
      ${s.status === "rejected" && s.rejectionReason
        ? `<p class="admin-reason-shown">Reason: ${escapeHtml(s.rejectionReason)}</p>` : ""}
    </article>`;
}

function wire(id) {
  const card = queue.querySelector(`[data-card="${id}"]`);
  card.querySelector(`[data-preview="${id}"]`).addEventListener("click", () => togglePreview(id));
  card.querySelector(`[data-approve="${id}"]`)?.addEventListener("click", () => moderate(id, "approve"));
  card.querySelector(`[data-reject="${id}"]`)?.addEventListener("click", () => {
    moderate(id, "reject", card.querySelector(`#reason-${id}`).value);
  });
}

async function togglePreview(id) {
  const panel = document.getElementById(`preview-${id}`);
  if (!panel.hidden) { panel.hidden = true; return; }

  panel.hidden = false;
  panel.innerHTML = "<p>Loading…</p>";
  try {
    const r = await adminGetSubmission(id);
    panel.innerHTML = `
      <p class="admin-preview-desc">${escapeHtml(r.description)}</p>
      <h4 class="recipe-section-heading">Ingredients</h4>
      <div class="ingredients-list">
        ${r.ingredients.map((i) => `
          <div class="ingredient-row">
            <div class="ingredient-left">
              <span class="ingredient-emoji">${escapeHtml(i.emoji ?? "")}</span>
              <span class="ingredient-name">${escapeHtml(i.name)}</span>
            </div>
            <span class="ingredient-amount">${escapeHtml([i.qty, i.unit].filter(Boolean).join(" "))}</span>
          </div>`).join("")}
      </div>
      <h4 class="recipe-section-heading">Instructions</h4>
      <div class="procedures-list">
        ${r.steps.map((text, i) => `
          <div class="step-item"><div class="step-number">${i + 1}</div><p class="step-text">${escapeHtml(text)}</p></div>`).join("")}
      </div>`;
  } catch (error) {
    panel.innerHTML = `<p class="reviews-error">${escapeHtml(error.message ?? "Could not load preview")}</p>`;
  }
}

async function moderate(id, action, reason) {
  const card = queue.querySelector(`[data-card="${id}"]`);
  card.style.opacity = "0.5";
  try {
    await adminModerate({ id, action, reason });
    load(); // refresh the current tab
  } catch (error) {
    card.style.opacity = "1";
    alert(error.message ?? "Could not update the submission");
  }
}
