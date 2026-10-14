import type { StepImage } from "../ai/run-agent.ts";

// Text conversions between the app and Slack.
//
// The tutor writes normal Markdown. Slack uses its own "mrkdwn": *bold*,
// _italic_, ~strike~, <url|text> links, no headings, no tables. Slack also
// needs &, < and > written as &amp; &lt; &gt;.

// Stand-ins used while converting, so one rule can't undo another.
const HOLD_OPEN = "";
const HOLD_CLOSE = "";
const BOLD = "";

/** Write &, < and > the way Slack needs them. */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A link target Slack can read: no spaces, pipes or angle brackets. */
function cleanUrl(url: string): string {
  return url.trim().replace(/&/g, "&amp;").replace(/\|/g, "%7C").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\s/g, "%20");
}

/** Drop Markdown marks from a short piece of text (link labels, table cells). */
function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*(?![\w*])/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

/** Convert the Markdown marks inside one line (not code). */
function convertInline(text: string): string {
  // Code spans are copied as they are (only escaped).
  return text
    .split(/(`[^`\n]+`)/g)
    .map((part) => (part.startsWith("`") && part.endsWith("`") && part.length > 1 ? escapeSlack(part) : convertPlain(part)))
    .join("");
}

function convertPlain(text: string): string {
  const held: string[] = [];
  const hold = (value: string) => `${HOLD_OPEN}${held.push(value) - 1}${HOLD_CLOSE}`;

  let s = text
    // ![alt](url) and [text](url) → <url|text>
    .replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_m, alt: string, url: string) =>
      hold(`<${cleanUrl(url)}|${escapeSlack(plainInline(alt).trim() || "picture")}>`),
    )
    .replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_m, label: string, url: string) =>
      hold(`<${cleanUrl(url)}|${escapeSlack(plainInline(label).trim() || url)}>`),
    )
    // <https://...> autolinks, and bare links (kept safe from the italics rule)
    .replace(/<(https?:\/\/[^>\s]+)>/g, (_m, url: string) => hold(`<${cleanUrl(url)}>`))
    .replace(/https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"]/g, (url) => hold(escapeSlack(url)));

  s = escapeSlack(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, `${BOLD}$1${BOLD}`)
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, `${BOLD}$1${BOLD}`)
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1_$2_")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "~$1~")
    .replaceAll(BOLD, "*");

  return s.replace(new RegExp(`${HOLD_OPEN}(\\d+)${HOLD_CLOSE}`, "g"), (_m, i: string) => held[Number(i)]);
}

function convertLine(line: string): string {
  // Headings → a bold line
  const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
  if (heading) {
    const inner = convertInline(heading[1].replace(/\*\*|__/g, "")).trim();
    return inner ? `*${inner}*` : "";
  }
  // Horizontal rule
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return "───";
  // Quotes keep Slack's own ">" (not escaped)
  const quote = line.match(/^\s{0,3}>\s?(.*)$/);
  if (quote) return `> ${convertLine(quote[1])}`;
  // Bullet lists → • (task boxes → ☐ / ☑)
  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (bullet) {
    const rest = bullet[2]
      .replace(/^\[ \]\s+/, "☐ ")
      .replace(/^\[[xX]\]\s+/, "☑ ");
    return `${bullet[1]}• ${convertInline(rest)}`;
  }
  // Numbered lists stay numbered
  const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
  if (numbered) return `${numbered[1]}${numbered[2]}. ${convertInline(numbered[3])}`;
  return convertInline(line);
}

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => plainInline(cell.replace(/\\\|/g, "|").trim()));
}

/** A Markdown table → a lined-up code block (Slack has no tables). */
function tableToCode(rows: string[]): string {
  const cells = rows.filter((r) => !TABLE_DIVIDER.test(r)).map(splitRow);
  const columns = Math.max(...cells.map((r) => r.length));
  const widths = Array.from({ length: columns }, (_, c) => Math.max(...cells.map((r) => (r[c] ?? "").length)));
  const line = (r: string[]) =>
    widths.map((w, c) => (r[c] ?? "").padEnd(w)).join("  ").trimEnd();
  const out = [line(cells[0]), widths.map((w) => "-".repeat(w)).join("  "), ...cells.slice(1).map(line)];
  return "```\n" + escapeSlack(out.join("\n")) + "\n```";
}

/** Turn the tutor's Markdown answer into Slack mrkdwn. */
export function markdownToMrkdwn(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code blocks: keep as they are (Slack can't use the language name).
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // the closing fence
      out.push("```\n" + escapeSlack(body.join("\n")) + "\n```");
      continue;
    }

    // Tables: a row with pipes followed by a |---|---| divider.
    if (line.includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(lines[i++]);
      out.push(tableToCode(rows));
      continue;
    }

    out.push(convertLine(line));
    i++;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Split long mrkdwn into pieces Slack accepts in one "section" block
 * (3000 characters max), without breaking a code block.
 */
export function splitForSections(text: string, max = 2900): string[] {
  const chunks: string[] = [];
  let current = "";
  let inCode = false;

  const flush = () => {
    if (!current.trim()) return;
    chunks.push(inCode ? `${current}\n\`\`\`` : current);
    current = inCode ? "```" : "";
  };

  for (const rawLine of text.split("\n")) {
    // A single giant line is cut into pieces.
    const pieces = rawLine.length > max - 10 ? rawLine.match(new RegExp(`[\\s\\S]{1,${max - 10}}`, "g"))! : [rawLine];
    for (const line of pieces) {
      if (current && current.length + 1 + line.length > max - 4) flush();
      current = current ? `${current}\n${line}` : line;
      if (line.trim().startsWith("```")) {
        // A line that is just ``` opens or closes a block; ```text``` on one line does neither.
        const count = (line.match(/```/g) ?? []).length;
        if (count % 2 === 1) inCode = !inCode;
      }
    }
  }
  if (current.trim() && current !== "```") chunks.push(current);
  return chunks;
}

/** Slack's limit on message text is 40,000 characters; stay well under. */
export function clampText(text: string, max = 39_000): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Blocks for an answer that found pictures: the text, up to 4 pictures, and
 * a small line crediting where each picture came from.
 */
export function answerBlocks(mrkdwn: string, images: StepImage[], withImages = true): unknown[] {
  const blocks: unknown[] = splitForSections(mrkdwn || " ")
    .slice(0, 40)
    .map((text) => ({ type: "section", text: { type: "mrkdwn", text } }));
  const shown = images.slice(0, 4);
  if (withImages) {
    for (const img of shown) {
      blocks.push({
        type: "image",
        image_url: img.url,
        alt_text: (img.title || "Picture").slice(0, 1900),
      });
    }
  }
  if (shown.length > 0) {
    blocks.push({
      type: "context",
      elements: shown.map((img) => {
        const title = escapeSlack((img.title || "Picture").slice(0, 150));
        const link = img.pageUrl ? `<${cleanUrl(img.pageUrl)}|${title}>` : title;
        const credit = img.credit ? ` · ${escapeSlack(img.credit.slice(0, 200))}` : "";
        return { type: "mrkdwn", text: `${link}${credit}` };
      }),
    });
  }
  return blocks;
}

/**
 * Turn Slack's message text into plain text for the AI or the learner:
 * mentions become "@someone" (no names), links become their text, and
 * &amp; &lt; &gt; go back to & < >. The bot's own @mention is removed.
 */
export function slackToPlain(text: string, botUserId?: string | null): string {
  let s = text;
  if (botUserId) s = s.replace(new RegExp(`<@${botUserId}(\\|[^>]*)?>`, "g"), " ");
  s = s
    .replace(/<@[^|>]+(\|[^>]*)?>/g, "@someone")
    .replace(/<#C[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<#C[A-Z0-9]+\|?>/g, "#channel")
    .replace(/<!(here|channel|everyone)(\|[^>]*)?>/g, "@$1")
    .replace(/<!subteam\^[A-Z0-9]+(\|[^>]*)?>/g, "@group")
    .replace(/<!date\^[^|>]*\|([^>]*)>/g, "$1")
    .replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, (_m, url: string, label: string) => (label === url ? url : `${label} (${url})`))
    .replace(/<([^|>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();
}
