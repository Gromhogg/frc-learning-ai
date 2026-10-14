import nodemailer, { type Transporter } from "nodemailer";

// Sends the 6-digit signup codes. Settings come from .env (see .env.example).
// With no SMTP settings the code is printed to the server log instead, so
// signup still works when testing on your own computer.

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host,
      port,
      // Port 465 talks securely from the start; 587 upgrades after connecting.
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

/** Email someone their signup code. Throws if the email could not be sent. */
export async function sendCodeEmail(to: string, code: string): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[email] Code for ${to}: ${code} (email isn't set up — see .env.example)`);
    return;
  }

  // EMAIL_FROM can be a plain address or already include a name ("Name <a@b.c>").
  const address = process.env.EMAIL_FROM || process.env.SMTP_USER!;
  const from = address.includes("<") ? address : `972 Chat Bot <${address}>`;
  const text =
    `Your 972 Chat Bot code is ${code}\n\n` +
    "It expires in 10 minutes. If you didn't ask for this, ignore this email.\n";
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 15px; color: #1c1917; line-height: 1.5;">
      <p>Your 972 Chat Bot code is:</p>
      <p style="font-size: 30px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${code}</p>
      <p style="color: #57534e;">It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>
    </div>`;

  await mailer.sendMail({
    from,
    to,
    subject: `Your 972 Chat Bot code: ${code}`,
    text,
    html,
  });
}
