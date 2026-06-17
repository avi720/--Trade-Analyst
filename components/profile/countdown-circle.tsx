export function CountdownCircle({ remaining, total }: { remaining: number; total: number }) {
  const r = 5;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - remaining / total);
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx="7" cy="7" r={r} fill="none" stroke="#1a3a1a" strokeWidth="2" />
      <circle
        cx="7" cy="7" r={r}
        fill="none"
        stroke="#2CC84A"
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}
