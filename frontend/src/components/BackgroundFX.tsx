import { useEffect, useRef } from "react";

/**
 * Ambient network backdrop: a sparse field of very slowly drifting nodes joined by faint lines when
 * they come near each other. Deliberately calm — no cursor interaction and barely-there motion — so
 * it reads as texture behind the content, never something that pulls the eye. Rendered on a single
 * canvas behind the whole app. Honours prefers-reduced-motion by drawing one static frame.
 */
export function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    type Node = { x: number; y: number; vx: number; vy: number };
    let nodes: Node[] = [];

    // Sparse field — fewer nodes than a typical "constellation" so the lattice stays quiet.
    const targetCount = () => Math.round(Math.min(52, Math.max(22, (width * height) / 46000)));

    const seed = () => {
      nodes = Array.from({ length: targetCount() }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        // Very slow drift so motion is barely perceptible.
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const LINK = 120; // px distance under which two nodes get a line

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;

        // Wrap around the edges so the field never empties out.
        if (n.x < -20) n.x = width + 20;
        if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20;
        if (n.y > height + 20) n.y = -20;
      }

      // Connecting lines — brighter the closer two nodes are, but kept very faint overall.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK) {
            const alpha = (1 - dist / LINK) * 0.07;
            ctx.strokeStyle = `rgba(61, 245, 192, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Nodes.
      for (const n of nodes) {
        ctx.fillStyle = "rgba(125, 248, 215, 0.28)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    let raf = 0;
    resize();
    window.addEventListener("resize", resize);
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="bg-network" aria-hidden="true" />;
}
