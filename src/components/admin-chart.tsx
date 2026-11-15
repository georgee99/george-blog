interface Point {
  label: string
  value: number | null
}

interface Props {
  title: string
  points: Point[]
  kind: 'bar' | 'line'
  format: (n: number) => string
}

const W = 600
const H = 140
const PAD = { top: 8, right: 8, bottom: 20, left: 8 }

export function Chart({ title, points, kind, format }: Props) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  const max = Math.max(...values, 0)
  const hasData = values.some((v) => v > 0)

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const step = innerW / Math.max(points.length, 1)
  const y = (v: number) => PAD.top + innerH - (max > 0 ? (v / max) * innerH : 0)
  const x = (i: number) => PAD.left + step * i + step / 2

  // Lines break across days without data instead of dropping to zero.
  const segments: string[] = []
  let current: string[] = []
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current.join(' '))
      current = []
    } else {
      current.push(`${current.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    }
  })
  if (current.length) segments.push(current.join(' '))

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between text-xs uppercase tracking-widest text-neutral-400">
        <span>{title}</span>
        {hasData && <span className="normal-case tracking-normal">max {format(max)}</span>}
      </figcaption>
      {hasData ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value === null ? 'no data' : format(p.value)}`).join(', ')}`}
          className="h-auto w-full text-neutral-900 dark:text-neutral-100"
        >
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={H - PAD.bottom}
            y2={H - PAD.bottom}
            className="stroke-neutral-200 dark:stroke-neutral-700"
          />
          {kind === 'bar'
            ? points.map((p, i) =>
                p.value ? (
                  <rect
                    key={p.label}
                    x={x(i) - Math.min(step * 0.35, 14)}
                    width={Math.min(step * 0.7, 28)}
                    y={y(p.value)}
                    height={H - PAD.bottom - y(p.value)}
                    fill="currentColor"
                  >
                    <title>{`${p.label}: ${format(p.value)}`}</title>
                  </rect>
                ) : null,
              )
            : (
              <>
                {segments.map((d) => (
                  <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
                ))}
                {points.map((p, i) =>
                  p.value !== null ? (
                    <circle key={p.label} cx={x(i)} cy={y(p.value)} r={2.5} fill="currentColor">
                      <title>{`${p.label}: ${format(p.value)}`}</title>
                    </circle>
                  ) : null,
                )}
              </>
            )}
          {points.length > 0 && (
            <>
              <text x={PAD.left} y={H - 5} className="fill-neutral-400 text-[10px]">
                {points[0].label}
              </text>
              {points.length > 1 && (
                <text x={W - PAD.right} y={H - 5} textAnchor="end" className="fill-neutral-400 text-[10px]">
                  {points[points.length - 1].label}
                </text>
              )}
            </>
          )}
        </svg>
      ) : (
        <p className="py-6 text-sm text-neutral-400">No data in this range</p>
      )}
    </figure>
  )
}
