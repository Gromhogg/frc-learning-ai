// Which Claude model to use. Change these two lines to switch models.
//
//   claude-opus-5      $5 / $25 per million tokens  (strongest)
//   claude-sonnet-5    $3 / $15 per million tokens
//   claude-haiku-4-5   $1 / $5  per million tokens  (cheapest, still good)
//
// CHAT_MODEL answers students. LEARN_MODEL runs quietly in the background
// pulling team facts out of finished conversations.
export const CHAT_MODEL = "claude-opus-5";
export const LEARN_MODEL = "claude-opus-5";

// Where the app runs in development.
export const FRONTEND_URL = "http://localhost:5173";
export const SERVER_PORT = 3001;

// Uploaded photos live here, and are served at /uploads/<filename>.
export const UPLOAD_DIR = "data/uploads";

// Cap on how many learned facts we keep. Without a cap the list grows
// forever and eventually crowds out the teacher's actual prompt.
export const MAX_TEAM_FACTS = 60;
