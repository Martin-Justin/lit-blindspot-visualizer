import { useEffect, useRef } from "react";
import type { PaperNode, Edge } from "@/lib/mockData";

type Props = {
  nodes: PaperNode[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  zoom: number;
  resetSignal: number;
  physics: boolean;
};

// Citation -> radius (px). Log scale, clamped.
function nodeSize(citations: number) {
  const s = Math.log(Math.max(0, citations) + 1) * 4.2;
  return Math.max(8, Math.min(46, s));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
}

// Build the vis-network node spec for a paper. Selection styling is layered on
// top via DataSet.update so positions never reset on a click.
function buildNode(n: PaperNode, isSel: boolean) {
  const fill = n.owned ? "#00ff00" : "#c0c0c0";
  const border = isSel ? "#000080" : "#000000";
  return {
    id: n.id,
    label: n.title.length > 36 ? n.title.slice(0, 34) + "…" : n.title,
    title: `${escapeHtml(n.title)}\n${escapeHtml(n.author)} · ${n.year}\nCitations: ${n.citations.toLocaleString("en-US")}`,
    size: nodeSize(n.citations),
    color: {
      background: fill,
      border,
      highlight: { background: fill, border: "#000080" },
      hover: { background: fill, border: "#000080" },
    },
    borderWidth: isSel ? 3 : 1.5,
    borderWidthSelected: 3,
    shapeProperties: { borderDashes: isSel ? [2, 2] : false },
  };
}

export function NetworkCanvas({ nodes, edges, selectedId, onSelect, zoom, resetSignal, physics }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    network: any;
    nodesDS: any;
    edgesDS: any;
    idsKey: string;
    selectedId: string | null;
  } | null>(null);
  // Keep latest values accessible inside async init without re-running.
  const latest = useRef({ nodes, edges, selectedId });
  latest.current = { nodes, edges, selectedId };

  // Mount the vis-network instance once on the client.
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let disposed = false;

    (async () => {
      const vis = await import("vis-network/standalone/esm/vis-network.mjs");
      if (disposed || !containerRef.current) return;
      const { Network, DataSet } = vis as any;

      const nodesDS = new DataSet([]);
      const edgesDS = new DataSet([]);

      const net = new Network(
        containerRef.current,
        { nodes: nodesDS, edges: edgesDS },
        {
          autoResize: true,
          interaction: { hover: true, tooltipDelay: 120, dragNodes: true, zoomView: true },
          physics: {
            enabled: true,
            solver: "barnesHut",
            barnesHut: {
              gravitationalConstant: -3200,
              springLength: 120,
              springConstant: 0.04,
              damping: 0.35,
              avoidOverlap: 0.2,
            },
            stabilization: { enabled: true, iterations: 400, fit: true },
          },
          nodes: {
            shape: "dot",
            borderWidth: 1.5,
            font: {
              face: "Tahoma, Arial, sans-serif",
              size: 11,
              color: "#000000",
              strokeWidth: 3,
              strokeColor: "#ffffff",
              vadjust: 2,
            },
            shadow: false,
          },
          edges: {
            color: { color: "#404040", highlight: "#000080", hover: "#000080" },
            width: 1,
            smooth: { enabled: true, type: "continuous", roundness: 0.4 },
            arrows: { to: { enabled: false } },
          },
        },
      );

      net.on("click", (params: any) => {
        const id = params.nodes?.[0];
        onSelect(id ?? null);
      });

      // When stabilization completes, freeze physics so the layout stays put.
      net.on("stabilizationIterationsDone", () => {
        net.setOptions({ physics: { enabled: false } });
      });

      // Seed initial data + stabilize once.
      const { nodes: n0, edges: e0, selectedId: sel0 } = latest.current;
      nodesDS.add(n0.map((n) => buildNode(n, n.id === sel0)));
      edgesDS.add(e0.map((e, i) => ({ id: `e${i}`, from: e.source, to: e.target })));
      stateRef.current = {
        network: net,
        nodesDS,
        edgesDS,
        idsKey: n0.map((n) => n.id).sort().join("|"),
        selectedId: sel0,
      };
      if (n0.length > 0) net.stabilize();
    })();

    return () => {
      disposed = true;
      try { stateRef.current?.network?.destroy(); } catch { /* noop */ }
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-seed only when the actual node SET changes (not on selection).
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const idsKey = nodes.map((n) => n.id).sort().join("|");
    if (idsKey === s.idsKey) {
      // Same nodes — refresh sizes/labels in place, keep positions.
      s.nodesDS.update(nodes.map((n) => buildNode(n, n.id === s.selectedId)));
      return;
    }
    s.idsKey = idsKey;
    s.nodesDS.clear();
    s.nodesDS.add(nodes.map((n) => buildNode(n, n.id === s.selectedId)));
    if (nodes.length > 0) {
      try {
        s.network.setOptions({ physics: { enabled: true } });
        s.network.stabilize();
      } catch { /* noop */ }
    }
  }, [nodes]);

  // Edges sync.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.edgesDS.clear();
    s.edgesDS.add(edges.map((e, i) => ({ id: `e${i}`, from: e.source, to: e.target })));
  }, [edges]);

  // Selection — restyle prev + new node in place; never touch positions.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const prev = s.selectedId;
    const updates: any[] = [];
    if (prev && prev !== selectedId) {
      const p = nodes.find((n) => n.id === prev);
      if (p) updates.push(buildNode(p, false));
    }
    if (selectedId) {
      const n = nodes.find((x) => x.id === selectedId);
      if (n) updates.push(buildNode(n, true));
      try { s.network.selectNodes([selectedId], false); } catch { /* noop */ }
    } else {
      try { s.network.unselectAll(); } catch { /* noop */ }
    }
    if (updates.length) s.nodesDS.update(updates);
    s.selectedId = selectedId;
  }, [selectedId, nodes]);

  // Physics toggle (manual override).
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.network.setOptions({ physics: { enabled: physics } });
  }, [physics]);

  // Zoom control.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    try { s.network.moveTo({ scale: zoom, animation: { duration: 180, easingFunction: "easeInOutQuad" } }); } catch { /* noop */ }
  }, [zoom]);

  // Fit-to-screen.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || resetSignal === 0) return;
    try { s.network.fit({ animation: { duration: 240, easingFunction: "easeInOutQuad" } }); } catch { /* noop */ }
  }, [resetSignal]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, background: "#ffffff" }}
      />
      <style>{`
        div.vis-tooltip {
          background: #ffffe1 !important;
          color: #000 !important;
          border: 1px solid #000 !important;
          border-radius: 0 !important;
          padding: 3px 6px !important;
          font-family: Tahoma, "MS Sans Serif", Arial, sans-serif !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
          white-space: pre-line !important;
          box-shadow: 1px 1px 0 #000 !important;
        }
      `}</style>
    </>
  );
}
