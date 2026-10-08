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
