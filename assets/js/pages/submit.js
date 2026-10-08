/* Submit a Recipe. Requires login (bounces to login otherwise). Builds the
   form with add/remove ingredient and step rows, previews and client-side
   resizes the photo to WebP, auto-saves a draft to localStorage, validates the
   same rules the server enforces, then uploads the photo and posts the recipe.
   Below the form it lists the user's own submissions with status badges. */

import { initChrome, safeNext } from "../ui/chrome.js";
import { me, uploadImage, submitRecipe, listMySubmissions } from "../data/api.js";
import { escapeHtml, statusBadge, recipeUrl } from "../ui/render.js";

initChrome();

const DRAFT_KEY = "ecb-eats:submit-draft";
const CATEGORIES = ["Pasta", "Stews", "Cakes", "Poultry", "Beef", "Vegetarian", "Seafood", "Soups", "Desserts", "Salads"];

const root = document.getElementById("submit-root");
let photoBlob = null; // the resized image to upload

start();

async function start() {
  const user = await me().catch(() => null);
  if (!user) {
    location.replace(`login.html?next=${encodeURIComponent(safeNext("/submit.html"))}`);
    return;
  }
  renderForm();
  loadMySubmissions();
}

function renderForm() {
  root.innerHTML = `
    <form class="submit-form" id="submit-form" novalidate>
      <p class="auth-form-error" id="form-error" role="alert" hidden></p>

      <label class="field">
        <span class="field-label">Title</span>
        <input type="text" name="title" minlength="3" maxlength="80" required aria-describedby="err-title">
        <span class="field-error" id="err-title" data-error="title" hidden></span>
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field-label">Category</span>
          <select name="category" required aria-describedby="err-category">
            <option value="">Choose…</option>
            ${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}
          </select>
          <span class="field-error" id="err-category" data-error="category" hidden></span>
        </label>
        <label class="field">
          <span class="field-label">Difficulty</span>
          <select name="difficulty" required aria-describedby="err-difficulty">
            <option value="">Choose…</option>
            <option>Easy</option><option>Medium</option><option>Hard</option>
          </select>
          <span class="field-error" id="err-difficulty" data-error="difficulty" hidden></span>
        </label>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="field-label">Time (minutes)</span>
          <input type="number" name="timeMinutes" min="1" max="1440" required aria-describedby="err-timeMinutes">
          <span class="field-error" id="err-timeMinutes" data-error="timeMinutes" hidden></span>
        </label>
        <label class="field">
          <span class="field-label">Servings</span>
          <input type="number" name="servings" min="1" max="50" required aria-describedby="err-servings">
          <span class="field-error" id="err-servings" data-error="servings" hidden></span>
        </label>
      </div>

      <label class="field">
        <span class="field-label">Description</span>
        <textarea name="description" rows="3" maxlength="2000" required aria-describedby="err-description"></textarea>
        <span class="field-error" id="err-description" data-error="description" hidden></span>
      </label>

      <fieldset class="field">
        <legend class="field-label">Photo</legend>
        <input type="file" id="photo" accept="image/jpeg,image/png,image/webp" aria-describedby="err-imageUrl">
        <div class="photo-preview" id="photo-preview" hidden><img alt="Preview"></div>
        <span class="field-error" id="err-imageUrl" data-error="imageUrl" hidden></span>
      </fieldset>

      <fieldset class="field">
        <legend class="field-label">Ingredients</legend>
        <div id="ingredient-rows"></div>
        <button type="button" class="row-add" data-add="ingredient"><i class="fas fa-plus"></i> Add ingredient</button>
        <span class="field-error" data-error="ingredients" hidden></span>
      </fieldset>

      <fieldset class="field">
        <legend class="field-label">Steps</legend>
        <div id="step-rows"></div>
        <button type="button" class="row-add" data-add="step"><i class="fas fa-plus"></i> Add step</button>
        <span class="field-error" data-error="steps" hidden></span>
      </fieldset>

      <button type="submit" class="auth-submit submit-send">Submit for review</button>
    </form>`;

  const form = root.querySelector("#submit-form");
  const ingredients = form.querySelector("#ingredient-rows");
  const steps = form.querySelector("#step-rows");

  form.querySelector('[data-add="ingredient"]').addEventListener("click", () => addIngredient());
  form.querySelector('[data-add="step"]').addEventListener("click", () => addStep());
  form.querySelector("#photo").addEventListener("change", onPhoto);
  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", saveDraft);

  restoreDraft(form, ingredients, steps);
}

