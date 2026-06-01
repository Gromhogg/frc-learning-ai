# Learning App — FRC Knowledge Assessment

An AI-mentor learning app for FRC robotics teams. Each student picks a topic
(mill operation, lathe, CAD, electrical, general FRC knowledge, …), an AI
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

## 👋 Never set up a coding project before? Start here.

Don't worry — you don't need to know how any of the tech jargon above works
to run this app. Follow these steps and you'll be up and running. The
**technical Quick Start** further down is the same thing, just shorter and
without explanations.

### What you'll need

1. **A computer** running macOS, Windows, or Linux.
2. **Node.js** — this is the program that runs the app on your computer.
   Go to <https://nodejs.org> and download the version labeled "LTS"
   (Long-Term Support). Install it like any normal app — click through
   the installer.
3. **A Terminal** — this is the text-based window where you'll type
   commands.
   - **Mac:** press <kbd>⌘ Space</kbd>, type "Terminal", press Enter.
   - **Windows:** press the Start button, type "Terminal" or "PowerShell",
     press Enter.
4. **An Anthropic API key** — this is what lets the AI mentor work. It
   costs money per use (usually pennies per session), so this is your
   account, not a shared one.
   - Go to <https://console.anthropic.com> and create an account.
   - Add some credit (a few dollars is plenty to start).
   - Go to **Settings → API Keys** and create a new key. Copy it
     somewhere safe — it starts with `sk-ant-…`.

That's it. You don't need a code editor unless you want to look at the
code yourself.

### Step-by-step (with explanations)

Open your Terminal and copy-paste each command one at a time. Press
<kbd>Enter</kbd> after each line and wait for it to finish before doing
the next.

**1. Download the app to your computer.**
```bash
git clone https://github.com/Gromhogg/Learning-App.git
```
This downloads the whole project into a new folder called `Learning-App`
in whatever folder your Terminal is currently in. (If you don't have
`git` installed, get it from <https://git-scm.com/downloads>. Mac and
Linux usually have it already.)

**2. Move into that folder.**
```bash
cd Learning-App
```
`cd` means "change directory" — i.e. open this folder in the Terminal.

**3. Install the libraries the app depends on.**
```bash
npm install
```
This downloads a bunch of small helper packages. It takes a minute or two
and prints a lot of text — that's normal. As long as it doesn't say
"ERROR" in red at the end, you're fine.

**4. Set up your secret settings file.**
```bash
cp .env.example .env
```
This makes a copy of the template settings file. Now open the new `.env`
file and fill in your real values.

- On **Mac**, you can open it with: `open -e .env`
- On **Windows**, you can open it with: `notepad .env`

You need to change these two lines:
- `ANTHROPIC_API_KEY=your_key_here` → paste your `sk-ant-…` key after the `=`.
- `JWT_SECRET=change-this-to-a-long-random-string` → just type a long random
  string of letters and numbers (it doesn't matter what, as long as it's
  long and you don't share it).

You can leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as their
placeholder values — the app works without Google sign-in.

Save the file and close it.

**5. Set up the database.**
```bash
npm run db:migrate
```
This creates the file that stores users, topics, and assessments. You
only need to do this once.

```bash
npm run db:seed
```
*(Optional.)* This adds some pretend students and the FRC topics so you
have something to play with right away. Skip it if you'd rather start
empty.

**6. Run the app!**
```bash
npm run dev:all
```
This starts the app. Leave this Terminal window open — closing it stops
the app.

When you see something like `Server running at http://localhost:3001` and
`Local: http://localhost:5173`, open your web browser and visit
<http://localhost:5173>.

**7. Sign in.**
- Click **Sign Up**, enter a name, email, and password. That account is
  yours, immediately active.
- To use the manager/admin features (Knowledge Base editing, Access tab,
  etc.) sign in as the manager account — see `server/routes/auth.ts` if
  you're the owner.

To stop the app: come back to the Terminal and press
<kbd>Control</kbd> + <kbd>C</kbd>.

To run it again next time: open Terminal, `cd Learning-App`, and run
`npm run dev:all` again. Steps 1–5 only happen once.

---

## Quick start (for developers)

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

**The browser says "This site can't be reached" / "Could not reach the
server."** — Is the Terminal window still open and showing
`Server running at http://localhost:3001`? If you closed it, run
`npm run dev:all` again. Also make sure nothing else on your machine is
already using port 3001.

**Google sign-in shows `invalid_client`** — the placeholder
`GOOGLE_CLIENT_ID` in `.env` isn't a real client. Either follow step 1 to
add real OAuth credentials, or leave `GOOGLE_ENABLED = false` and use
email/password signup.

**The AI mentor never responds / a chat session shows an error.** —
Almost always a missing or invalid `ANTHROPIC_API_KEY` in `.env`. Open
`.env`, make sure the key starts with `sk-ant-` and there are no extra
quotes or spaces around it. Also check your account at
<https://console.anthropic.com> has credit.

**Browser shows nothing at `http://localhost:5173`.** — Wait 10–15
seconds after running `npm run dev:all`; the first start is slow. If it
still shows nothing, check the Terminal for red error text.

**"command not found: npm"** — Node.js isn't installed (or your Terminal
hasn't picked it up yet). Reinstall from <https://nodejs.org>, then close
and reopen your Terminal window.

**"command not found: git"** — Install Git from
<https://git-scm.com/downloads>, then reopen Terminal.

**`SQLITE_CONSTRAINT_FOREIGNKEY` when removing a user** — fixed already.
Both `DELETE /api/users/:id` and `POST /api/admin/users/:id/remove`
clear the user's assessment rows first.

---

## License

Private. Built for Team 972 Iron Claw.
