// Only school email addresses can make a new account or use Google sign-in.
// Accounts that already exist can still sign in with a password, whatever
// their email is.
//
// The login page has its own copy of this list (src/pages/Login.tsx) so it
// can warn right away. Change both together.

export const SCHOOL_DOMAINS = ["lghsstudent.org", "lghsuhsd.org"];

export const SCHOOL_EMAIL_ERROR = "Please input your school email";

/** True when the part after the @ is exactly one of the school domains. */
export function isSchoolEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (/\s/.test(local)) return false;
  return SCHOOL_DOMAINS.includes(domain);
}

/** The domain after the @, in lower case. Only call this on a school email. */
export function emailDomain(email: string): string {
  const trimmed = email.trim().toLowerCase();
  return trimmed.slice(trimmed.lastIndexOf("@") + 1);
}
