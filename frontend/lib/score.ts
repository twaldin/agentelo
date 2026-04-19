export type FixOutcome =
  | { kind: 'no-data' }
  | { kind: 'broke'; testsBroken: number }
  | { kind: 'no-progress'; goal: number }
  | { kind: 'partial'; fixed: number; goal: number }
  | { kind: 'full'; fixed: number; goal: number }
  | { kind: 'unbaselined'; ok: number; total: number }

export function classifyFix(
  ok: number | null | undefined,
  total: number | null | undefined,
  baseline: number | null | undefined,
  broken: number | null | undefined,
): FixOutcome {
  if (ok == null || total == null) return { kind: 'no-data' }
  if (baseline != null && broken != null && broken > 0) {
    const delta = ok - baseline
    if (delta < 0) return { kind: 'broke', testsBroken: -delta }
    if (delta === 0) return { kind: 'no-progress', goal: broken }
    if (delta < broken) return { kind: 'partial', fixed: delta, goal: broken }
    return { kind: 'full', fixed: delta, goal: broken }
  }
  return { kind: 'unbaselined', ok, total }
}

export function fixLabel(o: FixOutcome): string {
  switch (o.kind) {
    case 'no-data': return '\u2014'
    case 'broke': return `broke ${o.testsBroken} test${o.testsBroken !== 1 ? 's' : ''}`
    case 'no-progress': return `0/${o.goal} fixed`
    case 'partial': return `${o.fixed}/${o.goal} fixed`
    case 'full': return `${o.fixed}/${o.goal} fixed`
    case 'unbaselined': return `${o.ok}/${o.total}`
  }
}

export function fixColor(o: FixOutcome): string {
  switch (o.kind) {
    case 'no-data': return 'text-muted-foreground'
    case 'broke': return 'text-destructive'
    case 'no-progress': return 'text-destructive'
    case 'partial': return 'text-warning'
    case 'full': return 'text-success'
    case 'unbaselined': return o.ok > 0 ? 'text-success' : 'text-destructive'
  }
}