/* ---------- Dynamic rows ---------- */

function addIngredient(values = {}) {
  const rows = document.getElementById("ingredient-rows");
  const row = document.createElement("div");
  row.className = "dyn-row";
  row.innerHTML = `
    <input type="text" class="dyn-emoji" placeholder="🍗" maxlength="8" value="${escapeHtml(values.emoji ?? "")}">
    <input type="text" class="dyn-name" placeholder="Ingredient" maxlength="80" value="${escapeHtml(values.name ?? "")}">
    <input type="text" class="dyn-qty" placeholder="Qty" maxlength="12" value="${escapeHtml(values.qty ?? "")}">
    <input type="text" class="dyn-unit" placeholder="Unit" maxlength="40" value="${escapeHtml(values.unit ?? "")}">
    <button type="button" class="row-remove" aria-label="Remove ingredient"><i class="fas fa-xmark"></i></button>`;
  row.querySelector(".row-remove").addEventListener("click", () => { row.remove(); saveDraft(); });
  rows.appendChild(row);
}

function addStep(value = "") {
  const rows = document.getElementById("step-rows");
  const row = document.createElement("div");
  row.className = "dyn-row dyn-row--step";
  row.innerHTML = `
    <span class="step-num">${rows.children.length + 1}</span>
    <textarea class="dyn-step" rows="2" maxlength="2000" placeholder="Describe this step">${escapeHtml(value)}</textarea>
    <button type="button" class="row-remove" aria-label="Remove step"><i class="fas fa-xmark"></i></button>`;
  row.querySelector(".row-remove").addEventListener("click", () => { row.remove(); renumber(); saveDraft(); });
  rows.appendChild(row);
}

function renumber() {
  document.querySelectorAll("#step-rows .step-num").forEach((el, i) => { el.textContent = i + 1; });
}

/* ---------- Photo: preview + resize to WebP (max 1600px) ---------- */

async function onPhoto(event) {
  const file = event.target.files[0];
  if (!file) { photoBlob = null; return; }
  try {
    photoBlob = await resizeToWebp(file, 1600);
  } catch {
    photoBlob = file; // fall back to the original if the browser can't encode
  }
  const preview = document.getElementById("photo-preview");
  preview.querySelector("img").src = URL.createObjectURL(photoBlob);
  preview.hidden = false;
}

