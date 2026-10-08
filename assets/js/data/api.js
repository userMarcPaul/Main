/* =========================================
   ECB Eats — API client
   One place that knows how to talk to /api.
   ========================================= */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get(path, params = {}) {
  const url = new URL(path, location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  let response;
  try {
    response = await fetch(url);
  } catch {
    // Offline, DNS failure, server not running — no status to report.
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }

  return response.json();
}

/** Published recipes, optionally filtered. */
export function listRecipes({ q, category, featured, limit } = {}) {
  return get("/api/recipes", {
    q,
    category,
    featured: featured ? "1" : undefined,
    limit,
  });
}

/** One recipe with ingredients, steps and review summary. Throws 404. */
export function getRecipe(slug) {
  return get(`/api/recipes/${encodeURIComponent(slug)}`);
}

/** Categories that actually have published recipes, with real counts. */
export function listCategories() {
  return get("/api/categories");
}

/* ---------- Writes ---------- */

async function send(method, path, body) {
  let response;
  try {
    response = await fetch(new URL(path, location.origin), {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
    error.fieldErrors = data.fieldErrors ?? null;
    throw error;
  }
  return data;
}

/* ---------- Auth ---------- */

export const signup = (body) => send("POST", "/api/auth/signup", body);
export const login = (body) => send("POST", "/api/auth/login", body);
export const logout = () => send("POST", "/api/auth/logout", {});

/** The current user, or null when signed out (instead of throwing on 401). */
export async function me() {
  try {
    return await send("GET", "/api/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/* ---------- Reviews ---------- */

export const getReviews = (slug, page = 1) =>
  get(`/api/recipes/${encodeURIComponent(slug)}/reviews`, { page });

export const postReview = (slug, body) =>
  send("POST", `/api/recipes/${encodeURIComponent(slug)}/reviews`, body);

export const deleteReview = (slug, id) =>
  send("DELETE", `/api/recipes/${encodeURIComponent(slug)}/reviews${id ? `?id=${encodeURIComponent(id)}` : ""}`);

/* ---------- Saved recipes ---------- */

export const listSaved = () => send("GET", "/api/saved");

/** Whether one recipe is saved by the current user. Returns false when signed out. */
export async function isSaved(slug) {
  try {
    return (await send("GET", `/api/saved?slug=${encodeURIComponent(slug)}`)).saved;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return false;
    throw error;
  }
}

export const saveRecipe = (slug) => send("POST", "/api/saved", { slug });
export const unsaveRecipe = (slug) => send("DELETE", `/api/saved/${encodeURIComponent(slug)}`);

/* ---------- Submissions & moderation (Phase 6) ---------- */

/** Upload a recipe photo (a Blob). Returns { url }. */
export async function uploadImage(blob) {
  let response;
  try {
    response = await fetch(new URL("/api/upload", location.origin), {
      method: "POST",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      credentials: "same-origin",
      body: blob,
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? `Upload failed (${response.status})`, response.status);
  return data;
}

export const submitRecipe = (body) => send("POST", "/api/recipes", body);

/** The caller's own recipes in every status. */
export const listMySubmissions = () => send("GET", "/api/recipes?mine=1");

/* Admin */
export const adminListSubmissions = (status = "pending") =>
  send("GET", `/api/admin/submissions?status=${encodeURIComponent(status)}`);
export const adminGetSubmission = (id) =>
  send("GET", `/api/admin/submissions?id=${encodeURIComponent(id)}`);
export const adminModerate = (body) => send("PATCH", "/api/admin/submissions", body);
