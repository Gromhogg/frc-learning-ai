# 972 Chat Bot

A chat app for FRC team 972. Students ask about the shop, the robot, wiring,
CAD, or code — by typing, talking, or sending a photo — and an AI mentor
answers. The starter questions on the empty chat screen are picked for each
person, based on what they've been asking about. (Each person can see and
clear this from their name menu → **Your interests**. Nobody else sees it.)

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
`@lghsuhsd.org`) and a 6-digit code that gets emailed to them. Google sign-in
asks for the school email first, so it can't fall back to a personal Gmail.

**Admins.** Everyone sees an **Admin** button. Typing the admin password once
makes you an admin for good. The password is `ADMIN_CODE` in `.env`. Admins can
see who else is an admin (Admin → **Admins**); nobody can remove admin access
in the app. The server checks this on every admin request, not just in the
screen, and allows 5 wrong tries per 15 minutes.

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
- **Server** — Hono on Node (`server/`)
- **AI** — Claude, run through the [Pi](https://pi.dev) agent kit
  (`@mariozechner/pi-ai` and `@mariozechner/pi-agent-core`)
- **Database** — SQLite with Drizzle (`db/`)
- **Sign-in** — name + password, or Google

---

## 👋 Never set up a coding project before? Start here.

You don't need to understand any of the jargon above to run this. Follow
these steps. (The **Quick start** further down is the same thing, shorter.)

### What you'll need

1. **A computer** running macOS, Windows, or Linux.
2. **Node.js** — the program that runs the app. Get the "LTS" version from
   <https://nodejs.org> and install it like any normal app.
3. **A Terminal** — the text window where you type commands.
   - **Mac:** press <kbd>⌘ Space</kbd>, type "Terminal", press Enter.
   - **Windows:** press Start, type "Terminal" or "PowerShell", press Enter.
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
Now open the new `.env` file and fill it in.
- On **Mac**: `open -e .env`
- On **Windows**: `notepad .env`

Three lines matter:
- `ANTHROPIC_API_KEY=` — paste your `sk-ant-…` key here.
- `JWT_SECRET=` — type a long random string of letters and numbers. It
  doesn't matter what, as long as it's long and you keep it private.
- `ADMIN_CODE=` — the admin password. Anyone who types this becomes an
  admin, so only give it to mentors.

To send sign-up codes by email, fill in the `SMTP_` lines (`.env.example`
explains how to use a team Gmail account with an "app password"). Until then,
codes are printed in the Terminal window instead of emailed.

You can leave the two `GOOGLE_` lines alone — the app works fine without
Google sign-in.

Save and close.

**5. Load the starting instructions.**
```bash
npm run db:seed
```
This creates the database and loads the AI's starting instructions. You only
do this once. (The server also updates the database by itself each time it
starts.)

**6. Run it.**
```bash
npm run dev:all
```
Leave this Terminal window open — closing it stops the app. When you see
`Local: http://localhost:5173`, open that address in your browser.

**7. Make your account.**
Click **Create an account** and use your school email. Mentors then click
**Admin** (top right) and type the admin password once.

To stop the app, come back to the Terminal and press
<kbd>Control</kbd> + <kbd>C</kbd>. To run it again later, just `cd
Learning-App` and `npm run dev:all` — steps 1–5 only happen once.

---

## Quick start (for developers)

Prerequisites: **Node 22+** and **npm**.

```bash
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY, JWT_SECRET, ADMIN_CODE
npm run db:seed           # creates data/app.db and loads the starting prompt
npm run dev:all           # screens on :5173, server on :3001
```

Optional: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the Google
button (redirect URI `http://localhost:3001/auth/google/callback`).

`data/` is not saved in git — the database, photos, and docs stay on your
machine. Older `.env` files that still say `TEACHER_CODE` keep working.

---

## The AI agents

All three live in `server/agents/` and run on Pi.

| Agent | Who uses it | What it can do |
| --- | --- | --- |
| **Tutor** (`tutor.ts`) | Students | Answer, and open reference docs |
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
| `npm run dev:all` | Screens + server together — the usual command |
| `npm run dev` | Screens only (port 5173) |
| `npm run server` | Server only (port 3001) |
| `npm run build` | Type check + production build |
| `npm run lint` | Check code style |
| `npm run db:generate` | Make a database update file from `db/schema.ts` |
| `npm run db:seed` | Load the starting prompt and docs |

---

## Project layout

```
src/                 Screens
  pages/             Sign-in, chat
  admin/             Admin pages: Prompt, Suggestions, Team facts, Docs, History
  components/        Chat pieces and shared buttons, dialogs, menus
  styles/theme.css   Colors (light + dark), fonts
server/
  agents/            Tutor, prompt assistant, reviewer, and their tools
  ai/                Pi model setup and streaming
  routes/            Sign-in, chat, and admin routes (routes/admin/*)
  lib/               Prompt versions, drafts, docs, team facts, config
db/                  Database tables
drizzle/             Database update files (run on server start)
data/                Database, photos, reference docs (not in git)
```
