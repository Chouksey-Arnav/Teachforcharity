/**
 * A single-series weekly bar chart (one hue, one axis). Hover any bar for its
 * exact value; a visually hidden table carries the same numbers for screen readers.
 */
export function WeekBars({ title, data, color = "var(--color-pine-600)" }: { title: string; data: { week: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const last = data[data.length - 1]?.value ?? 0;
  const W = 240;
  const H = 64;
  const gap = 2;
  const bw = (W - gap * (data.length - 1)) / Math.max(1, data.length);
  const label = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{title}</span>
        <span className="text-xs text-muted">
          <strong className="text-sm tabular-nums text-ink">{last}</strong> this week · {total} in 12 wks
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="mt-2 h-20 w-full" role="img" aria-label={`${title}, last 12 weeks`}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke="var(--color-line)" strokeWidth="1" />
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(3, (d.value / max) * (H - 4));
          const x = i * (bw + gap);
          return (
            <g key={d.week}>
              <title>{`Week of ${label(d.week)}: ${d.value}`}</title>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              {h > 0 && <rect x={x} y={H - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={color} className="transition-opacity hover:opacity-80" />}
            </g>
          );
        })}
        <text x="0" y={H + 12} fontSize="9" fill="var(--color-muted)">
          {data[0] ? label(data[0].week) : ""}
        </text>
        <text x={W} y={H + 12} fontSize="9" fill="var(--color-muted)" textAnchor="end">
          This week
        </text>
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.week}>
              <th scope="row">Week of {label(d.week)}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
