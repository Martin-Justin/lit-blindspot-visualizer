import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef } from "react";
import { NetworkCanvas } from "@/components/NetworkCanvas";
import { mockNodes, mockEdges, mockUnmatched } from "@/lib/mockData";

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

function Index() {
  const [query, setQuery] = useState("Epistemic Bias in Science");
  const [yearMin, setYearMin] = useState(1960);
  const [yearMax, setYearMax] = useState(2024);
  const [maxPapers, setMaxPapers] = useState(50);
  const [tab, setTab] = useState<"missed" | "unmatched">("missed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [resetSignal, setResetSignal] = useState(0);
  const [physics, setPhysics] = useState(false);
  const [hoverDrop, setHoverDrop] = useState(false);
  const [bibName, setBibName] = useState<string | null>("zotero-library.bib");
  const fileRef = useRef<HTMLInputElement>(null);

  const owned = mockNodes.filter((n) => n.owned);
  const missed = mockNodes
    .filter((n) => !n.owned)
    .sort((a, b) => b.citations - a.citations);
  const topMissed = missed[0];
  const coverage = Math.round((owned.length / mockNodes.length) * 100);

  const onFile = (file?: File) => {
    if (!file) return;
    setBibName(file.name);
  };

  const SquareBtn = ({ label, onClick, title }: { label: string; onClick?: () => void; title: string }) => (
    <button className="win-btn" title={title} onClick={onClick} style={{ width: 26, height: 24, padding: 0, fontFamily: "Courier New, monospace", fontWeight: 700 }}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen w-full p-2 sm:p-4" style={{ background: "#008080" }}>
      {/* Application Window */}
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
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "260px 1fr 320px" }}>
            {/* LEFT TOOL PANE */}
            <section className="win-out p-1.5" style={{ background: "#c0c0c0" }}>
              <div className="win-titlebar inactive" style={{ marginBottom: 6 }}>
                <span>Search Parameters</span>
              </div>

              <fieldset className="win-group mb-3" style={{ border: "1px solid #808080", borderTop: "1px solid #808080", borderLeft: "1px solid #808080", borderRight: "1px solid #ffffff", borderBottom: "1px solid #ffffff" }}>
                <legend className="px-1 text-[11px]">OpenAlex Query</legend>
                <label className="block mb-1">Topic:</label>
                <input className="win-input w-full" value={query} onChange={(e) => setQuery(e.target.value)} />
                <label className="block mt-2 mb-1">Year range:</label>
                <div className="flex items-center gap-1">
                  <input type="number" className="win-input" style={{ width: 60 }} value={yearMin} onChange={(e) => setYearMin(+e.target.value)} />
                  <span>—</span>
                  <input type="number" className="win-input" style={{ width: 60 }} value={yearMax} onChange={(e) => setYearMax(+e.target.value)} />
                </div>
                <label className="block mt-2 mb-1">Max papers:</label>
                <select className="win-input w-full" value={maxPapers} onChange={(e) => setMaxPapers(+e.target.value)}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <div className="mt-2 flex gap-1 justify-end">
                  <button className="win-btn">Cancel</button>
                  <button className="win-btn" style={{ fontWeight: 700 }}>Fetch Graph</button>
                </div>
              </fieldset>

              <fieldset className="win-group" style={{ border: "1px solid #808080", borderTop: "1px solid #808080", borderLeft: "1px solid #808080", borderRight: "1px solid #ffffff", borderBottom: "1px solid #ffffff" }}>
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
                    <button className="win-btn" onClick={() => setBibName(null)}>Clear</button>
                  </div>
                )}
              </fieldset>
            </section>

            {/* CENTER VIEWPORT */}
            <section className="win-out p-1.5 flex flex-col" style={{ background: "#c0c0c0", minHeight: 600 }}>
              <div className="win-titlebar" style={{ marginBottom: 6 }}>
                <span>Citation Network — {query}</span>
                <span className="text-[11px] font-normal">{mockNodes.length} nodes · {mockEdges.length} edges</span>
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
                <div className="win-in h-full" style={{ minHeight: 540 }}>
                  <NetworkCanvas
                    nodes={mockNodes}
                    edges={mockEdges}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                    zoom={zoom}
                    resetSignal={resetSignal}
                  />
                </div>
              </div>
            </section>

            {/* RIGHT ANALYTICAL HUB */}
            <aside className="win-out p-1.5 flex flex-col gap-2" style={{ background: "#c0c0c0" }}>
              <div className="win-titlebar inactive">
                <span>Analytical Hub</span>
              </div>

              <StatCard label="Network Coverage Score">
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "Courier New, monospace" }}>{coverage}%</span>
                  <span className="text-[#000080]">{owned.length} / {mockNodes.length} owned</span>
                </div>
                <div className="win-in mt-1.5" style={{ height: 14, padding: 1, background: "#fff" }}>
                  <div style={{ width: `${coverage}%`, height: "100%", background: "#000080" }} />
                </div>
              </StatCard>

              <StatCard label="Top Missed Hub Paper">
                <div className="font-bold leading-tight">{topMissed.title}</div>
                <div className="text-[#000]">{topMissed.author} · {topMissed.year}</div>
                <div className="text-[#000080]">{topMissed.citations.toLocaleString()} citations</div>
              </StatCard>

              <StatCard label="Total Nodes">
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "Courier New, monospace" }}>{mockNodes.length}</span>
                <span className="ml-2">in active graph</span>
              </StatCard>

              {/* Tabs */}
              <div className="flex-1 flex flex-col mt-1">
                <div className="flex pl-1">
                  <div className="win-tab" data-active={tab === "missed"} onClick={() => setTab("missed")}>Missed Hubs ({missed.length})</div>
                  <div className="win-tab" data-active={tab === "unmatched"} onClick={() => setTab("unmatched")}>Unmatched ({mockUnmatched.length})</div>
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
                            <div>{p.author} · {p.year} · {p.citations.toLocaleString()} cit.</div>
                            <div className="flex gap-1 mt-1">
                              <button
                                className="win-btn"
                                onClick={(e) => { e.stopPropagation(); window.open(`https://openalex.org/works?filter=doi:${p.doi}`, "_blank"); }}
                              >View on OpenAlex</button>
                              <button
                                className="win-btn"
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(p.doi); }}
                              >Copy DOI</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul>
                        {mockUnmatched.map((p) => (
                          <li key={p.id} className="px-1.5 py-1" style={{ borderBottom: "1px dotted #c0c0c0" }}>
                            <div className="font-bold leading-tight">{p.title}</div>
                            <div>{p.author} · {p.year}</div>
                            <div className="text-[#808080]">Not present in active OpenAlex graph.</div>
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
            <StatusCell wide>Ready.</StatusCell>
            <StatusCell>Bib matches: {owned.length}</StatusCell>
            <StatusCell>Unmatched: {mockUnmatched.length}</StatusCell>
            <StatusCell>OpenAlex: ● connected (mock)</StatusCell>
            <StatusCell>Zoom: {Math.round(zoom * 100)}%</StatusCell>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset
      className="win-group"
      style={{
        border: "1px solid #808080",
        borderTop: "1px solid #808080",
        borderLeft: "1px solid #808080",
        borderRight: "1px solid #ffffff",
        borderBottom: "1px solid #ffffff",
        padding: "10px 8px 8px",
        position: "relative",
        background: "#c0c0c0",
      }}
    >
      <legend className="px-1 text-[11px] font-bold">{label}</legend>
      {children}
    </fieldset>
  );
}

function StatusCell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="win-in-thin px-1.5 py-0.5" style={{ flex: wide ? 1 : "none", fontSize: 11 }}>
      {children}
    </div>
  );
}
