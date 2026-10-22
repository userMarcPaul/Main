# Deployment Guide (Beginner-Friendly)

This guide takes **ECB Eats** from your laptop to a live website that anyone can visit,
using **Render** (to run the app) and **Supabase** (for the database and the uploaded
photos). It assumes you have never used either before, so it explains each step and every
new word as it comes up. Follow it top to bottom.

Plan for about **30–45 minutes** the first time.

---

## First, the big picture

Your app has two halves that need a home online:

1. **The website + its code** (the pages people see, and the small programs in the `/api`
   folder that handle logins, reviews, and recipe submissions). This runs on **Render** as
   a single always-on Node.js server.
2. **The data and the photos** (recipes, user accounts, reviews, and uploaded images).
   These live on **Supabase** — the recipes/accounts in its **database**, the photos in its
   **Storage**.

A few words you'll see a lot:

- **Database** — an organized store for your data, like a set of spreadsheets that
  programs can read and write. Supabase gives you one (based on *Postgres*, a popular
  database).
- **Storage bucket** — a folder in the cloud for files (here, uploaded recipe photos).
  Supabase gives you this too.
- **Deploy** — to publish your app so it's live on the internet.
- **Environment variable** ("env var") — a secret setting, like a password or a key, that
  you give to the app without writing it into the code. You'll paste a few into Render.
- **Build / Start command** — Render first *builds* (installs the code's libraries with
  `npm install`), then *starts* the app (`npm start`). The project already defines both.

**The order we'll do things:** set up Supabase (database + photo storage) → put starter
data in → send your code to GitHub → connect Render to GitHub and deploy → check the live
site.

