import { useEffect, useRef, useState, useCallback } from "react";
import type { PaperNode, Edge } from "@/lib/mockData";

type Props = {
  nodes: PaperNode[];
  edges: Edge[];
  onSelect?: (id: string | null) => void;
  selectedId?: string | null;
  zoom: number;
  resetSignal?: number;
};

export function NetworkCanvas({ nodes, edges, onSelect, selectedId, zoom, resetSignal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  );
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    setPositions(Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }])));
  }, [resetSignal, nodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size.w / zoom, size.h / zoom);

    // edges
    ctx.strokeStyle = "#808080";
    ctx.lineWidth = 1;
    edges.forEach((e) => {
      const a = positions[e.source];
      const b = positions[e.target];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    // nodes
    nodes.forEach((n) => {
      const p = positions[n.id];
      if (!p) return;
      const r = Math.max(6, Math.min(22, Math.log10(n.citations + 10) * 4));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.owned ? "#00ff00" : "#c0c0c0";
      ctx.fill();
      ctx.lineWidth = n.id === selectedId ? 2 : 1;
      ctx.strokeStyle = "#000000";
      ctx.stroke();
      if (n.id === selectedId) {
        ctx.strokeStyle = "#000080";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - r - 4, p.y - r - 4, (r + 4) * 2, (r + 4) * 2);
      }
    });
  }, [size, zoom, edges, nodes, positions, selectedId]);

  useEffect(() => {
    draw();
  }, [draw]);

  const hitTest = (mx: number, my: number) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const p = positions[n.id];
      if (!p) continue;
      const r = Math.max(6, Math.min(22, Math.log10(n.citations + 10) * 4));
      if ((mx - p.x) ** 2 + (my - p.y) ** 2 <= (r + 2) ** 2) return n.id;
    }
    return null;
  };

  const toLocal = (ev: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) / zoom, y: (ev.clientY - rect.top) / zoom };
  };

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden bg-white relative">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor: dragRef.current ? "grabbing" : "default" }}
        onMouseDown={(e) => {
          const { x, y } = toLocal(e);
          const id = hitTest(x, y);
          if (id) {
            const p = positions[id];
            dragRef.current = { id, dx: x - p.x, dy: y - p.y };
            onSelect?.(id);
          } else {
            onSelect?.(null);
          }
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          const { x, y } = toLocal(e);
          const { id, dx, dy } = dragRef.current;
          setPositions((prev) => ({ ...prev, [id]: { x: x - dx, y: y - dy } }));
        }}
        onMouseUp={() => {
          dragRef.current = null;
        }}
        onMouseLeave={() => {
          dragRef.current = null;
        }}
      />
    </div>
  );
}
