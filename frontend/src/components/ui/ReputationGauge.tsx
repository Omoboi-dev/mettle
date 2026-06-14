import { useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

/** Score 0–100 -> a color from coral (low) through amber to mint (high). */
export function scoreColor(score: number): string {
  if (score >= 75) return "#3df5c0";
  if (score >= 60) return "#7fe7a8";
  if (score >= 50) return "#e8d36b";
  if (score >= 35) return "#f0a35e";
  return "#f0617a";
}

interface Props {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
}

export function ReputationGauge({ score, size = 132, stroke = 9, label = "reputation" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [shown, setShown] = useState(0);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  const pct = Math.max(0, Math.min(100, score)) / 100;

  // Count the number up once the gauge scrolls into view.
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setShown(Math.round(score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, score]);

  return (
    <div ref={ref} className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#20242c" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: inView ? c * (1 - pct) : c }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
          {shown}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate">{label}</span>
      </div>
    </div>
  );
}
