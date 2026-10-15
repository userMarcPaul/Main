-- Views that do the aggregate reads the Supabase JS client can't express.

-- A recipe card with its live rating summary and the author's display name.
create or replace view recipe_cards as
select
  r.id, r.slug, r.title, r.category, r.description, r.image_url,
  r.time_minutes, r.servings, r.difficulty, r.status, r.featured,
  r.author_id, r.rejection_reason, r.created_at,
  u.display_name                    as author_name,
  round(avg(v.rating)::numeric, 1)  as avg_rating,
  count(v.id)                       as review_count
from recipes r
left join users u   on u.id = r.author_id
left join reviews v on v.recipe_id = r.id
group by r.id, u.display_name;

-- Published categories with real counts.
create or replace view category_counts as
select category as name, count(*) as recipe_count
from recipes
where status = 'published'
group by category;
