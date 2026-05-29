import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { NetworkCanvas } from "@/components/NetworkCanvas";
import { mockNodes, mockEdges, type PaperNode, type Edge } from "@/lib/mockData";
import { fetchCitationNetwork, OPENALEX_FIELDS, type OAGraph } from "@/services/openalex";
import { parseBibtex, matchBibToGraph, type BibPaper } from "@/services/bibtex";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Literature Blind Spots — Coverage Explorer" },
      { name: "description", content: "Win98-style coverage and blind-spot visualizer for academic literature networks." },
      { property: "og:title", content: "Literature Blind Spots" },
      { property: "og:description", content: "Find your reading blind spots across a global citation network." },
    ],
  }),
  component: Index,
});

// Locale-stable integer formatter (avoids SSR/CSR hydration mismatch).
const formatNum = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Deterministic concentric layout for fetched graphs.
function layoutGraph(graph: OAGraph, ownedIds: Set<string>): { nodes: PaperNode[]; edges: Edge[] } {
  const W = 900;
  const H = 600;
  const cx = W / 2;
  const cy = H / 2;
  const sorted = [...graph.nodes].sort((a, b) => b.citations - a.citations);
  const nodes: PaperNode[] = sorted.map((n, i) => {
    // ring 0: top 8, then expanding rings of +12 each.
    let ring = 0, idxInRing = i, ringSize = 1;
    let remaining = i;
    let r = 0;
    const sizes = [1, 8, 20, 32, 48, 64];
    for (let k = 0; k < sizes.length; k++) {
      if (remaining < sizes[k]) {
        ring = k;
        ringSize = sizes[k];
        idxInRing = remaining;
        break;
      }
      remaining -= sizes[k];
      r = k + 1;
      ring = r;
    }
    if (ring >= sizes.length) {
      ring = sizes.length - 1;
      ringSize = sizes[ring];
      idxInRing = i % ringSize;
    }
    const radius = ring === 0 ? 0 : 70 + ring * 75;
    const angle = (idxInRing / Math.max(1, ringSize)) * Math.PI * 2 + ring * 0.2;
    return {
      id: n.id,
      title: n.title,
      author: n.authors,
      year: n.year,
      citations: n.citations,
      doi: n.doi,
      owned: ownedIds.has(n.id),
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
  const edges: Edge[] = graph.edges.map((e) => ({ source: e.from, target: e.to }));
  return { nodes, edges };
}

function Index() {
  const [query, setQuery] = useState("Epistemic Bias in Science");
  const [yearMin, setYearMin] = useState(1960);
  const [yearMax, setYearMax] = useState(2024);
  const [maxPapers, setMaxPapers] = useState(50);
  const [fieldId, setFieldId] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [tab, setTab] = useState<"missed" | "unmatched">("missed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [resetSignal, setResetSignal] = useState(0);
  const [physics, setPhysics] = useState(false);
  const [hoverDrop, setHoverDrop] = useState(false);
  const [bibName, setBibName] = useState<string | null>(null);
  const [bibEntries, setBibEntries] = useState<BibPaper[]>([]);
  const [unmatchedBib, setUnmatchedBib] = useState<BibPaper[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Graph state — starts from mock data, replaced by OpenAlex fetch.
  const [graphNodes, setGraphNodes] = useState<PaperNode[]>(mockNodes);
  const [graphEdges, setGraphEdges] = useState<Edge[]>(mockEdges);
  const [source, setSource] = useState<"mock" | "openalex">("mock");

  // Display filters (Phase 5).
  const [minCitations, setMinCitations] = useState(0);
  const [hideRead, setHideRead] = useState(false);
  const [showIsolated, setShowIsolated] = useState(true);

  // Fetch lifecycle
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; detail?: string }>({ stage: "" });
  const [error, setError] = useState<string | null>(null);

  // Apply / clear wait cursor on the whole document during loading.
  useEffect(() => {
    if (loading) document.body.style.cursor = "wait";
    else document.body.style.cursor = "";
    return () => { document.body.style.cursor = ""; };
  }, [loading]);

  const maxCitations = useMemo(
    () => graphNodes.reduce((m, n) => Math.max(m, n.citations), 0),
    [graphNodes],
  );

  // Apply the display filters to produce the rendered subgraph.
  const { displayNodes, displayEdges } = useMemo(() => {
    const keep = new Set<string>();
    for (const n of graphNodes) {
      if (n.citations < minCitations) continue;
      if (hideRead && n.owned) continue;
      keep.add(n.id);
    }
    const edges = graphEdges.filter((e) => keep.has(e.source) && keep.has(e.target));
    let nodes = graphNodes.filter((n) => keep.has(n.id));
    if (!showIsolated) {
      const connected = new Set<string>();
      for (const e of edges) { connected.add(e.source); connected.add(e.target); }
      nodes = nodes.filter((n) => connected.has(n.id));
    }
    return { displayNodes: nodes, displayEdges: edges };
  }, [graphNodes, graphEdges, minCitations, hideRead, showIsolated]);

  const owned = displayNodes.filter((n) => n.owned);
  const missed = useMemo(
    () => displayNodes.filter((n) => !n.owned).sort((a, b) => b.citations - a.citations),
    [displayNodes],
  );
  const topMissed = missed[0];
  const coverage = displayNodes.length ? Math.round((owned.length / displayNodes.length) * 100) : 0;

  /** Re-match a bib set against a node set and apply owned/unmatched state. */
  const syncBibToGraph = (bib: BibPaper[], nodes: PaperNode[]): PaperNode[] => {
    if (bib.length === 0) {
      setUnmatchedBib([]);
      return nodes.map((n) => ({ ...n, owned: false }));
    }
    const { matchedIds, unmatched } = matchBibToGraph(bib, nodes);
    setUnmatchedBib(unmatched);
    return nodes.map((n) => ({ ...n, owned: matchedIds.has(n.id) }));
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBibName(file.name);
    try {
      const text = await file.text();
      const parsed = parseBibtex(text);
      if (parsed.length === 0) {
        toast.error("No BibTeX entries found in that file.");
        setBibEntries([]);
        setUnmatchedBib([]);
        setGraphNodes((prev) => prev.map((n) => ({ ...n, owned: false })));
        return;
      }
      setBibEntries(parsed);
      let matched = 0;
      setGraphNodes((prev) => {
        const next = syncBibToGraph(parsed, prev);
        matched = next.filter((n) => n.owned).length;
        return next;
      });
      // Defer toast so the matched count above is final.
      queueMicrotask(() => {
        toast.success(
          `Loaded ${parsed.length} papers from bibliography. Matched ${matched} with current graph.`,
        );
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read .bib file.");
    }
  };

  const clearBib = () => {
    setBibName(null);
    setBibEntries([]);
    setUnmatchedBib([]);
    setGraphNodes((prev) => prev.map((n) => ({ ...n, owned: false })));
  };



  const handleFetch = async () => {
    setError(null);
    setLoading(true);
    setSelectedId(null);
    setProgress({ stage: "Searching OpenAlex…" });
    try {
      const graph = await fetchCitationNetwork(
        query,
        maxPapers,
        yearMin || undefined,
        yearMax || undefined,
        apiKey || undefined,
        (stage: string, detail?: string) => setProgress({ stage, detail }),
        fieldId || undefined,
      );
      const { nodes, edges } = layoutGraph(graph, new Set());
      // Re-match the loaded bibliography against the new node set.
      const matchedNodes = syncBibToGraph(bibEntries, nodes);
      setGraphNodes(matchedNodes);
      setGraphEdges(edges);
      setSource("openalex");
      setZoom(1);
      setResetSignal((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error talking to OpenAlex.");
    } finally {
      setLoading(false);
      setProgress({ stage: "" });
    }
  };

  const SquareBtn = ({ label, onClick, title }: { label: string; onClick?: () => void; title: string }) => (
    <button className="win-btn" title={title} onClick={onClick} style={{ width: 26, height: 24, padding: 0, fontFamily: "Courier New, monospace", fontWeight: 700 }}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen w-full p-2 sm:p-4" style={{ background: "#008080" }}>
      <div className="win-out mx-auto" style={{ maxWidth: 1400, padding: 2 }}>
        {/* Title bar */}
        <div className="win-titlebar">
          <div className="flex items-center gap-1.5">
            <div className="win-out" style={{ width: 16, height: 16, padding: 0, display: "grid", placeItems: "center", background: "#c0c0c0" }}>
              <span style={{ fontSize: 10, color: "#000" }}>BS</span>
            </div>
            <span>BlindSpots.exe — Literature Coverage Explorer</span>
          </div>
          <div className="flex gap-0.5">
            <button className="win-btn" style={{ width: 18, height: 16, padding: 0, fontSize: 10 }} aria-label="Minimize">_</button>
            <button className="win-btn" style={{ width: 18, height: 16, padding: 0, fontSize: 10 }} aria-label="Maximize">□</button>
            <button className="win-btn" style={{ width: 18, height: 16, padding: 0, fontSize: 10 }} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Menu bar */}
        <div className="flex bg-[#c0c0c0] border-b border-[#808080]" style={{ borderTop: "1px solid #ffffff" }}>
          {["File", "Edit", "Workspace", "Help"].map((m) => (
            <div key={m} className="win-menubtn"><u>{m[0]}</u>{m.slice(1)}</div>
          ))}
        </div>

        {/* Body */}
        <div className="bg-[#c0c0c0] p-1.5">
          <div className="grid gap-1.5 grid-cols-1 md:grid-cols-[260px_1fr]">
            {/* LEFT TOOL PANE */}
            <section className="win-out p-1.5" style={{ background: "#c0c0c0" }}>
              <div className="win-titlebar inactive" style={{ marginBottom: 6 }}>
                <span>Search Parameters</span>
              </div>

              <fieldset className="win-group mb-3" style={fieldsetStyle}>
                <legend className="px-1 text-[11px]">OpenAlex Query</legend>
                <label className="block mb-1">Topic:</label>
                <input
                  className="win-input w-full"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !loading && handleFetch()}
                  disabled={loading}
                />
                <label className="block mt-2 mb-1">Year range:</label>
                <div className="flex items-center gap-1">
                  <input type="number" className="win-input" style={{ width: 60 }} value={yearMin} onChange={(e) => setYearMin(+e.target.value)} disabled={loading} />
                  <span>—</span>
                  <input type="number" className="win-input" style={{ width: 60 }} value={yearMax} onChange={(e) => setYearMax(+e.target.value)} disabled={loading} />
                </div>
                <label className="block mt-2 mb-1">Max papers:</label>
                <select className="win-input w-full" value={maxPapers} onChange={(e) => setMaxPapers(+e.target.value)} disabled={loading}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <label className="block mt-2 mb-1">Field of research:</label>
                <select className="win-input w-full" value={fieldId} onChange={(e) => setFieldId(e.target.value)} disabled={loading}>
                  {OPENALEX_FIELDS.map((f) => (
                    <option key={f.id || "any"} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <div className="mt-2 flex gap-1 justify-end">
                  <button className="win-btn" onClick={() => { setQuery(""); }} disabled={loading}>Cancel</button>
                  <button className="win-btn" style={{ fontWeight: 700 }} onClick={handleFetch} disabled={loading}>
                    {loading ? "Fetching…" : "Fetch Graph"}
                  </button>
                </div>
              </fieldset>

              <fieldset className="win-group" style={fieldsetStyle}>
                <legend className="px-1 text-[11px]">Configure API</legend>
                <label className="block mb-1">OpenAlex API Key:</label>
                <input
                  type="password"
                  className="win-input w-full"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave empty for public calls"
                  disabled={loading}
                />
                <div className="mt-1 text-[#000080]">Optional — adds api_key to requests</div>
              </fieldset>

              <fieldset className="win-group mt-3" style={fieldsetStyle}>
                <legend className="px-1 text-[11px]">Display Filters</legend>
                <label className="block mb-1">
                  Min. citations: <b style={{ fontFamily: "Courier New, monospace" }}>{formatNum(minCitations)}</b>
                </label>
                <input
                  type="range"
                  min={0}
                  max={Math.max(10, maxCitations)}
                  step={Math.max(1, Math.round(maxCitations / 100))}
                  value={Math.min(minCitations, maxCitations)}
                  onChange={(e) => setMinCitations(+e.target.value)}
                  className="w-full"
                  style={{ accentColor: "#000080" }}
                />
                <div className="flex justify-between text-[10px] text-[#808080]">
                  <span>0</span><span>{formatNum(maxCitations)}</span>
                </div>
                <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
                  <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} />
                  <span>Hide read papers (owned)</span>
                </label>
                <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                  <input type="checkbox" checked={showIsolated} onChange={(e) => setShowIsolated(e.target.checked)} />
                  <span>Show isolated nodes</span>
                </label>
                <div className="mt-2 flex justify-end">
                  <button
                    className="win-btn"
                    onClick={() => { setMinCitations(0); setHideRead(false); setShowIsolated(true); }}
                  >Reset filters</button>
                </div>
              </fieldset>


              <fieldset className="win-group" style={fieldsetStyle}>
                <legend className="px-1 text-[11px]">Bibliography (.bib)</legend>
                <div
                  className="win-in"
                  style={{
                    minHeight: 80,
                    background: hoverDrop ? "#dfdfdf" : "#ffffff",
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,0.04) 6px 7px)",
                    display: "grid",
                    placeItems: "center",
                    padding: 8,
                    cursor: "pointer",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setHoverDrop(true); }}
                  onDragLeave={() => setHoverDrop(false)}
                  onDrop={(e) => { e.preventDefault(); setHoverDrop(false); onFile(e.dataTransfer.files?.[0]); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="text-center">
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 18 }}>[ .BIB ]</div>
                    <div className="mt-1">Drop Zotero/Mendeley file here</div>
                    <div className="text-[#808080]">or click to browse…</div>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept=".bib" hidden onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
                {bibName && (
                  <div className="mt-2 flex items-center justify-between win-in-thin px-1.5 py-1">
                    <span>📄 {bibName}</span>
                    <button className="win-btn" onClick={clearBib}>Clear</button>
                  </div>
                )}
              </fieldset>
            </section>

            {/* CENTER VIEWPORT */}
            <section className="win-out p-1.5 flex flex-col" style={{ background: "#c0c0c0", minHeight: 600 }}>
              <div className="win-titlebar" style={{ marginBottom: 6 }}>
                <span>Citation Network — {query || "(no query)"} {source === "openalex" ? "· OpenAlex" : "· mock"}</span>
                <span className="text-[11px] font-normal">{displayNodes.length} / {graphNodes.length} nodes · {displayEdges.length} edges</span>
              </div>

              <div className="relative flex-1">
                {/* Toolbox */}
                <div className="absolute top-2 left-2 z-10 win-out p-1" style={{ background: "#c0c0c0" }}>
                  <div className="win-titlebar inactive" style={{ padding: "1px 4px", fontSize: 11, marginBottom: 3 }}>Tools</div>
                  <div className="flex gap-1">
                    <SquareBtn label="+" title="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.1))} />
                    <SquareBtn label="−" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} />
                    <SquareBtn label="◳" title="Fit to screen" onClick={() => { setZoom(1); setResetSignal((s) => s + 1); }} />
                    <button className="win-btn" data-active={physics} title="Free physics" onClick={() => setPhysics((p) => !p)} style={{ width: 26, height: 24, padding: 0, fontFamily: "Courier New, monospace", fontWeight: 700 }}>~</button>
                    <SquareBtn label="↧" title="Export PNG" onClick={() => {
                      const c = document.querySelector("canvas");
                      if (!c) return;
                      const a = document.createElement("a");
                      a.download = "network.png";
                      a.href = (c as HTMLCanvasElement).toDataURL("image/png");
                      a.click();
                    }} />
                  </div>
                </div>

                {/* Legend */}
                <div className="absolute bottom-2 left-2 z-10 win-out px-2 py-1 text-[11px]" style={{ background: "#c0c0c0" }}>
                  <div className="flex items-center gap-1.5">
                    <span style={{ width: 10, height: 10, background: "#00ff00", border: "1px solid #000", display: "inline-block" }} /> Owned (bib match)
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span style={{ width: 10, height: 10, background: "#c0c0c0", border: "1px solid #000", display: "inline-block" }} /> Blind spot
                  </div>
                </div>

                {/* Sunken canvas frame */}
                <div className="win-in h-full relative" style={{ minHeight: 540, cursor: loading ? "wait" : undefined }}>
                  <NetworkCanvas
                    nodes={displayNodes}
                    edges={displayEdges}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                    zoom={zoom}
                    resetSignal={resetSignal}
                    physics={physics}
                  />

                  {/* Loading overlay */}
                  {loading && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "rgba(192,192,192,0.55)", cursor: "wait" }}
                    >
                      <div className="win-out" style={{ background: "#c0c0c0", minWidth: 320 }}>
                        <div className="win-titlebar">
                          <span>Please wait…</span>
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-3">
                            <Hourglass />
                            <div>
                              <div className="font-bold">{progress.stage || "Working…"}</div>
                              {progress.detail && <div className="text-[#000080]">{progress.detail}</div>}
                            </div>
                          </div>
                          <div className="win-in mt-3" style={{ height: 14, padding: 1, background: "#fff" }}>
                            <Barberpole />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error dialog */}
                  {error && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.15)" }}>
                      <div className="win-out" style={{ background: "#c0c0c0", minWidth: 340, maxWidth: 480 }}>
                        <div className="win-titlebar">
                          <span>OpenAlex — Error</span>
                          <button className="win-btn" style={{ width: 18, height: 16, padding: 0, fontSize: 10 }} onClick={() => setError(null)}>✕</button>
                        </div>
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="win-out grid place-items-center" style={{ width: 32, height: 32, background: "#c0c0c0" }}>
                              <span style={{ color: "#ff0000", fontWeight: 700, fontSize: 20, lineHeight: 1 }}>!</span>
                            </div>
                            <div className="flex-1">
                              <div className="font-bold mb-1">The request could not be completed.</div>
                              <div>{error}</div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-1 mt-4">
                            <button className="win-btn" onClick={() => setError(null)}>OK</button>
                            <button className="win-btn" style={{ fontWeight: 700 }} onClick={() => { setError(null); handleFetch(); }}>Retry</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* BOTTOM ANALYTICAL HUB (spans full width) */}
            <aside className="win-out p-1.5 flex flex-col gap-2" style={{ background: "#c0c0c0", gridColumn: "1 / -1" }}>
              <div className="win-titlebar inactive flex items-center justify-between">
                <span>Analytical Hub</span>
                <button
                  className="win-btn"
                  style={{ fontSize: 11, padding: "0 6px" }}
                  disabled={missed.length === 0}
                  onClick={() => {
                    const header = "rank,title,author,year,citations,doi,openalex_id,openalex_url";
                    const rows = missed.map((p, i) =>
                      [i + 1, p.title, p.author, p.year, p.citations, p.doi, p.id, `https://openalex.org/${p.id}`]
                        .map(csvEscape).join(","),
                    );
                    const csv = [header, ...rows].join("\n");
                    const stamp = new Date().toISOString().slice(0, 10);
                    const safeQuery = (query || "graph").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
                    downloadFile(`literature-gap-report_${safeQuery}_${stamp}.csv`, "text/csv;charset=utf-8", csv);
                    toast.success(`Exported ${missed.length} missed hub papers.`);
                  }}
                >↧ Export Gap Report (CSV)</button>
              </div>

              <StatCard label="Network Coverage Score">
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "Courier New, monospace" }}>{coverage}%</span>
                  <span className="text-[#000080]">{owned.length} / {displayNodes.length} owned</span>
                </div>
                <div className="win-in mt-1.5" style={{ height: 14, padding: 1, background: "#fff" }}>
                  <div style={{ width: `${coverage}%`, height: "100%", background: "#000080" }} />
                </div>
              </StatCard>

              <StatCard label="Top Missed Hub Paper">
                {topMissed ? (
                  <>
                    <div className="font-bold leading-tight">{topMissed.title}</div>
                    <div className="text-[#000]">{topMissed.author} · {topMissed.year}</div>
                    <div className="text-[#000080]">{formatNum(topMissed.citations)} citations</div>
                  </>
                ) : (
                  <div className="text-[#808080]">No missed hubs in current graph.</div>
                )}
              </StatCard>

              <StatCard label="Total Nodes">
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "Courier New, monospace" }}>{displayNodes.length}</span>
                <span className="ml-2">in active graph</span>
              </StatCard>

              <div className="flex-1 flex flex-col mt-1">
                <div className="flex pl-1">
                  <div className="win-tab" data-active={tab === "missed"} onClick={() => setTab("missed")}>Missed Hubs ({missed.length})</div>
                  <div className="win-tab" data-active={tab === "unmatched"} onClick={() => setTab("unmatched")}>Unmatched ({unmatchedBib.length})</div>
                </div>
                <div className="win-out flex-1" style={{ background: "#c0c0c0", padding: 4, minHeight: 200 }}>
                  <div className="win-in win-scroll" style={{ background: "#fff", height: 260, overflow: "auto" }}>
                    {tab === "missed" ? (
                      <ul>
                        {missed.map((p) => (
                          <li
                            key={p.id}
                            className="px-1.5 py-1 cursor-pointer"
                            style={{
                              background: selectedId === p.id ? "#000080" : "transparent",
                              color: selectedId === p.id ? "#fff" : "#000",
                              borderBottom: "1px dotted #c0c0c0",
                            }}
                            onClick={() => setSelectedId(p.id)}
                          >
                            <div className="font-bold leading-tight">{p.title}</div>
                            <div>{p.author} · {p.year} · {formatNum(p.citations)} cit.</div>
                            <div className="flex gap-1 mt-1">
                              <button
                                className="win-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = p.doi
                                    ? `https://openalex.org/works?filter=doi:${encodeURIComponent(p.doi)}`
                                    : `https://openalex.org/W${p.id.replace(/^W/, "")}`;
                                  window.open(target, "_blank", "noopener");
                                }}
                              >View on OpenAlex</button>
                              <button
                                className="win-btn"
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(p.doi || p.id); }}
                              >Copy DOI</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul>
                        {unmatchedBib.length === 0 && (
                          <li className="px-1.5 py-2 text-[#808080]">
                            Drop a .bib file to see entries with no match in the active graph.
                          </li>
                        )}
                        {unmatchedBib.map((p) => (
                          <li key={p.key} className="px-1.5 py-1" style={{ borderBottom: "1px dotted #c0c0c0" }}>
                            <div className="font-bold leading-tight">{p.title || "(untitled)"}</div>
                            <div>{p.author || "Unknown"}{p.year ? ` · ${p.year}` : ""}</div>
                            <div className="text-[#808080]">
                              {p.doi ? `DOI ${p.doi} · ` : ""}Not present in active OpenAlex graph.
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Status Bar */}
          <div className="flex gap-1 mt-1.5">
            <StatusCell wide>
              {loading ? `⌛ ${progress.stage}${progress.detail ? " · " + progress.detail : ""}` : error ? "✕ Error — see dialog." : "Ready."}
            </StatusCell>
            <StatusCell>Bib matches: {owned.length}</StatusCell>
            <StatusCell>Unmatched: {unmatchedBib.length}</StatusCell>
            <StatusCell>OpenAlex: {loading ? "● querying" : error ? "● error" : source === "openalex" ? "● live" : "○ mock"}</StatusCell>
            <StatusCell>Zoom: {Math.round(zoom * 100)}%</StatusCell>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Phase 5 helpers: BibTeX + CSV report export ----------

/** Build a clean BibTeX @article entry from an OpenAlex-derived paper node. */
function toBibtex(p: PaperNode): string {
  const lastName =
    (p.author || "Unknown").split(/,| and |;/)[0].trim().split(/\s+/).pop() || "Unknown";
  const key = `${lastName.toLowerCase().replace(/[^a-z0-9]/g, "")}${p.year || ""}_${p.id.toLowerCase()}`;
  const escape = (s: string) => s.replace(/[{}]/g, "");
  const lines = [
    `@article{${key},`,
    `  title   = {${escape(p.title)}},`,
    `  author  = {${escape(p.author)}},`,
    p.year ? `  year    = {${p.year}},` : null,
    p.doi ? `  doi     = {${p.doi}},` : null,
    `  note    = {OpenAlex: ${p.id}; ${formatNum(p.citations)} citations}`,
    `}`,
  ].filter(Boolean);
  return lines.join("\n");
}

const csvEscape = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Trigger a browser download for a generated text/CSV/Markdown file. */
function downloadFile(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}



const fieldsetStyle: React.CSSProperties = {
  border: "1px solid #808080",
  borderTop: "1px solid #808080",
  borderLeft: "1px solid #808080",
  borderRight: "1px solid #ffffff",
  borderBottom: "1px solid #ffffff",
};

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="win-group" style={{ ...fieldsetStyle, padding: "10px 8px 8px", position: "relative", background: "#c0c0c0" }}>
      <legend className="px-1 text-[11px] font-bold">{label}</legend>
      {children}
    </fieldset>
  );
}

function StatusCell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="win-in-thin px-1.5 py-0.5" style={{ flex: wide ? 1 : "none", fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {children}
    </div>
  );
}

/** Pure-CSS pixel hourglass (no external assets). */
function Hourglass() {
  return (
    <div
      aria-label="Working"
      style={{
        width: 24,
        height: 32,
        background:
          "linear-gradient(#000 2px, transparent 2px) top/100% 2px no-repeat," +
          "linear-gradient(#000 2px, transparent 2px) bottom/100% 2px no-repeat," +
          "conic-gradient(from 90deg at 50% 50%, #c0c0c0 0 25%, transparent 0 50%, #c0c0c0 0 75%, transparent 0)",
        border: "1px solid #000",
        animation: "hg-spin 1.2s steps(2) infinite",
      }}
    >
      <style>{`@keyframes hg-spin { 50% { transform: rotate(180deg);} }`}</style>
    </div>
  );
}

/** Indeterminate barber-pole progress bar (no smooth easing). */
function Barberpole() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundImage:
          "repeating-linear-gradient(135deg, #000080 0 8px, #1084d0 8px 16px)",
        backgroundSize: "32px 100%",
        animation: "bp-march 0.6s steps(8) infinite",
      }}
    >
      <style>{`@keyframes bp-march { from { background-position: 0 0;} to { background-position: 32px 0;} }`}</style>
    </div>
  );
}
