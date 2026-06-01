# Learning App — FRC Knowledge Assessment

An AI-mentor learning app for FRC robotics teams. Each student picks a topic
(mill operation, lathe, CAD, electrical, general FRC knowledge, …), the AI
mentor runs a short 10-question check using interactive widgets (quizzes,
checklists, drag-order, branching scenarios, code editors, labeled
diagrams), then scores the session and stores the transcript for an admin
to review.

Built with:
- **Frontend** — React 19 + Vite + Tailwind + react-router (`src/`)
- **Backend** — Hono + Node, served via `tsx` (`server/`)
- **Database** — SQLite via better-sqlite3 + Drizzle ORM (`db/`)
- **AI** — Anthropic Claude (via `@ai-sdk/anthropic` + Vercel AI SDK v6)
- **Auth** — JWT (jose) + bcrypt password hashes; optional Google OAuth (arctic)

---

## Quick start (clone-and-run)

Prerequisites: **Node 20+** and **npm**.

```bash
git clone https://github.com/Gromhogg/Learning-App.git
cd Learning-App
npm install
```

### 1. Configure environment

Copy the example and fill in your own values:

```bash
cp .env.example .env
```

Required:
- `ANTHROPIC_API_KEY` — get one from <https://console.anthropic.com>. Without
  this the chat sessions will not work (everything else still runs).
- `JWT_SECRET` — any long random string (e.g. `openssl rand -hex 32`).

Optional:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for the "Sign in with Google"
  button. Without these, email/password signup still works. The button is
  hidden via a flag in `src/pages/Login.tsx` (`GOOGLE_ENABLED`); flip to
  `true` after setting up an OAuth client with the redirect URI
  `http://localhost:3001/auth/google/callback`.

### 2. Set up the database

```bash
npm run db:migrate     # creates data/app.db and applies all migrations
npm run db:seed        # optional — adds 10 demo students + 8 demo topics
```

The DB lives at `data/app.db` and is **gitignored** — each install gets its
own.

### 3. Run the app

```bash
npm run dev:all        # runs frontend (http://localhost:5173) + API (http://localhost:3001)
```

Then open **<http://localhost:5173>**.

### 4. Sign in

- **Self sign-up** — click "Sign Up" on the login page. Any email works.
  New accounts are activated immediately as `student`.
- **Manager account** — see `server/routes/auth.ts` for the hardcoded
  god/dev login. Use it sparingly; it bypasses all role checks.
- Admins/managers can promote, demote, or remove other users from the
  **Access** tab in the admin dashboard.

---

## Useful npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Frontend only (Vite on 5173) |
| `npm run server` | Backend only (Hono/tsx on 3001) |
| `npm run dev:all` | Both, concurrently — usual command |
| `npm run build` | Type-check + production build of the frontend |
| `npm run db:generate` | Generate a new Drizzle migration from `db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `data/app.db` |
| `npm run db:seed` | Reset & re-seed the DB with demo data |
| `npm run lint` | Run ESLint |

---

## Project layout

```
src/                   React frontend
  pages/               Top-level routes (Login, Topics, Chat, Admin, …)
  components/          Widgets used inside chat sessions
  context/             Auth + Mode providers
server/                Hono API
  routes/              auth, users, topics, assessments, chat, ask, admin
  lib/                 jwt, knowledge, ai (system prompt builder), env
db/                    Drizzle schema, migration runner, seed script
drizzle/               Generated migrations (SQL + meta)
knowledge/             Per-topic source-of-truth text files the AI reads
data/                  SQLite DB lives here (gitignored)
```

---

## Adding or editing topics

1. Sign in as an admin/manager and open **Admin → Knowledge Base**, **+ Add
   Topic**. Filled-in content lives at
   `knowledge/<slug>/<slug>.txt` and is editable inline.
2. Or edit the `.txt` file directly on disk — changes take effect on the
   next chat session (no restart needed).

The AI mentor reads the entire knowledge file for the current topic on
every session, plus the student's name and past-assessment history, so
question difficulty and tone adapt automatically.

---

## Troubleshooting

**"Could not reach the server"** — make sure `npm run server` (or
`dev:all`) is running on port 3001. Nothing else on your machine should be
listening there.

**Google sign-in shows `invalid_client`** — the placeholder
`GOOGLE_CLIENT_ID` in `.env` isn't a real client. Either follow step 1 to
add real OAuth credentials, or leave `GOOGLE_ENABLED = false` and use
email/password signup.

**Chat session does nothing / 500 error** — usually a missing or invalid
`ANTHROPIC_API_KEY`. Check `data/app.db` exists (run `npm run db:migrate`).

**`SQLITE_CONSTRAINT_FOREIGNKEY` when removing a user** — fixed already.
Both `DELETE /api/users/:id` and `POST /api/admin/users/:id/remove`
clear the user's assessment rows first.

---

## License

Private. Built for Team 972 Iron Claw.
