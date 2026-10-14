import type { StepImage } from "../ai/run-agent.ts";

// Picture search for the tutor's find_images tool. Two sources:
//   1. Wikimedia Commons — free, no key, good for parts, tools and machines.
//   2. Brave Image Search — only when Commons finds fewer than 2 good
//      pictures AND a BRAVE_API_KEY is set.
// Only these two fixed addresses are ever called. The query from the model
// goes in as a search term, never as a link to fetch.
// Errors never reach the tool: a failed search just returns fewer pictures.

const MAX_IMAGES = 4;
const MIN_GOOD_FROM_COMMONS = 2;
const TIMEOUT_MS = 6000;
const MAX_QUERY_LENGTH = 100;
// Wikimedia asks every caller to say who they are, with a way to reach them
// (a web address or email). Callers without one get a much lower request
// limit — and on Cloudflare that limit would be shared with other sites.
// We give the app's own address; WIKIMEDIA_CONTACT can replace it with a team
// website or email.
function userAgent(): string {
  const contact = process.env.WIKIMEDIA_CONTACT || process.env.APP_URL || "972 Chat Bot";
  return `972ChatBot/1.0 (FRC team 972 tutor app; ${contact})`;
}

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

// Students are high schoolers, so drop anything whose title, description or
// categories mention adult or violent content. Whole words only, so "Sussex"
// doesn't trip "sex".
const BLOCKED_WORDS = [
  "nude", "nudes", "nudity", "naked", "nsfw", "porn", "porno", "pornography", "pornographic",
  "sex", "sexy", "sexual", "erotic", "erotica", "fetish", "genital", "genitals", "penis",
  "vagina", "vulva", "topless", "lingerie", "masturbation", "hentai", "xxx",
  "corpse", "corpses", "cadaver", "gore", "gory", "beheading", "beheaded", "decapitated",
  "massacre", "lynching", "torture", "suicide", "murder", "murdered", "mutilated",
];
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_WORDS.join("|")})\\b`, "i");

// Words that say what kind of picture, not what's in it. Ignored when
// checking that a Commons result matches the query.
const IGNORED_WORDS = new Set([
  "a", "an", "the", "of", "on", "in", "for", "and", "with", "to",
  "diagram", "photo", "photos", "picture", "pictures", "image", "images", "drawing", "example",
]);

/** Find up to 4 pictures for a short search like "lathe chuck". Never throws. */
export async function findImages(rawQuery: string): Promise<StepImage[]> {
  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return [];

  const images = await searchCommons(query);
  const key = process.env.BRAVE_API_KEY;
  if (images.length < MIN_GOOD_FROM_COMMONS && key) {
    for (const image of await searchBrave(query, key)) {
      if (images.length >= MAX_IMAGES) break;
      if (!images.some((i) => i.url === image.url)) images.push(image);
    }
  }
  return images.slice(0, MAX_IMAGES);
}

// ─── Wikimedia Commons ──────────────────────────────────────────────────────

interface CommonsPage {
  index?: number;
  title?: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: unknown } | undefined>;
  }[];
}

async function searchCommons(query: string): Promise<StepImage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrnamespace: "6", // the "File:" pages
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    // 500 px is one of Wikimedia's standard thumbnail sizes: sharp enough for
    // the grid, and other sizes get rounded up to a bigger file anyway.
    iiurlwidth: "500",
    iiextmetadatafilter: "Artist|LicenseShortName|ImageDescription|Categories",
    iiextmetadatalanguage: "en",
    origin: "*",
  });

  let pages: CommonsPage[];
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`Wikimedia picture search failed (${res.status})`);
      return [];
    }
    const data = (await res.json()) as { query?: { pages?: CommonsPage[] } };
    pages = data.query?.pages ?? [];
  } catch {
    return [];
  }

  const words = queryWords(query);
  const out: StepImage[] = [];
  // The API returns pages in any order; `index` is the search ranking.
  for (const page of [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const info = page.imageinfo?.[0];
    if (!info || !page.title) continue;
    if (!info.mime || !IMAGE_MIME.has(info.mime)) continue;
    // Skip icons and tiny pictures.
    if ((info.width ?? 0) < 200 || (info.height ?? 0) < 150) continue;
    if (!isHost(info.thumburl, "wikimedia.org") || !isHost(info.descriptionurl, "wikimedia.org")) continue;

    const meta = info.extmetadata ?? {};
    const description = plainText(meta.ImageDescription?.value);
    const categories = plainText(meta.Categories?.value).replace(/\|/g, ", ");
    const title = cleanFileTitle(page.title);
    if (BLOCKED_RE.test(`${page.title} ${title} ${description} ${categories}`)) continue;
    // Commons search also matches words deep inside long photo stories,
    // which brings in a lot of unrelated pictures. So keep a picture only
    // when its name, categories and the start of its description hold most
    // of the search words, with at least one in the name or categories.
    const nameAndCategories = `${page.title} ${categories}`;
    if (!matchesQuery(nameAndCategories, words, 1)) continue;
    if (!matchesQuery(`${nameAndCategories} ${description.slice(0, 120)}`, words)) continue;

    // Some artist fields repeat the name ("Unknown author Unknown author").
    const artist = shorten(plainText(meta.Artist?.value).replace(/^(.+) \1$/, "$1"), 40);
    const license = plainText(meta.LicenseShortName?.value);
    out.push({
      url: info.thumburl!,
      pageUrl: info.descriptionurl!,
      // A file name like "Pp01" says nothing; the description reads better.
      title: title.length < 6 && description ? shorten(description, 80) : title,
      credit: [artist, license, "Wikimedia Commons"].filter(Boolean).join(" · "),
    });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

/** "File:Lathe_Chuck (12345678).jpg" → "Lathe Chuck" */
function cleanFileTitle(raw: string): string {
  return raw
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_/g, " ")
    .replace(/\s*\(\d{6,}\)$/, "") // Flickr photo numbers
    .trim();
}

/** The words that must show up in a result, e.g. "swerve drive diagram" → ["swerve", "drive"]. */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !IGNORED_WORDS.has(w))
    // "chucks" should still match "chuck".
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * True when the text holds at least `needed` of the words. By default that's
 * two thirds of them (all of them for 1–2 words).
 */
function matchesQuery(text: string, words: string[], needed = Math.ceil((words.length * 2) / 3)): boolean {
  if (words.length === 0) return true;
  const haystack = text.toLowerCase().replace(/[_-]/g, " ");
  const squashed = haystack.replace(/\s+/g, ""); // "Powerpole" matches "power pole"
  const found = words.filter((w) => haystack.includes(w) || squashed.includes(w)).length;
  return found >= needed;
}

// ─── Brave Image Search ────────────────────────────────────────────────────

interface BraveImageResult {
  title?: string;
  url?: string;
  source?: string;
  thumbnail?: { src?: string };
  meta_url?: { hostname?: string };
}

async function searchBrave(query: string, key: string): Promise<StepImage[]> {
  const params = new URLSearchParams({ q: query, safesearch: "strict", count: "8" });
  let results: BraveImageResult[];
  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/images/search?${params}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`Brave picture search failed (${res.status})`);
      return [];
    }
    const data = (await res.json()) as { results?: BraveImageResult[] };
    results = data.results ?? [];
  } catch {
    return [];
  }

  const out: StepImage[] = [];
  for (const r of results) {
    // The picture must come through Brave's own picture server, and the
    // link must be a normal web page (no "javascript:" tricks).
    if (!isHost(r.thumbnail?.src, "search.brave.com") || !isWebLink(r.url)) continue;
    const site = (r.source || r.meta_url?.hostname || new URL(r.url!).hostname).replace(/^www\./, "");
    const title = shorten(plainText(r.title) || site, 120);
    if (BLOCKED_RE.test(`${title} ${site} ${r.url}`)) continue;
    out.push({ url: r.thumbnail!.src!, pageUrl: r.url!, title, credit: `${site} via Brave` });
  }
  return out;
}

// ─── helpers ───────────────────────────────────────────────────────────────

/** An https link on this site or one of its subdomains. */
function isHost(link: string | undefined, site: string): boolean {
  if (!link) return false;
  try {
    const u = new URL(link);
    return u.protocol === "https:" && (u.hostname === site || u.hostname.endsWith(`.${site}`));
  } catch {
    return false;
  }
}

function isWebLink(link: string | undefined): boolean {
  if (!link) return false;
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** HTML from Commons (or Brave's bold tags) → plain one-line text. */
export function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
