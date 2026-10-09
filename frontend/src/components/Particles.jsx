import { useMemo } from "react";

export default function Particles({ count = 30 }) {
  const items = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    duration: 10 + Math.random() * 20,
    delay: Math.random() * 15,
    size: 2 + Math.random() * 3,
    color: Math.random() > 0.5 ? "#00E5FF" : "#9D4CDD",
  })), [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {items.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            boxShadow: `0 0 8px ${p.color}`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
