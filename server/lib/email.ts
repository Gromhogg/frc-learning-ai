import { LogLevel, WorkerMailer } from "worker-mailer";

// Sends the 6-digit signup codes through the team Gmail.
//
// Settings: SMTP_HOST and SMTP_PORT are in wrangler.jsonc. SMTP_USER (the
// Gmail address) and SMTP_PASS (a Gmail "app password") are secrets — in
// `.env` on your own computer, `npx wrangler secret put` for the real app.
// Without SMTP_USER/SMTP_PASS the code is printed to the server log instead,
// so signup still works when testing on your own computer.

/** Email someone their signup code. Throws if the email could not be sent. */
export async function sendCodeEmail(to: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s/g, ""); // Google shows app passwords with spaces

  if (!user || !pass) {
    console.log(`[email] Code for ${to}: ${code} (email isn't set up yet — see README)`);
    return;
  }

  const text =
    `Your 972 Chat Bot code is ${code}\n\n` +
    "It expires in 10 minutes. If you didn't ask for this, ignore this email.\n";
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 15px; color: #1c1917; line-height: 1.5;">
      <p>Your 972 Chat Bot code is:</p>
      <p style="font-size: 30px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${code}</p>
      <p style="color: #57534e;">It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>
    </div>`;

  let mailer: WorkerMailer;
  try {
    mailer = await WorkerMailer.connect({
      host,
      port,
      // Port 465 talks securely from the start; 587 connects first, then
      // switches to a secure connection (STARTTLS).
      secure: port === 465,
      startTls: port !== 465,
      credentials: { username: user, password: pass },
      authType: ["plain", "login"],
      logLevel: LogLevel.WARN, // only log problems
      // Give up after 15 seconds instead of leaving the student waiting.
      socketTimeoutMs: 15_000,
      responseTimeoutMs: 15_000,
    });
  } catch (err) {
    throw new Error(
      `Couldn't sign in to the email server (${host}:${port}). Check SMTP_USER and SMTP_PASS — ` +
        `SMTP_PASS must be a Gmail app password, not the normal password. (${errorText(err)})`,
    );
  }

  try {
    await mailer.send({
      from: { name: "972 Chat Bot", email: user },
      to,
      subject: `Your 972 Chat Bot code: ${code}`,
      text,
      html,
    });
  } catch (err) {
    throw new Error(`The email server wouldn't send the code to ${to}. (${errorText(err)})`);
  } finally {
    // Always hang up, even after an error, so connections don't pile up.
    await mailer.close().catch(() => {});
  }
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).trim();
}
