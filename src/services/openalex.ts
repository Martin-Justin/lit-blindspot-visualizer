// OpenAlex citation network service.

const BASE_URL = "https://api.openalex.org/works";

export type OAGraphNode = {
  id: string;
  title: string;
  authors: string;
  year: number;
  citations: number;
  doi: string;
  url: string;
  group: string;
};

export type OAGraphEdge = { from: string; to: string };

export type OAGraph = {
  nodes: OAGraphNode[];
  edges: OAGraphEdge[];
};

export type ProgressFn = (stage: string, detail?: string) => void;

const stripPrefix = (id: string) => id.replace("https://openalex.org/", "");


async function politeFetch(url: string, apiKey?: string): Promise<Response> {
  const urlWithKey = apiKey ? `${url}${url.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(apiKey)}` : url;
  const res = await fetch(urlWithKey);
  if (!res.ok) {
    throw new Error(`OpenAlex request failed (${res.status} ${res.statusText})`);
  }
  return res;
}

type OAWork = {
  id: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string | null;
  referenced_works?: string[];
  authorships?: Array<{ author?: { display_name?: string } }>;
};

function toNode(w: OAWork, group: string): OAGraphNode {
  const id = stripPrefix(w.id);
  const authors =
    (w.authorships ?? [])
      .slice(0, 3)
      .map((a) => a.author?.display_name)
      .filter(Boolean)
      .join(", ") || "Unknown";
  const more = (w.authorships?.length ?? 0) > 3 ? " et al." : "";
  return {
    id,
    title: w.title ?? w.display_name ?? "(untitled)",
    authors: authors + more,
    year: w.publication_year ?? 0,
    citations: w.cited_by_count ?? 0,
    doi: (w.doi ?? "").replace(/^https?:\/\/doi\.org\//, ""),
    url: w.id,
    group,
  };
}

export async function fetchCitationNetwork(
  query: string,
  maxPapers: number,
  startYear?: number,
  endYear?: number,
  apiKey?: string,
  onProgress?: ProgressFn,
  fieldId?: string, // OpenAlex field id (e.g. "17" for Computer Science), filters by primary_topic.field
): Promise<OAGraph> {
  if (!query.trim()) throw new Error("Please enter a search query.");

  const cap = Math.max(10, Math.min(200, maxPapers));
  const perPage = cap;

  // ---------- Stage 1: Seeds ----------
  onProgress?.("Searching OpenAlex…", `Top ${perPage} works for "${query}"`);

  const filters: string[] = [];
  if (startYear) filters.push(`from_publication_date:${startYear}-01-01`);
  if (endYear) filters.push(`to_publication_date:${endYear}-12-31`);
  if (fieldId) filters.push(`primary_topic.field.id:fields/${fieldId}`);
  const filterParam = filters.length ? `&filter=${filters.join(",")}` : "";

  const seedUrl =
    `${BASE_URL}?search=${encodeURIComponent(query)}` +
    `&per-page=${perPage}&sort=cited_by_count:desc${filterParam}` +
    `&select=id,title,display_name,publication_year,cited_by_count,doi,referenced_works,authorships`;

  const seedRes = await politeFetch(seedUrl, apiKey);
  const seedData = (await seedRes.json()) as { results?: OAWork[] };
  const seeds = seedData.results ?? [];

  if (seeds.length === 0) {
    throw new Error(`No papers found for "${query}". Try a broader query or wider year range.`);
  }

  const nodeMap = new Map<string, OAGraphNode>();
  for (const w of seeds) {
    const n = toNode(w, "seed");
    if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
  }

  // ---------- Stage 2: Most-referenced works (hubs) ----------
  onProgress?.("Fetching citation links…", "Resolving most-referenced works");

  const refCount = new Map<string, number>();
  for (const w of seeds) {
    for (const r of w.referenced_works ?? []) {
      const rid = stripPrefix(r);
      refCount.set(rid, (refCount.get(rid) ?? 0) + 1);
    }
  }

  // Reserve remaining budget so total nodes never exceeds `cap`.
  const remaining = Math.max(0, cap - nodeMap.size);
  const topRefs = [...refCount.entries()]
    .filter(([id]) => !nodeMap.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, remaining)
    .map(([id]) => id);

  // OpenAlex `filter=openalex:W1|W2|...` — batch in chunks of 50.
  const CHUNK = 50;
  for (let i = 0; i < topRefs.length; i += CHUNK) {
    if (nodeMap.size >= cap) break;
    const chunk = topRefs.slice(i, i + CHUNK);
    onProgress?.(
      "Fetching citation links…",
      `Batch ${Math.floor(i / CHUNK) + 1} / ${Math.ceil(topRefs.length / CHUNK)}`,
    );
    const url =
      `${BASE_URL}?filter=openalex_id:${chunk.join("|")}` +
      `&per-page=${chunk.length}` +
      `&select=id,title,display_name,publication_year,cited_by_count,doi,referenced_works,authorships`;
    try {
      const r = await politeFetch(url, apiKey);
      const d = (await r.json()) as { results?: OAWork[] };
      for (const w of d.results ?? []) {
        if (nodeMap.size >= cap) break;
        const n = toNode(w, "referenced");
        if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
      }
    } catch {
      // skip the batch, keep building the graph
    }
  }

  // ---------- Build edges (only between known nodes) ----------
  onProgress?.("Building graph…", `${nodeMap.size} nodes`);
  const edges: OAGraphEdge[] = [];
  const seen = new Set<string>();
  for (const w of seeds) {
    const fromId = stripPrefix(w.id);
    for (const r of w.referenced_works ?? []) {
      const toId = stripPrefix(r);
      if (!nodeMap.has(toId)) continue;
      const key = `${fromId}->${toId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: fromId, to: toId });
    }
  }

  return { nodes: [...nodeMap.values()], edges };
}
