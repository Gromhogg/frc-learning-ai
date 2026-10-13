/** Parse the server's timestamps. SQLite's are UTC without a "Z". */
export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "just now", "5 min ago", "3 hr ago", "Mar 4". */
export function timeAgo(value: string | null | undefined): string {
  const date = parseTime(value);
  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Sidebar group for a chat: Today, Yesterday, Previous 7 days, Older. */
export function dayGroup(value: string | null | undefined): string {
  const date = parseTime(value);
  if (!date) return "Older";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diffDays = (startOfToday.getTime() - date.getTime()) / 86_400_000;
  if (diffDays <= 0) return "Today";
  if (diffDays <= 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  return "Older";
}
