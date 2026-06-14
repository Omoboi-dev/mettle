import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface Props {
  to: number;
  format?: (n: number) => string;
  duration?: number;
}

/** Counts from 0 to `to` once it scrolls into view. */
export function CountUp({ to, format = (n) => Math.round(n).toLocaleString(), duration = 1200 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setValue(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
  );
}
