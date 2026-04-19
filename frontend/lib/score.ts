export type FixOutcome =
  | { kind: 'no-data' }
  | { kind: 'regression'; delta: number; goal: number }
  | { kind: 'no-progress'; goal: number }
  | { kind: 'partial'; delta: number; goal: number }
  | { kind: 'full'; delta: number; goal: number }
  | { kind: 'unbaselined'; ok: number; total: number }

export function classifyFix(
  ok: number | null | undefined,
  total: number | null | undefined,
  baseline: number | null | undefined,
  broken: number | null | undefined
): FixOutcome {
  if (ok == null || total == null) return { kind: 'no-data' }
  if (baseline != null && broken != null && broken > 0) {
    const delta = ok - baseline
    if (delta < 0) return { kind: 'regression', delta, goal: broken }
    if (delta === 0) return { kind: 'no-progress', goal: broken }
    if (delta < broken) return { kind: 'partial', delta, goal: broken }
    return { kind: 'full', delta, goal: broken }
  }
  return { kind: 'unbaselined', ok, total }
}

// CRITICAL: regression returns "<negative-delta>/<goal> fixed" verbatim.
// No paraphrase. e.g. delta=-198, goal=5 -> "-198/5 fixed"
export function fixLabel(o: FixOutcome): string {
  switch (o.kind) {
    case 'no-data': return '—'
    case 'regression': return `${o.delta}/${o.goal} fixed`
    case 'no-progress': return `0/${o.goal} fixed`
    case 'partial': return `${o.delta}/${o.goal} fixed`
    case 'full': return `${o.delta}/${o.goal} fixed`
    case 'unbaselined': return `${o.ok}/${o.total}`
  }
}

export function fixColor(o: FixOutcome): string {
  switch (o.kind) {
    case 'no-data': return 'text-muted-foreground'
    case 'regression': return 'text-destructive'
    case 'no-progress': return 'text-muted-foreground'
    case 'partial': return 'text-warning'
    case 'full': return 'text-success'
    case 'unbaselined': return o.ok > 0 ? 'text-success' : 'text-destructive'
  }
}
