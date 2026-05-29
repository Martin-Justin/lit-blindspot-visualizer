// Client-side BibTeX parser + fuzzy matcher for the OpenAlex network.

export type BibPaper = {
  key: string;       // BibTeX cite key
  title: string;
  author: string;
  year: number;
  doi: string;       // normalized: lowercase, no URL prefix, trimmed
};

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "with", "and", "or", "to",
  "from", "by", "as", "at", "is", "are", "be", "this", "that",
]);

/** Strip BibTeX braces, LaTeX commands, and basic accent macros from a field value. */
function cleanField(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  // Strip outer wrappers: { ... } or " ... "
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  // Replace common LaTeX accent macros: \'e -> e, \"o -> o, \~n -> n, etc.
  s = s.replace(/\\[`'"^~=.]\{?([a-zA-Z])\}?/g, "$1");
  // Replace \&, \%, \$ etc.
  s = s.replace(/\\([&%$_#{}])/g, "$1");
  // Strip remaining braces.
  s = s.replace(/[{}]/g, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeDoi(raw: string): string {
  return cleanField(raw)
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .trim();
}

/**
 * Parse a raw .bib file into a list of {@link BibPaper}.
 * Handles brace- and quote-delimited fields, nested braces, and `and`-joined authors.
 */
export function parseBibtex(text: string): BibPaper[] {
  const entries: BibPaper[] = [];
  // Match top-level entries: @type{key, ...fields... }
  // We can't trust a single regex for nested braces, so scan manually.
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    const braceStart = text.indexOf("{", at);
    if (braceStart < 0) break;
    // Skip @comment / @preamble / @string
    const type = text.slice(at + 1, braceStart).trim().toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") {
      i = braceStart + 1;
      continue;
    }
    // Find matching closing brace.
    let depth = 1;
    let j = braceStart + 1;
    while (j < text.length && depth > 0) {
      const ch = text[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    const body = text.slice(braceStart + 1, j - 1);
    i = j;

    // First token is the cite key (until first comma).
    const commaIdx = body.indexOf(",");
    if (commaIdx < 0) continue;
    const key = body.slice(0, commaIdx).trim();
    const fieldsBlock = body.slice(commaIdx + 1);

    const fields = parseFields(fieldsBlock);
    const yearStr = fields.year ?? fields.date ?? "";
    const yearMatch = yearStr.match(/\d{4}/);

    entries.push({
      key,
      title: cleanField(fields.title ?? ""),
      author: cleanField(fields.author ?? fields.editor ?? ""),
      year: yearMatch ? parseInt(yearMatch[0], 10) : 0,
      doi: normalizeDoi(fields.doi ?? ""),
    });
  }
  return entries.filter((e) => e.title || e.doi);
}

/** Parse a BibTeX field block into a name→value map. */
function parseFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < block.length) {
    // Skip whitespace + commas.
    while (i < block.length && /[\s,]/.test(block[i])) i++;
    if (i >= block.length) break;
    // Field name.
    const nameStart = i;
    while (i < block.length && /[A-Za-z0-9_-]/.test(block[i])) i++;
    const name = block.slice(nameStart, i).toLowerCase();
    if (!name) { i++; continue; }
    while (i < block.length && /\s/.test(block[i])) i++;
    if (block[i] !== "=") { continue; }
    i++; // skip '='
    while (i < block.length && /\s/.test(block[i])) i++;
    // Value: braces, quotes, or bare token.
    let value = "";
    if (block[i] === "{") {
      let depth = 1;
      i++;
      const start = i;
      while (i < block.length && depth > 0) {
        if (block[i] === "{") depth++;
        else if (block[i] === "}") depth--;
        if (depth > 0) i++;
      }
      value = block.slice(start, i);
      i++; // skip closing '}'
    } else if (block[i] === '"') {
      i++;
      const start = i;
      while (i < block.length && block[i] !== '"') i++;
      value = block.slice(start, i);
      i++;
    } else {
      const start = i;
      while (i < block.length && !/[,\n]/.test(block[i])) i++;
      value = block.slice(start, i).trim();
    }
    out[name] = value;
  }
  return out;
}

// --------------------------------------------------------------------------
// Fuzzy matcher
// --------------------------------------------------------------------------

/** Normalize a title to a deduped, stop-word-free token list. */
function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Jaccard token coefficient — symmetric, range 0..1. */
function jaccardScore(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type MatchablePaper = { id: string; title: string; doi?: string };

/** Returns true when bibPaper plausibly equals openAlexPaper. */
export function findMatch(bib: BibPaper, oa: MatchablePaper): boolean {
  // 1. DOI exact match (case-insensitive, normalized).
  if (bib.doi && oa.doi) {
    const oaDoi = normalizeDoi(oa.doi);
    if (oaDoi && oaDoi === bib.doi) return true;
  }
  // 2. Title similarity ≥ 0.85.
  if (bib.title && oa.title) {
    return jaccardScore(bib.title, oa.title) >= 0.85;
  }
  return false;
}

/**
 * Resolve every bib entry against the OpenAlex node set.
 * Returns matched OpenAlex node IDs + the bib entries with no match.
 */
export function matchBibToGraph(
  bib: BibPaper[],
  nodes: MatchablePaper[],
): { matchedIds: Set<string>; unmatched: BibPaper[] } {
  const matchedIds = new Set<string>();
  const unmatched: BibPaper[] = [];

  // Index by DOI for O(1) DOI lookups.
  const byDoi = new Map<string, string>();
  for (const n of nodes) {
    const d = n.doi ? normalizeDoi(n.doi) : "";
    if (d) byDoi.set(d, n.id);
  }

  for (const b of bib) {
    let hit: string | null = null;
    if (b.doi) {
      const id = byDoi.get(b.doi);
      if (id) hit = id;
    }
    if (!hit) {
      // Fall back to fuzzy title scan.
      for (const n of nodes) {
        if (findMatch(b, n)) { hit = n.id; break; }
      }
    }
    if (hit) matchedIds.add(hit);
    else unmatched.push(b);
  }

  return { matchedIds, unmatched };
}
