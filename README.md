# 972 Chat Bot

A chat app for FRC team 972. Students ask about the shop, the robot, wiring,
CAD, or code — by typing, talking, or sending a photo — and an AI mentor
answers. The starter questions on the empty chat screen are picked for each
person, based on what they've been asking about. (Each person can see and
clear this from their name menu → **Your interests**. Nobody else sees it.)

**Pictures.** The bot can find photos and diagrams (from Wikimedia Commons,
or the web) and show them under its answer.

**Slack.** Students can also ask the bot in Slack, by @mentioning it or
sending it a message. It can learn team facts from chosen channels and tell
admins when something needs review.

**It gets better over time.** Three things help the AI improve, and a mentor
approves every change before students see it:

1. **Suggestions.** Once a day, an AI reviewer reads recent student chats
   (thumbs-down answers first, names removed) and suggests changes to the AI's
   instructions. Mentors see what would change and click **Apply** or
   **Dismiss**.
2. **Prompt assistant.** Mentors can just ask, e.g. "make answers shorter for
   beginners". The assistant drafts the change, and the mentor applies it.
3. **Team facts.** The app picks up facts about *your* team from chats
   ("the drivetrain uses Kraken motors"). Mentors approve them before the AI
   uses them.

There are two kinds of people:

| | Student | Admin (mentor) |
| --- | --- | --- |
| Chat, send photos, keep history | ✅ | ✅ |
| Thumbs up / down on answers | ✅ | ✅ |
| Edit the AI's instructions, apply suggestions | ❌ | ✅ |
| Review team facts, manage reference docs | ❌ | ✅ |

**Accounts.** New accounts need a school email (`@lghsstudent.org` or
`@lghsuhsd.org`) and a 6-digit code that gets emailed to them from the team
Gmail. Google sign-in asks for the school email first, so it can't fall back
to a personal Gmail. After 10 wrong passwords, an account is locked for 15
minutes.

**Admins.** Everyone sees an **Admin** button. Typing the admin password once
makes you an admin for good. The password is the `ADMIN_CODE` secret. Admins
can see who else is an admin (Admin → **Admins**); nobody can remove admin
access in the app. The server checks this on every admin request, not just in
the screen, and allows 5 wrong tries per 15 minutes.

**API keys.** Chats run on the team's Claude API key. An admin can set or
replace it in the app (Admin → **Settings** → Team API key); until then the
`ANTHROPIC_API_KEY` secret is used. Anyone can run their own chats on their
own key instead (avatar menu → **API key**) and switch back to the team key
any time. Keys are checked with Anthropic before saving, stored locked
(encrypted with `JWT_SECRET`), and never shown again, only their last 4
characters. Background jobs (learning facts, reviews) always use the team key.

**Nothing gets lost.** Prompt changes are saved as versions you can restore.
If two admins edit at once, the second one sees both versions instead of
overwriting. Removed facts and deleted docs can be restored. Admin → History →
**Activity** shows who changed what.

**Voice.** The mic button in the message box turns speech into text (Chrome,
Edge, Safari). It sends one message when you press send, and stops on its own
after 10 quiet seconds or 3 minutes without sending. The browser sends the
audio to Google (Chrome) or Apple (Safari) to turn it into words.