function resizeToWebp(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/webp", 0.85);
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- Collect, validate, submit ---------- */

function collect() {
  const form = document.getElementById("submit-form");
  const get = (name) => form.elements[name].value.trim();

  const ingredients = [...document.querySelectorAll("#ingredient-rows .dyn-row")].map((row) => ({
    emoji: row.querySelector(".dyn-emoji").value.trim() || null,
    name: row.querySelector(".dyn-name").value.trim(),
    qty: row.querySelector(".dyn-qty").value.trim() || null,
    unit: row.querySelector(".dyn-unit").value.trim() || null,
  })).filter((i) => i.name);

  const steps = [...document.querySelectorAll("#step-rows .dyn-step")]
    .map((el) => el.value.trim()).filter(Boolean);

  return {
    title: get("title"),
    category: get("category"),
    difficulty: get("difficulty"),
    timeMinutes: get("timeMinutes"),
    servings: get("servings"),
    description: get("description"),
    ingredients,
    steps,
  };
}

/** Mirror the server rules so the user sees problems before uploading. */
function clientErrors(data, hasPhoto) {
  const e = {};
  if (data.title.length < 3) e.title = "At least 3 characters";
  if (!data.category) e.category = "Pick a category";
  if (!data.difficulty) e.difficulty = "Choose a difficulty";
  if (!(Number(data.timeMinutes) >= 1)) e.timeMinutes = "At least 1 minute";
  if (!(Number(data.servings) >= 1)) e.servings = "At least 1 serving";
  if (!data.description) e.description = "Add a short description";
  if (!hasPhoto) e.imageUrl = "Add a photo";
  if (data.ingredients.length < 2) e.ingredients = "Add at least 2 ingredients";
  if (data.steps.length < 1) e.steps = "Add at least 1 step";
  return e;
}

function showErrors(errors) {
  document.querySelectorAll(".field-error").forEach((el) => { el.hidden = true; el.textContent = ""; });
  for (const [field, message] of Object.entries(errors)) {
    const el = document.querySelector(`[data-error="${field}"]`);
    if (el) { el.textContent = message; el.hidden = false; }
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const formError = document.getElementById("form-error");
  formError.hidden = true;

  const data = collect();
  const errors = clientErrors(data, Boolean(photoBlob));
  if (Object.keys(errors).length) {
    showErrors(errors);
    return;
  }
  showErrors({});

  const button = event.currentTarget.querySelector(".submit-send");
  button.disabled = true;
  button.textContent = "Uploading photo…";

  try {
    const { url } = await uploadImage(photoBlob);
    button.textContent = "Submitting…";
    await submitRecipe({ ...data, imageUrl: url });

    localStorage.removeItem(DRAFT_KEY);
    root.innerHTML = `
      <div class="state-panel">
        <div class="state-icon">✅</div>
        <p class="state-message">Thanks! Your recipe is pending review. You'll see it below once an admin approves it.</p>
        <a href="submit.html" class="state-retry">Submit another</a>
      </div>`;
    loadMySubmissions();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Submit for review";
    if (error.fieldErrors) showErrors(mapServerFields(error.fieldErrors));
    formError.textContent = error.message ?? "Could not submit your recipe";
    formError.hidden = false;
  }
}

// Server field paths like "ingredients.0.name" collapse to the row's field key.
function mapServerFields(fieldErrors) {
  const out = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    out[key.split(".")[0]] = message;
  }
  return out;
}

/* ---------- Draft persistence ---------- */

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collect()));
  } catch { /* storage unavailable; a lost draft is not worth failing over */ }
}

function restoreDraft(form, ingredientRows, stepRows) {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch { draft = null; }

  if (draft) {
    for (const name of ["title", "category", "difficulty", "timeMinutes", "servings", "description"]) {
      if (form.elements[name] && draft[name]) form.elements[name].value = draft[name];
    }
    (draft.ingredients ?? []).forEach((i) => addIngredient(i));
    (draft.steps ?? []).forEach((text) => addStep(text));
  }

  // Always start with a couple of ingredient rows and one step row.
  while (ingredientRows.children.length < 2) addIngredient();
  if (stepRows.children.length === 0) addStep();
}

/* ---------- My Submissions ---------- */

async function loadMySubmissions() {
  const section = document.getElementById("my-submissions");
  const list = document.getElementById("my-submissions-list");

  let data;
  try {
    data = await listMySubmissions();
  } catch {
    return;
  }
  if (!data.recipes.length) return;

  section.hidden = false;
  list.innerHTML = data.recipes.map((r) => `
    <div class="submission-row">
      <div class="submission-main">
        ${r.status === "published"
          ? `<a href="${escapeHtml(recipeUrl(r.slug))}" class="submission-title">${escapeHtml(r.title)}</a>`
          : `<span class="submission-title">${escapeHtml(r.title)}</span>`}
        <span class="submission-category">${escapeHtml(r.category)}</span>
      </div>
      <div class="submission-status">
        ${statusBadge(r.status)}
        ${r.status === "rejected" && r.rejectionReason
          ? `<p class="submission-reason">${escapeHtml(r.rejectionReason)}</p>` : ""}
      </div>
    </div>`).join("");
}
