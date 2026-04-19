'use client'

import { LineChart, Line, ReferenceLine } from 'recharts'

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
    return <span style={{ display: 'inline-block', width: 80, height: 24 }} />
  }

  const chartData = data.map((v, i) => ({ i, v }))
  const isUp = data[data.length - 1] >= data[0]
  const lineColor = isUp ? 'var(--success)' : 'var(--destructive)'
  const dotColor = isUp ? 'var(--success)' : 'var(--destructive)'
  const minVal = Math.min(...data)
  const maxVal = Math.max(...data)
  const midVal = (minVal + maxVal) / 2
  const lastIdx = data.length - 1

  return (
    <LineChart
      width={80}
      height={24}
      data={chartData}
      margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
    >
      <ReferenceLine
        y={midVal}
        stroke="var(--muted-foreground)"
        strokeDasharray="2 2"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      <Line
        type="monotone"
        dataKey="v"
        stroke={lineColor}
        strokeWidth={1.5}
        isAnimationActive={false}
        dot={(props: DotCallbackProps) => {
          if (props.index !== lastIdx) return <g key={props.index} />
          return (
            <circle
              key={props.index}
              cx={props.cx}
              cy={props.cy}
              r={2.5}
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
