/* Row -> API shape, in one place, so every endpoint returns the same JSON for
   the same kind of thing and the mapping is never duplicated. */

/** A recipe card, as the home, results and saved pages consume it. */
export function recipeCard(row) {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category,
    description: row.description,
    imageUrl: row.image_url,
    timeMinutes: row.time_minutes,
    servings: row.servings,
    difficulty: row.difficulty,
    avgRating: row.avg_rating ?? null,
    reviewCount: Number(row.review_count ?? 0),
  };
}

/** A full recipe, assembled from its row plus ingredient and step rows. */
export function recipeDetail(row, ingredientRows, stepRows) {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category,
    description: row.description,
    imageUrl: row.image_url,
    timeMinutes: row.time_minutes,
    servings: row.servings,
    difficulty: row.difficulty,
    authorName: row.author_name ?? null,
    avgRating: row.avg_rating ?? null,
    reviewCount: Number(row.review_count ?? 0),
    ingredients: ingredientRows.map((i) => ({ emoji: i.emoji, name: i.name, qty: i.qty, unit: i.unit })),
    steps: stepRows.map((s) => s.text),
  };
}

/** One review row. `userId` is kept for the service to derive `mine`, then dropped. */
export function review(row) {
  return {
    id: Number(row.id),
    author: row.author,
    rating: Number(row.rating),
    comment: row.comment,
    createdAt: row.createdAt ?? row.created_at,
    userId: Number(row.userId ?? row.user_id),
  };
}
