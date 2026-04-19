'use client'

import { LineChart, Line, ReferenceLine } from 'recharts'

interface SparklineProps {
  data: number[]
  isUp: boolean
}

interface DotCallbackProps {
  cx: number
  cy: number
  index: number
  [key: string]: unknown
}

export function Sparkline({ data, isUp }: SparklineProps) {
  if (!data || data.length < 4) {
    return <span style={{ display: 'inline-block', width: 40, height: 16 }} />
  }

  const chartData = data.map((v, i) => ({ i, v }))
  const lineColor = isUp
    ? 'var(--success)'
    : 'var(--destructive)'
  const lastIdx = data.length - 1
  const mid = (Math.min(...data) + Math.max(...data)) / 2

  return (
    <LineChart
      width={80}
      height={24}
      data={chartData}
      margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
    >
      <ReferenceLine y={mid} stroke={lineColor} strokeOpacity={0.25} strokeDasharray="2 2" />
      <Line
        type="monotone"
        dataKey="v"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeOpacity={0.7}
        isAnimationActive={false}
        dot={(props: DotCallbackProps) => {
          if (props.index !== lastIdx) return <g key={props.index} />
          return (
            <circle
              key={props.index}
              cx={props.cx}
              cy={props.cy}
              r={2.5}
              fill={lineColor}
              stroke="none"
            />
          )
        }}
        activeDot={false}
      />
    </LineChart>
  )
}
