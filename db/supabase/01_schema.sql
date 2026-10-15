-- ECB Eats — Postgres schema for Supabase.
-- Run this in the Supabase SQL editor (or `supabase db` / psql) once.
-- All app access is server-side with the service-role key, which bypasses RLS;
-- RLS is enabled with no policies so the anon/public key can touch nothing.

create table if not exists users (
  id            bigint generated always as identity primary key,
  email         text unique not null,
  display_name  text not null,
  password_hash text not null,
  role          text not null default 'user' check (role in ('user','admin')),
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    bigint not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists recipes (
  id               bigint generated always as identity primary key,
  slug             text unique not null,
  title            text not null,
  category         text not null,
  description      text not null,
  image_url        text,
  time_minutes     integer not null,
  servings         integer not null,
  difficulty       text not null check (difficulty in ('Easy','Medium','Hard')),
  status           text not null default 'pending' check (status in ('pending','published','rejected')),
  author_id        bigint references users(id),
  featured         boolean not null default false,
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create table if not exists ingredients (
  id        bigint generated always as identity primary key,
  recipe_id bigint not null references recipes(id) on delete cascade,
  position  integer not null,
  emoji     text,
  name      text not null,
  qty       real,
  unit      text
);

create table if not exists steps (
  id        bigint generated always as identity primary key,
  recipe_id bigint not null references recipes(id) on delete cascade,
  position  integer not null,
  text      text not null
);

create table if not exists reviews (
  id         bigint generated always as identity primary key,
  recipe_id  bigint not null references recipes(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  unique (recipe_id, user_id)
);

create table if not exists saved_recipes (
  user_id   bigint not null references users(id) on delete cascade,
  recipe_id bigint not null references recipes(id) on delete cascade,
  saved_at  timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table if not exists rate_limits (
  key          text primary key,
  count        integer not null,
  window_start bigint not null            -- epoch milliseconds
);

create index if not exists idx_recipes_status_category on recipes(status, category);
create index if not exists idx_reviews_recipe on reviews(recipe_id);

-- Lock every table: only the service-role key (used by our API) may read/write.
alter table users         enable row level security;
alter table sessions      enable row level security;
alter table recipes       enable row level security;
alter table ingredients   enable row level security;
alter table steps         enable row level security;
alter table reviews       enable row level security;
alter table saved_recipes enable row level security;
alter table rate_limits   enable row level security;
