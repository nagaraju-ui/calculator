# Deploy to Vercel (with Neon Postgres)

This repo is set up to run on Vercel as a **serverless API** (`/api`) plus a **static dashboard** (`/public`), backed by a **Neon Postgres** database. (The `server/` folder is the local SQLite version for development only — Vercel ignores it.)

Why Postgres: Vercel has no persistent disk, so the local SQLite file can't be used in the cloud. Neon gives you a free hosted Postgres.

---

## Step 1 — Create a free Postgres database (Neon)

1. Go to **https://neon.tech** and sign up (free).
2. Create a project (any name, pick the region closest to you).
3. On the project dashboard, click **Connect** and copy the **Pooled connection** string. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require
   ```
   ⚠️ Use the one with **`-pooler`** in the host — serverless functions need the pooled endpoint.

You don't need to create any tables — the app creates them automatically on first run.

## Step 2 — Push this code to GitHub

Make sure the new files are committed and pushed (`api/`, `lib/`, `public/`, `vercel.json`, `package.json`):

```
cd C:\Users\guntr\OneDrive\Desktop\Finance
git add .
git commit -m "Add Vercel serverless + Postgres version"
git push
```

(If your push is still being denied as the wrong GitHub account, fix that first — see the note at the bottom.)

## Step 3 — Deploy on Vercel

1. Go to **https://vercel.com**, sign in with GitHub.
2. **Add New… → Project → Import** your `calculator` repo.
3. Settings:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (leave as the repo root — *not* `server`)
   - **Build Command / Output:** leave empty (no build needed)
4. Expand **Environment Variables** and add two:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | your Neon **pooled** connection string from Step 1 |
   | `JWT_SECRET` | any long random string (e.g. 40+ random characters) |

5. Click **Deploy**.

When it finishes, open the deployment URL. You'll see the login screen — click **"Need an account? Register"**, create your family account, and start adding income, expenses, and loans. The database tables are created automatically on the first request.

> Already imported the repo earlier (that's where the 404 came from)? Just go to the existing Vercel project → **Settings → Environment Variables**, add the two above, then **Deployments → Redeploy**.

---

## How the pieces map on Vercel

```
public/index.html   → served at  /            (the dashboard UI)
api/index.js        → served at  /api/*        (Express, as a serverless function)
lib/                → shared db + auth + interest logic
vercel.json         → routes /api/* to the function
package.json        → lists the function's dependencies (express, pg, …)
```

The dashboard calls the API at `/api/...` (same domain), so there's no CORS or separate backend URL to configure.

## Troubleshooting

- **404 NOT_FOUND** → Root Directory must be the repo root, and `vercel.json` + `public/index.html` must exist. Redeploy after fixing.
- **500 / "Server error"** → almost always `DATABASE_URL`. Confirm it's set in Vercel env vars, it's the **pooled** Neon string, and it ends with `?sslmode=require`. Redeploy after changing env vars (they only apply to new deployments).
- **Login works but data disappears** → that won't happen on Neon (it's persistent). It only happened with the local SQLite demo.

## Local development of this Vercel version (optional)

```
npm install
npm install -g vercel
# create a .env file with: DATABASE_URL=...your Neon string...   JWT_SECRET=...
vercel dev          # runs the serverless app locally at http://localhost:3000
```

Or just keep using the simpler local SQLite app in `server/` (`cd server && npm start`) for offline development.

---

## Note on the GitHub push (the earlier 403)

Your Git was authenticated as **GuntruTirupathamma**, which can't write to **nagaraju-ui**'s repo. To push as `nagaraju-ui`:

1. Remove the cached login: Start → **Credential Manager → Windows Credentials** → remove any `git:https://github.com` entry.
2. Run `git push` again and sign in as **nagaraju-ui** (use "Sign in with a different account" if your browser is logged in as the other one).
3. If it still fails, create a **Personal Access Token** (github.com as nagaraju-ui → Settings → Developer settings → Tokens (classic) → scope `repo`) and use it as the password when Git prompts.
