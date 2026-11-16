import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import { takeAttempt } from "../lib/limits.ts";

// Talk to type: the mic button records a clip in the browser and sends it
// here. OpenAI's Whisper model, run by Cloudflare Workers AI, turns it into
// text. Nothing is saved; the text goes back into the message box.

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

/** A 3-minute clip is about 1–3 MB, so this leaves plenty of room. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_CLIPS = 30;
const CLIP_WINDOW_MS = 15 * 60_000;

/** Common FRC words, so Whisper spells them right. */
const HINT = "FRC robotics team 972. roboRIO, swerve, Onshape, CAD, CNC, WPILib, PathPlanner, Limelight.";

const app = new Hono();

// POST / — form field "audio": one recorded clip. Returns { text }.
app.post("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const limit = await takeAttempt(`transcribe:${auth.userId}`, MAX_CLIPS, CLIP_WINDOW_MS);
  if (!limit.allowed) return c.json({ error: "That's a lot of voice messages. Wait a few minutes, or type instead." }, 429);

  const body = await c.req.parseBody();
  const file = body["audio"];
  if (!(file instanceof File) || file.size === 0) return c.json({ error: "No recording came through. Try again." }, 400);
  if (!file.type.startsWith("audio/")) return c.json({ error: "That isn't a recording." }, 400);
  if (file.size > MAX_AUDIO_BYTES) return c.json({ error: "That recording is too long. Try a shorter one." }, 400);

  try {
    const result = await env.AI.run(WHISPER_MODEL, {
      audio: toBase64(new Uint8Array(await file.arrayBuffer())),
      language: "en",
      vad_filter: true,
      initial_prompt: HINT,
    });
    return c.json({ text: (result.text ?? "").trim() });
  } catch (err) {
    console.error("Voice to text failed:", err);
    return c.json({ error: "Couldn't turn that into text. Try again, or type instead." }, 502);
  }
});

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export default app;