> **You need three free accounts.** Make them first if you don't have them:
> [github.com](https://github.com), [supabase.com](https://supabase.com),
> [render.com](https://render.com). Tip: sign up for Supabase and Render using their
> "Continue with GitHub" buttons — it links everything and saves time later.

---

## Part A — Set up Supabase (database + photo storage)

### A1. Create the project

1. Go to **supabase.com** and sign in.
2. Click **New project**.
3. Fill in:
   - **Name**: `ecb-eats` (anything you like).
   - **Database Password**: click **Generate a password** and let it save. You won't type
     this anywhere for this app, but keep it somewhere safe.
   - **Region**: pick the one closest to you.
4. Click **Create new project** and wait 1–2 minutes while Supabase builds it.

### A2. Copy your two secret values

The app needs two things from Supabase to connect.

1. In your project, click the **gear icon (Project Settings)** in the left sidebar.
2. Click **API**.
3. Copy these two into a temporary note:
   - **Project URL** — looks like `https://abcdxyz.supabase.co`.
   - **service_role** key — under *Project API keys*. It's a long string; click the reveal
     icon, then copy.

> ⚠️ **Treat the `service_role` key like a master password.** It can read and change
> everything in your database. Only ever paste it into (1) your private `.env.local` file
> on your laptop and (2) Render's settings. Never put it in a webpage, never share it, and
> never commit it to GitHub. (Leaked it? Come back to Settings → API and click *Reset*.)

### A3. Create the tables (run three SQL files)

Your database starts empty. These three files in your project create the tables for
recipes, users, and reviews. **SQL** is just the language databases speak — you'll
copy-paste and click Run, no SQL knowledge needed.

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. On your laptop, open `db/supabase/01_schema.sql`, select all, and copy it.
4. Paste it into the editor and click **Run**. You should see "Success. No rows returned."
5. Repeat steps 2–4 for the other two files, **in this exact order**:
   - `db/supabase/02_views.sql`
   - `db/supabase/03_functions.sql`

(Order matters — the later files depend on the tables the first one creates.)

### A4. Create the photo storage bucket

Uploaded recipe photos need a public home.

1. In Supabase, click **Storage** in the left sidebar.
2. Click **New bucket**.
3. Name it **exactly** `recipe-images`.
4. Turn **ON** the **Public bucket** toggle (so the photos can be shown on your site).
5. Click **Create bucket**.

> The name `recipe-images` must match the `SUPABASE_STORAGE_BUCKET` value in `render.yaml`.
> If you pick a different name, update it in both places.

---

## Part B — Put starter data in, and test on your laptop

Your database has tables but no recipes yet. You'll fill it by running two commands from
your laptop. These read your secret keys from a file called `.env.local`.

### B1. Create the `.env.local` file

1. In the project folder, make a copy of `.env.local.example` and name the copy
   `.env.local`.
2. Open `.env.local` and fill in your real values from Part A2. Replace the `< >` parts:

   ```
   SUPABASE_URL=https://abcdxyz.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<paste the long service_role key here>
   ADMIN_EMAIL=you@example.com
   DEMO_PASSWORD=ChooseAPassword123!
   SITE_URL=https://ecb-eats.onrender.com
   SUPABASE_STORAGE_BUCKET=
   ```

   What these mean:
   - `ADMIN_EMAIL` — when you later sign up on the site **with this exact email**, that
     account becomes the admin (can manage submissions). Use your real email.
   - `DEMO_PASSWORD` — the password for the demo account the starter data creates.
   - `SITE_URL` — your future website address (you'll confirm it in Part D; you can guess
     `https://ecb-eats.onrender.com` for now).
   - Leave `SUPABASE_STORAGE_BUCKET` **empty** for local testing — that way uploads you try
     on your laptop save to a local folder instead of the cloud. Render sets this for the
     live site automatically.

   > `.env.local` is already set to be ignored by git, so your secrets won't be uploaded.

### B2. Install, add starter data, and run it locally

Open a terminal **in the project folder** and run these one at a time:

```bash
npm install        # downloads the code libraries the app needs (one time)
npm run seed       # fills the database with the starter recipes
npm run seed:demo  # creates the demo user account
npm run dev        # starts the site on your laptop
```

Open **http://localhost:3000** in your browser. You should see the recipes. Click around:
open a recipe, try search, sign up with your `ADMIN_EMAIL`. If that works, you're ready to
go live. Stop the local site with **Ctrl + C** when done.

> "Seed" means "plant the starter data." The seed commands are safe to run again — they
> skip anything that already exists.

---

## Part C — Send your code to GitHub

Render builds your website from the code stored on **GitHub**, so your latest code needs to
be there. From the terminal, in the project folder:

```bash
git add -A
git commit -m "Prepare for Render deployment"
git push
```

> If `git push` asks you to sign in or set up a remote, follow GitHub's prompts, or create
> the repository on github.com first and connect it. After `push`, your code is visible in
> your GitHub repo online.
>
> ⚠️ Never commit `.env.local` or any private key — the project already keeps those out.

---

## Part D — Deploy on Render

The project includes a file called `render.yaml` (a "Blueprint") that tells Render exactly
what to create: the website server **and** a once-a-day cleanup task. You don't configure
those by hand — Render reads the file.

### D1. Create the Blueprint

1. Go to **render.com** and sign in (use "Continue with GitHub").
2. In the dashboard, click **New → Blueprint**.
3. Connect your GitHub account if asked, then pick this repository.
4. Render reads `render.yaml` and shows the services it will create:
   - **ecb-eats** — the website (a "Web Service")
   - **ecb-eats-cleanup** — the daily cleanup (a "Cron Job")
5. Click **Apply** / **Create** to continue.

### D2. Fill in the secret environment variables

Render will prompt you for the values marked as secret in `render.yaml` (it won't ask for
`SUPABASE_STORAGE_BUCKET` — that one already has its value, `recipe-images`). Enter:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | your Project URL from Part A2 |
| `SUPABASE_SERVICE_ROLE_KEY` | your `service_role` key from Part A2 |
| `ADMIN_EMAIL` | the same email you used in `.env.local` |
| `DEMO_PASSWORD` | the same demo password |
| `SITE_URL` | your Render URL (see note below) |

> **About the URL:** Render gives the web service an address like
> `https://ecb-eats.onrender.com` (if the name `ecb-eats` is taken, it adds a few random
> characters). You can finish deploying first, copy the real URL from the service's page,
> then update `SITE_URL` and click **Save** / redeploy.

The same two Supabase secrets are also needed by the cleanup Cron Job — enter them there
too if Render asks separately.

### D3. Deploy

Render now builds (`npm install`) and starts (`npm start`) the app. The first build takes
a few minutes. When it finishes, the service page shows **Live** and your public URL.

> From now on, **every push to GitHub's `main` branch auto-deploys** — you won't repeat
> these steps. To redeploy by hand (for example after changing an env var), open the
> service and click **Manual Deploy → Deploy latest commit**.

---

## Part E — Check the live site

Open your Render URL and confirm:

- Recipes load on the home page.
- Search works, and clicking a recipe opens it.
- You can **sign up** — use your `ADMIN_EMAIL` so that account becomes the admin.
- You can **submit a recipe with a photo**, and the photo shows up (that's Supabase Storage
  working).
- You can **post a review** and the star rating updates.

🎉 If all that works, you're live.

> ⏳ **Heads-up about the free plan:** Render's free web service goes to sleep after about
> 15 minutes of no visitors. The next visit then takes ~30–50 seconds to wake it up before
> the page loads. That's normal on the free tier; Render's paid plan ($7/month) keeps it
> always awake.

---

## Troubleshooting (what to check when something's wrong)

| What you see | What it usually means | How to fix it |
| --- | --- | --- |
| First visit after a while is very slow | Free service was asleep | Normal — wait ~30–50 s, or upgrade to a paid plan |
| Every page shows errors / recipes won't load | The app can't reach the database | In Render → the web service → **Environment**, double-check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy |
| Site loads but there are **no recipes** | The database was never seeded | Run `npm run seed` on your laptop (with `.env.local` pointing at the Supabase project) |
| Uploaded photos don't appear | The storage bucket is missing or not public | In Supabase → Storage, confirm a **public** bucket named `recipe-images` exists (Part A4) |
| Uploads fail with an error | Bucket name mismatch | The bucket name must match `SUPABASE_STORAGE_BUCKET` in `render.yaml` (`recipe-images`) |
| Signing up didn't make me admin | Email didn't match | Sign up with **exactly** the address in `ADMIN_EMAIL` |
| I changed an env var but nothing changed | New values only apply to new deploys | Render → the service → **Manual Deploy → Deploy latest commit** |

> To read the live server's logs (helpful when something errors), open the web service in
> Render and click the **Logs** tab.

---

## Cheat sheet of the env vars

| Name | What it's for | Where you set it |
| --- | --- | --- |
| `SUPABASE_URL` | Address of your database | `.env.local` and Render |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret master key for the database (keep private) | `.env.local` and Render |
| `ADMIN_EMAIL` | Account with this email becomes admin on signup | `.env.local` and Render |
| `DEMO_PASSWORD` | Password for the demo account | `.env.local` and Render |
| `SITE_URL` | Your public website address | `.env.local` and Render |
| `SUPABASE_STORAGE_BUCKET` | Which Supabase bucket holds uploaded photos | `render.yaml` (empty locally = save to disk) |
