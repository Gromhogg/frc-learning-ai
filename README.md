# Robotics Chat

A chat app for FRC robotics teams. Students ask questions about the shop,
the robot, wiring, CAD, or the game — in text or by sending a photo — and an
AI mentor answers. Past chats are saved in a sidebar.

There are two kinds of people:

- **Students** — chat, and that's it.
- **Teachers** — chat, *and* can edit the instructions the AI follows.

Teachers cannot read student conversations. The only thing on the teacher
side is the prompt.

**The app learns your team.** As people chat, it quietly picks up facts about
*your* specific robot and shop — "the drivetrain uses REV NEO motors", "the
Avid is the CNC router" — and adds them to the AI's instructions. So when
someone later asks "what's wrong with the motor?", the AI knows which motor
they mean. Teachers can see and delete these on the prompt page.

Built with:
- **Frontend** — React 19 + Vite + Tailwind + react-router (`src/`)
- **Backend** — Hono + Node, served via `tsx` (`server/`)
- **Database** — SQLite via better-sqlite3 + Drizzle ORM (`db/`)
- **AI** — Anthropic Claude (via `@ai-sdk/anthropic` + Vercel AI SDK v6)
- **Auth** — JWT (jose) + bcrypt password hashes, plus Google sign-in (arctic)

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
- `TEACHER_CODE=` — make up a code. Anyone who types this becomes a
  teacher, so only give it to mentors.

You can leave the two `GOOGLE_` lines alone — the app works fine without
Google sign-in.

Save and close.

**5. Set up the database.**
```bash
npm run db:migrate
npm run db:seed
```
The first creates the file that stores accounts and chats. The second loads
the AI's starting instructions. You only do this once.

**6. Run it.**
```bash
npm run dev:all
```
Leave this Terminal window open — closing it stops the app. When you see
`Local: http://localhost:5173`, open that address in your browser.

**7. Make your account.**
Click **Create an account**. If you're a mentor, put your teacher code in
the "Teacher code" box. Students leave it blank.

To stop the app, come back to the Terminal and press
<kbd>Control</kbd> + <kbd>C</kbd>. To run it again later, just `cd
Learning-App` and `npm run dev:all` — steps 1–5 only happen once.

---

## Quick start (for developers)

Prerequisites: **Node 20+** and **npm**.

```bash
git clone https://github.com/Gromhogg/Learning-App.git
cd Learning-App
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY, JWT_SECRET, TEACHER_CODE
npm run db:migrate        # creates data/app.db
npm run db:seed           # loads the default system prompt
npm run dev:all           # frontend :5173 + API :3001
```

Optional: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to enable the
Google button, with redirect URI `http://localhost:3001/auth/google/callback`.

`data/` is gitignored — the database and uploaded photos stay on your machine.

> **Note:** if `npm run db:migrate` fails with `NODE_MODULE_VERSION`, your
> Node version changed since `npm install`. Run `npm rebuild better-sqlite3`.

---

## Roles

Two roles, and the teacher code is the only way to get the second one.

| | Student | Teacher |
| --- | --- | --- |
| Chat, send photos, keep history | ✅ | ✅ |
| Edit the AI's instructions | ❌ | ✅ |
| Review learned team facts | ❌ | ✅ |
| Read anyone else's chats | ❌ | ❌ |

Becoming a teacher:
- **At signup** — type the code into the "Teacher code" box.
- **Afterwards** — click your name in the top right → **Enter teacher code**.
  (This is how Google sign-in users do it, since there's no signup form.)

---

## How the learning loop works

After each reply, a background call looks at the exchange and pulls out any
durable, team-specific facts — hardware brands, tool names, local shorthand.
It runs *after* the student already has their answer, so it never slows the
chat down, and a failure is logged without affecting anything.

Facts are stored in the `team_facts` table with a mention count, and appended
to the system prompt under a `TEAM CONTEXT` heading on every request. They
apply immediately and teachers prune them on the prompt page. The list is
capped at 60 (`MAX_TEAM_FACTS` in `server/lib/config.ts`) so it can't grow
until it crowds out the actual instructions.

The extractor is told to return nothing most of the time — it's meant to
catch the occasional real fact, not to narrate every conversation.

---

## Choosing a model

Both models live in `server/lib/config.ts`:

```ts
export const CHAT_MODEL  = "claude-opus-5";   // answers students
export const LEARN_MODEL = "claude-opus-5";   // background fact extraction
```

| Model | Input / output per million tokens |
| --- | --- |
| `claude-opus-5` | $5 / $25 |
| `claude-sonnet-5` | $3 / $15 |
| `claude-haiku-4-5` | $1 / $5 |

For a big team, switching `LEARN_MODEL` to `claude-haiku-4-5` cuts cost with
no real downside — it's a small extraction task.

---

## Useful npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Frontend only (Vite on 5173) |
| `npm run server` | Backend only (Hono/tsx on 3001) |
| `npm run dev:all` | Both, concurrently — the usual command |
| `npm run build` | Type-check + production build |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate a migration from `db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `data/app.db` |
| `npm run db:seed` | Load the default system prompt |

---

## Project layout

```
src/                   React frontend
  pages/               Login, Chat (the app), Prompt (teachers), AuthCallback
  components/          Sidebar, message thread, composer, teacher-code dialog
  context/             Auth provider and hook
  lib/                 API helper, client-side image resizing
server/                Hono API
  routes/              auth, chat, conversations, prompt, uploads
  lib/                 config, prompt builder, learning loop, uploads, jwt
db/                    Drizzle schema, migration runner, seed script
drizzle/               Generated migrations
data/                  SQLite DB + uploaded photos (gitignored)
```

---

## Editing what the AI knows

Sign in as a teacher and click **Prompt**. Everything the AI is told lives in
that one text box, including the shop reference section (mill, lathe, CNC,
waterjet, CAM, CAD, assembly, wiring, FRC basics). Edit it however you like —
changes apply to the next message. Below it, **Team knowledge** lists what the
app has learned on its own.
