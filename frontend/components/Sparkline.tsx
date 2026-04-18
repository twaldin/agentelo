'use client'

import { LineChart, Line } from 'recharts'

interface SparklineProps {
  data: number[]
}

interface DotCallbackProps {
  cx: number
  cy: number
  index: number
  [key: string]: unknown
}

export function Sparkline({ data }: SparklineProps) {
  if (!data || data.length < 2) {
    return <span style={{ display: 'inline-block', width: 40, height: 16 }} />
  }

  const chartData = data.map((v, i) => ({ i, v }))
  const isUp = data[data.length - 1] >= data[0]
  const lineColor = isUp
    ? 'oklch(0.75 0.18 145 / 0.6)'
    : 'var(--muted-foreground)'
  const dotColor = 'oklch(0.75 0.18 145)'
  const lastIdx = data.length - 1

  return (
    <LineChart
      width={40}
      height={16}
      data={chartData}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
    >
      <Line
        type="monotone"
        dataKey="v"
        stroke={lineColor}
        strokeWidth={1}
        isAnimationActive={false}
        dot={(props: DotCallbackProps) => {
          if (props.index !== lastIdx) return <g key={props.index} />
          return (
            <circle
              key={props.index}
              cx={props.cx}
              cy={props.cy}
              r={2}
              fill={dotColor}
              stroke="none"
            />
          )
        }}
        activeDot={false}
      />
    </LineChart>
  )
}
