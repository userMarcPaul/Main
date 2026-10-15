-- RPC functions for the operations PostgREST can't do from the client:
-- atomic multi-row writes and an atomic rate-limit counter.

-- Create a pending submission (recipe + ingredients + steps) atomically.
-- ingredients: [{emoji,name,qty,unit}], steps: ["text", ...]
create or replace function create_submission(
  p_slug text, p_title text, p_category text, p_description text,
  p_image_url text, p_time_minutes integer, p_servings integer,
  p_difficulty text, p_author_id bigint,
  p_ingredients jsonb, p_steps jsonb
) returns bigint
language plpgsql
as $$
declare
  new_id bigint;
  item jsonb;
  idx integer;
begin
  insert into recipes (slug, title, category, description, image_url,
                       time_minutes, servings, difficulty, status, author_id, featured)
  values (p_slug, p_title, p_category, p_description, p_image_url,
          p_time_minutes, p_servings, p_difficulty, 'pending', p_author_id, false)
  returning id into new_id;

  idx := 0;
  for item in select * from jsonb_array_elements(p_ingredients) loop
    insert into ingredients (recipe_id, position, emoji, name, qty, unit)
    values (
      new_id, idx,
      nullif(item->>'emoji', ''),
      item->>'name',
      case when item->>'qty' is null or item->>'qty' = '' then null else (item->>'qty')::real end,
      nullif(item->>'unit', '')
    );
    idx := idx + 1;
  end loop;

  idx := 0;
  for item in select * from jsonb_array_elements(p_steps) loop
    insert into steps (recipe_id, position, text) values (new_id, idx, item #>> '{}');
    idx := idx + 1;
  end loop;

  return new_id;
end;
$$;

-- Fixed-window rate limit. Returns true if the attempt is allowed, false if the
-- window is full. Atomic via an upsert so concurrent requests can't over-count.
create or replace function rl_touch(
  p_key text, p_limit integer, p_window_ms bigint
) returns table(allowed boolean, retry_after integer)
language plpgsql
as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  cur_count integer;
  cur_start bigint;
begin
  select count, window_start into cur_count, cur_start
  from rate_limits where key = p_key for update;

  if not found or now_ms - cur_start >= p_window_ms then
    insert into rate_limits (key, count, window_start)
    values (p_key, 1, now_ms)
    on conflict (key) do update set count = 1, window_start = now_ms;
    return query select true, 0;
  elsif cur_count >= p_limit then
    return query select false, ceil((p_window_ms - (now_ms - cur_start)) / 1000.0)::integer;
  else
    update rate_limits set count = count + 1 where key = p_key;
    return query select true, 0;
  end if;
end;
$$;

-- Purge stale rate-limit rows (used by the cleanup cron).
create or replace function rl_purge(p_older_than_ms bigint)
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  delete from rate_limits
  where window_start < (extract(epoch from now()) * 1000)::bigint - p_older_than_ms;
  get diagnostics removed = row_count;
  return removed;
end;
$$;
