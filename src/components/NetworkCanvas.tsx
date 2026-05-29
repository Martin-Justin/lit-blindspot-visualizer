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

export function NetworkCanvas({ nodes, edges, selectedId, onSelect, zoom, resetSignal, physics }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Hold the live network + datasets across renders without re-mounting.
  const stateRef = useRef<{
    network: any;
    nodesDS: any;
    edgesDS: any;
    DataSet: any;
  } | null>(null);

  // Mount the vis-network instance once on the client.
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let disposed = false;
    let net: any;

    (async () => {
      const vis = await import("vis-network/standalone/esm/vis-network");
      if (disposed || !containerRef.current) return;
      const { Network, DataSet } = vis as any;

      const nodesDS = new DataSet([]);
      const edgesDS = new DataSet([]);

      net = new Network(
        containerRef.current,
        { nodes: nodesDS, edges: edgesDS },
        {
          autoResize: true,
          interaction: {
            hover: true,
            tooltipDelay: 120,
            dragNodes: true,
            zoomView: true,
          },
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
            stabilization: { enabled: true, iterations: 250, fit: true },
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

      // Freeze layout once initially stabilized; the toggle re-enables it.
      net.once("stabilizationIterationsDone", () => {
        net.setOptions({ physics: { enabled: false } });
      });

      stateRef.current = { network: net, nodesDS, edgesDS, DataSet };
    })();

    return () => {
      disposed = true;
      try {
        stateRef.current?.network?.destroy();
      } catch {
        /* noop */
      }
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync graph data whenever nodes/edges/selection change.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    const visNodes = nodes.map((n) => {
      const isSel = n.id === selectedId;
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
    });

    const visEdges = edges.map((e, i) => ({ id: `e${i}`, from: e.source, to: e.target }));

    s.nodesDS.clear();
    s.nodesDS.add(visNodes);
    s.edgesDS.clear();
    s.edgesDS.add(visEdges);

    if (selectedId) {
      try { s.network.selectNodes([selectedId], false); } catch { /* noop */ }
    } else {
      try { s.network.unselectAll(); } catch { /* noop */ }
    }
  }, [nodes, edges, selectedId]);

  // Physics toggle.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.network.setOptions({ physics: { enabled: physics } });
  }, [physics]);

  // External zoom control.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    try { s.network.moveTo({ scale: zoom, animation: { duration: 180, easingFunction: "easeInOutQuad" } }); } catch { /* noop */ }
  }, [zoom]);

  // Fit-to-screen via resetSignal.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || resetSignal === 0) return;
    try { s.network.fit({ animation: { duration: 240, easingFunction: "easeInOutQuad" } }); } catch { /* noop */ }
  }, [resetSignal]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "#ffffff",
          imageRendering: "pixelated",
        }}
      />
      {/* Retro tooltip skin — vis-network injects .vis-tooltip into <body>. */}
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
