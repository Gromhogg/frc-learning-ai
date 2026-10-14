import { plainText } from "./image-search.ts";

// Web search for the tutor's web_search tool, through Brave Search. Only
// works when BRAVE_API_KEY is set. Only Brave's fixed search address is ever
// called — the query from the model goes in as a search term.

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const TIMEOUT_MS = 6000;
const MAX_QUERY_LENGTH = 200;

/** True when a Brave key is set, so web search can be offered to the tutor. */
export function hasWebSearch(): boolean {
  return Boolean(process.env.BRAVE_API_KEY);
}

/** Top 5 web results for a query. Never throws: problems come back as `error`. */
export async function webSearch(rawQuery: string): Promise<{ results: WebResult[]; error?: string }> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return { results: [], error: "Web search is not set up (no BRAVE_API_KEY)." };

  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return { results: [], error: "Empty search." };

  const params = new URLSearchParams({ q: query, safesearch: "strict", count: "5" });
  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { results: [], error: `Web search failed (${res.status}).` };
    const data = (await res.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    const results: WebResult[] = [];
    for (const r of data.web?.results ?? []) {
      if (!r.url || !/^https?:\/\//i.test(r.url)) continue;
      results.push({ title: plainText(r.title), url: r.url, snippet: plainText(r.description) });
      if (results.length >= 5) break;
    }
    return { results };
  } catch {
    return { results: [], error: "Web search didn't answer in time." };
  }
}