Built with:
- **Screens** — React 19, Vite, Tailwind, Radix menus and dialogs (`src/`)
- **Server** — Hono, running on Cloudflare Workers (`server/`)
- **AI** — Claude, run through the [Pi](https://pi.dev) agent kit
  (`@mariozechner/pi-ai` and `@mariozechner/pi-agent-core`)
- **Database** — Cloudflare D1 (SQLite in the cloud) with Drizzle (`db/`)
- **Files** (reference docs, photos) — Cloudflare R2
- **Sign-in** — name + password, or Google

---

## 👋 Never set up a coding project before? Start here.

This part runs the app **on your own computer**, for trying things out.
To put it on the internet for the team, see
[Putting it online](#putting-it-online-cloudflare) further down.

### What you'll need

1. **A Mac** (Windows works too, but these steps are written for a Mac).
2. **Node.js** — the program that runs the app. Get the "LTS" version from
   <https://nodejs.org> and install it like any normal app.
3. **A Terminal** — the text window where you type commands. Press
   <kbd>⌘ Space</kbd>, type "Terminal", press Enter.
4. **An Anthropic API key** — this is what makes the AI work. It costs money
   per use (usually pennies per conversation), billed to your account.
   - Sign up at <https://console.anthropic.com>.
   - Add some credit — a few dollars goes a long way.
   - Under **Settings → API Keys**, create a key and copy it. It starts
     with `sk-ant-…`.

### Step by step

Copy-paste one command at a time, pressing <kbd>Enter</kbd> after each and
waiting for it to finish.

**1. Download the app.**
```bash
git clone https://github.com/Gromhogg/Learning-App.git
```

**2. Move into the folder.**
```bash
cd Learning-App
```
`cd` means "change directory" — it opens that folder in the Terminal.

**3. Install the pieces the app depends on.**
```bash
npm install
```
This prints a lot of text and takes a minute. That's normal.

**4. Create your settings file.**
```bash
cp .env.example .env
```
Now open the new `.env` file and fill it in:
```bash
open -e .env
```
Three lines matter:
- `ANTHROPIC_API_KEY=` — paste your `sk-ant-…` key here.
- `JWT_SECRET=` — type a long random string of letters and numbers. It
  doesn't matter what, as long as it's long and you keep it private.
- `ADMIN_CODE=` — the admin password. Anyone who types this becomes an
  admin, so only give it to mentors.

Leave the other lines alone for now. Sign-up codes are printed in the
Terminal window instead of emailed, and the app works fine without Google
sign-in, web search, or Slack. Save and close.

**5. Create the database on your computer.**
```bash
npm run db:migrate:local
```
If it asks a question, type `y` and press Enter. You only do this once (and
again after an update that changes the database). The app fills in the AI's
starting instructions by itself the first time it runs.

**6. Run it.**
```bash
npm run dev
```
Leave this Terminal window open — closing it stops the app. When you see
`Local: http://localhost:5173`, open that address in your browser.

**7. Make your account.**
Click **Create an account** and use your school email. The 6-digit code
shows up in the Terminal window, in a line starting with `[email]`. Mentors
then click **Admin** (top right) and type the admin password once.

To stop the app, come back to the Terminal and press
<kbd>Control</kbd> + <kbd>C</kbd>. To run it again later, just `cd
Learning-App` and `npm run dev` — steps 1–5 only happen once.

---

## Putting it online (Cloudflare)

The real app runs on **Cloudflare Workers**. It will live at a free address
like `https://chatbot-972.your-account.workers.dev`. Everything — the app,
the database, and the files — lives in one Cloudflare account.

Do these steps once, in the Terminal, inside the app's folder.

### 1. Make a Cloudflare account

1. Sign up at <https://dash.cloudflare.com/sign-up>.
2. In the dashboard, go to **Workers & Pages → Plans** and pick
   **Workers Paid** ($5 a month). The free plan is too small for this app.
3. Open **R2 Object Storage** in the left menu once. If it asks you to turn
   it on, do that (it's included; storing a few files costs nothing).

### 2. Connect your computer to the account

```bash
npx wrangler login
```
A browser window opens. Click **Allow**.

### 3. Create the database, file storage, and Slack queue

```bash
npx wrangler d1 create chatbot972
```
This prints a `database_id` (a long string of letters and numbers). Open
`wrangler.jsonc` and paste it over the zeros on the `"database_id"` line.

```bash
npx wrangler r2 bucket create chatbot972-files
npx wrangler queues create chatbot972-slack
```

Then create the tables in the new database:
```bash
npm run db:migrate:remote
```
Type `y` if it asks.

### 4. Move the old data (only if you ran the old version of the app)

The old app kept everything in the `data/` folder. These two commands copy it
into Cloudflare. Do this **before** step 5, so the app starts with your data.

```bash
npx tsx scripts/export-to-d1.ts
npx wrangler d1 execute chatbot972 --remote --file data/d1-import.sql
npx tsx scripts/upload-files.ts --remote
```
The first makes `data/d1-import.sql` from the old database. The second loads
it. The third uploads the reference docs, deleted docs, and photos. All three
are safe to run again if something goes wrong. Keep `data/` as a backup —
the app doesn't use it any more.

### 5. Put the app online

```bash
npm run deploy
```
The first time, it may ask you to pick a `workers.dev` name for your account.
At the end it prints the app's address, like
`https://chatbot-972.your-account.workers.dev`.

Open `wrangler.jsonc`, find the `"APP_URL"` line, and put that address there
(no `/` at the end).

### 6. Add the secrets

Secrets are passwords and keys. They're kept by Cloudflare, not in any file.
Run each command below. Each one asks you to paste the value, then press
Enter.

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_CODE
```
- `ANTHROPIC_API_KEY` — your `sk-ant-…` key. (You can also set or change
  the team key later in the app: Admin → Settings.)
- `JWT_SECRET` — a long random string. **If you moved old data in step 4,
  use the same one as in your old `.env`**, so people stay signed in. It
  also locks saved API keys, so if you ever change it, people need to add
  their keys again.
- `ADMIN_CODE` — the admin password.

The others are optional and are explained below: `SMTP_USER` and `SMTP_PASS`
(email), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Google sign-in),
`BRAVE_API_KEY` (web search), `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`
(Slack).

### 7. Put it online again

```bash
npm run deploy
```
Open the address. That's it. Run `npm run deploy` again any time you change
the code or `wrangler.jsonc`. (Secrets take effect right away; no deploy
needed.)

If something isn't working, this shows what the app is doing, live:
```bash
npx wrangler tail
```

### Email: the team Gmail

Sign-up codes are sent from a team Gmail account. Gmail needs an
**app password** for this (not the normal password).

1. Sign in to the team Gmail. Go to <https://myaccount.google.com/security>
   and turn on **2-Step Verification**.
2. Go to <https://myaccount.google.com/apppasswords>. Make one called
   "972 Chat Bot". Google shows a 16-letter password once — copy it.
3. Save both:
   ```bash
   npx wrangler secret put SMTP_USER
   npx wrangler secret put SMTP_PASS
   ```
   `SMTP_USER` is the Gmail address. `SMTP_PASS` is the 16-letter app password.

Until these are set, the code is printed in the log (`npx wrangler tail`)
instead of emailed. To send real emails when running on your own computer,
put the same two lines in `.env`.

### Google sign-in

1. Go to <https://console.cloud.google.com> → **APIs & Services →
   Credentials**. Make an **OAuth client ID** (type: Web application), or open
   the one you already have.
2. Under **Authorized redirect URIs**, add:
   ```
   https://chatbot-972.your-account.workers.dev/auth/google/callback
   ```
   (your app's real address, plus `/auth/google/callback`). To use Google on
   your own computer too, also add `http://localhost:5173/auth/google/callback`.
3. Save both values:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

### Web search (Brave)

Picture search works without this. Web search needs a Brave key.

1. Sign up at <https://brave.com/search/api/>, pick a plan (there is a free
   one), and create an API key.
2. Save it:
   ```bash
   npx wrangler secret put BRAVE_API_KEY
   ```

### Slack

The steps are at the top of `slack/manifest.yaml`. In short:

1. Open `slack/manifest.yaml` and put your app's address where it says
   `REPLACE-WITH-YOUR-APP`.
2. Go to <https://api.slack.com/apps> → **Create New App → From a manifest**,
   pick the team's workspace, and paste the whole file.
3. Click **Install to Workspace**. Copy the **Bot User OAuth Token** (starts
   with `xoxb-`) and the **Signing Secret**, and save them:
   ```bash
   npx wrangler secret put SLACK_BOT_TOKEN
   npx wrangler secret put SLACK_SIGNING_SECRET
   ```
4. In Slack, invite the bot to the channels it should use
   (`/invite @972 Chat Bot`), then pick them in the app on Admin → **Settings**.

---

## Quick start (for developers)

Prerequisites: **Node 22+** and **npm**.

```bash
npm install
cp .env.example .env        # fill in ANTHROPIC_API_KEY, JWT_SECRET, ADMIN_CODE
npm run db:migrate:local    # local D1 database (kept in .wrangler/)
npm run dev                 # Vite + the Worker together, on :5173
```

`npm run dev` runs the Worker inside Vite (Cloudflare's Vite plugin), with a
local D1 database and R2 bucket. Wrangler reads secrets from `.env` (or from
`.dev.vars` if that exists — see `.dev.vars.example`). Settings that aren't
secret (`APP_URL`, `SMTP_HOST`, `SMTP_PORT`) are in `wrangler.jsonc`.

To try the old data locally: run the step 4 commands with `--local` instead
of `--remote`.

Older `.env` files that still say `TEACHER_CODE` keep working.

---

## The AI agents

All three live in `server/agents/` and run on Pi.

| Agent | Who uses it | What it can do |
| --- | --- | --- |
| **Tutor** (`tutor.ts`) | Students | Answer, open reference docs, find pictures, search the web |
| **Prompt assistant** (`prompt-editor.ts`) | Admins, on the Prompt page | Read the prompt, docs, and chats; **draft** changes |
| **Reviewer** (`reviewer.ts`) | Runs daily, or from **Suggestions → Review recent chats** | Read recent chats; **draft** changes |

The assistant and reviewer can never change the live prompt themselves. They
can only write a draft (`prompt_drafts` table). Applying a draft saves a normal
new prompt version, so it shows in **History** and can be undone.

Admins pick which Claude model does each job on Admin → **Settings** (Haiku
5.5, Sonnet 5.5, or Opus 5.5). The starting choices are in
`server/lib/config.ts`:

```ts
export const TUTOR_MODEL  = "claude-sonnet-5-5"; // answers students
export const EDITOR_MODEL = "claude-opus-5-5";   // prompt assistant + reviewer
export const LEARN_MODEL  = "claude-haiku-5-5";  // picks up team facts + interests
```

Spending limits (reviews per day, facts per day, tool calls per message) are in
the same file; suggestion limits are at the top of `server/lib/suggestions.ts`.

---

## Useful npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the app on your computer (port 5173) |
| `npm run deploy` | Build and put the app online |
| `npm run build` | Type check + production build |
| `npm run lint` | Check code style |
| `npm run db:migrate:local` | Update the database on your computer |
| `npm run db:migrate:remote` | Update the real database |
| `npm run db:generate` | Make a database update file from `db/schema.ts` |
| `npm run types` | Refresh `worker-configuration.d.ts` after changing `wrangler.jsonc` |

---

## Project layout

```
src/                 Screens
  pages/             Sign-in, chat
  admin/             Admin pages: Prompt, Suggestions, Team facts, Docs, History
  components/        Chat pieces and shared buttons, dialogs, menus
  styles/theme.css   Colors (light + dark), fonts
server/
  worker.ts          Cloudflare entry point (web requests, timed jobs, queue)
  app.ts             All the routes
  agents/            Tutor, prompt assistant, reviewer, and their tools
  ai/                Pi model setup and streaming
  routes/            Sign-in, chat, and admin routes (routes/admin/*)
  slack/             The Slack bot
  lib/               Prompt versions, drafts, docs, team facts, config
db/                  Database tables
drizzle/             Database update files (npm run db:migrate:…)
scripts/             One-time move of old data into Cloudflare
slack/manifest.yaml  Settings for creating the Slack app
wrangler.jsonc       Cloudflare settings
```
