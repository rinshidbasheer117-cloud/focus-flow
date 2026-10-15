import { useEffect, useRef } from "react";
import { getAnalyser } from "@/lib/music/synth";
import { motionAllowed, usePrefs } from "@/lib/prefs";

/** Audio-reactive bars when real audio plays and motion is allowed; static otherwise. */
export function Waveform({ active, bars = 28, className = "" }: { active: boolean; bars?: number; className?: string }) {
  const prefs = usePrefs();
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const animate = active && motionAllowed(prefs);
  useEffect(() => {
    if (!animate) {
      refs.current.forEach((el, i) => el && (el.style.height = `${20 + ((i * 37) % 50)}%`));
      return;
    }
    let raf = 0;
    const data = new Uint8Array(32);
    const loop = () => {
      const a = getAnalyser();
      if (a) a.getByteFrequencyData(data);
      refs.current.forEach((el, i) => {
        if (!el) return;
        const v = data[(i * 2) % 28] ?? 0;
        el.style.height = `${Math.max(8, (v / 255) * 100)}%`;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [animate]);
  return (
    <div className={`flex h-12 items-end gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} ref={(el) => void (refs.current[i] = el)}
          className={`w-full rounded-full ${i % 3 === 0 ? "bg-violet" : i % 3 === 1 ? "bg-primary" : "bg-lime"} ${active ? "opacity-90" : "opacity-30"}`}
          style={{ height: "30%", transition: "height 80ms linear" }} />
      ))}
    </div>
  );
}
