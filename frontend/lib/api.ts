const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

// --- Leaderboard types ---

export interface LeaderboardAgent {
  id: string
  rank: number
  name: string
  display_name?: string | null
  harness: string
  model: string
  elo: number
  rd: number
  wr: number
  played: number
  wins: number
  d7: number
  hist: number[]
  hash: string | null
  recent: {
    n: string
    st: string
    sc: string
    t: string
  }[]
  avgCost: number | null
}

// --- Agent detail types ---

export interface RatingHistoryEntry {
  r: number
  ts: string
  delta: number
}

export interface GameEntry {
  id?: number
  opponent_id: string
  opponent_model: string
  opponent_submission_id?: number
  score: number
  delta: number
  rating_after: number
  opponent_tests_ok: number | null
  opponent_tests_total: number | null
  opponent_time: number | null
  opponent_diff_lines?: number | null
}

export interface MatchEntry {
  submission_id: number
  run_id: string
  challenge_id: string
  tests_ok: number
  tests_total: number
  tests_passed: boolean
  baseline_passing: number | null
  broken_by_bug: number | null
  agent_time: number
  diff_lines: number
  exit_code: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  created_at: string
  games: GameEntry[]
  total_delta: number
}

export interface AgentDetail {
  id: string
  display_name?: string | null
  rank: number
  harness: string
  model: string
  current_hash: string | null
  elo: number
  rd: number
  played: number
  wins: number
  losses: number
  draws: number
  wr: number
  d7: number
  ratingHistory: RatingHistoryEntry[]
  configVersions: {
    hash: string
    model: string
    first_seen_at: string
  }[]
  matches: MatchEntry[]
}

// --- Challenge types ---

export interface ChallengeEntry {
  id: string
  repo: string
  title: string
  diff: string
  lang: string
  sr: number
  att: number
  avgt: string
  test_command: string | null
  created_at: string | null
}

export interface ChallengeAttempt {
  run_id: string
  model: string
  harness: string
  passed: boolean
  time: string
  test_time: string
  diff_lines: number
  tests_ok: number
  tests_total: number
  tests_failed: number
  baseline_passing: number | null
  broken_by_bug: number | null
  cost_usd: number
  agent_name: string
  created_at: string
}

export interface ChallengeDetail extends ChallengeEntry {
  body?: string
  fixDiff?: string
  fixCommit?: string
  baseline_passing: number | null
  broken_by_bug: number | null
  attempts: ChallengeAttempt[]
}

// --- Submission types ---

export interface SubmissionDetail {
  id: number
  run_id: string
  challenge_id: string
  challenge_title: string
  agent_id: string
  harness: string
  model: string
  tests_ok: number
  tests_total: number
  tests_failed: number
  baseline_passing: number | null
  broken_by_bug: number | null
  agent_time_seconds: number
  test_time_seconds: number
  diff_lines: number
  diff: string
  exit_code: number
  tampered: boolean
  tokens_in: number
  tokens_out: number
  cost_usd: number
  created_at: string
  games: GameEntry[]
}

// --- Game detail types ---

export interface GameSubmission {
  id: number
  run_id: string
  agent_id: string
  harness: string
  model: string
  tests_ok: number
  tests_total: number
  tests_failed: number
  agent_time_seconds: number
  test_time_seconds: number
  diff_lines: number
  diff: string
  exit_code: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  created_at: string
}

export interface GameDetail {
  id: number
  challenge_id: string
  challenge_title: string
  agent_id: string
  opponent_id: string
  score: number
  delta: number
  rating_before: number
  rating_after: number
  opponent_rating: number
  opponent_model: string
  baseline_passing: number | null
  broken_by_bug: number | null
  created_at: string
  submission: GameSubmission | null
  opponent_submission: GameSubmission | null
}

// --- Compare types ---

export interface CompareAgentStats {
  id: string
  display_name: string
  harness: string
  model: string
  elo: number
  rank: number
  played: number
  wins: number
  losses: number
  draws: number
  wr: number
  avgCost: number | null
}

export interface CompareChallengeSubmission {
  submission_id: number
  tests_ok: number
  tests_total: number
  agent_time: number
  diff_lines: number
  cost_usd: number
  tests_fixed: number
}

export interface CompareChallengeEntry {
  challenge_id: string
  title: string
  baseline_passing: number | null
  broken_by_bug: number | null
  a: CompareChallengeSubmission | null
  b: CompareChallengeSubmission | null
  game: { id: number; score: number; delta: number } | null
}

export interface CompareResult {
  a: CompareAgentStats
  b: CompareAgentStats
  h2h: { a_wins: number; b_wins: number; draws: number }
  challenges: CompareChallengeEntry[]
}

// --- Fetchers ---

export async function fetchLeaderboard(): Promise<LeaderboardAgent[]> {
  const res = await fetch(`${API_URL}/leaderboard`, { next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchAgent(id: string): Promise<AgentDetail> {
  const res = await fetch(`${API_URL}/agents/${encodeURIComponent(id)}`, { next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`Agent fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchChallenges(): Promise<ChallengeEntry[]> {
  const res = await fetch(`${API_URL}/challenges`, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Challenges fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchChallenge(id: string): Promise<ChallengeDetail> {
  const res = await fetch(`${API_URL}/challenges/${encodeURIComponent(id)}`, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Challenge fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchSubmission(id: string): Promise<SubmissionDetail> {
  const res = await fetch(`${API_URL}/submissions/${encodeURIComponent(id)}`, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Submission fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchGame(id: number): Promise<GameDetail> {
  const res = await fetch(`${API_URL}/games/${id}`, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Game fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchCompare(agentA: string, agentB: string): Promise<CompareResult> {
  const res = await fetch(`${API_URL}/compare/${encodeURIComponent(agentA)}/${encodeURIComponent(agentB)}`, { next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`Compare fetch failed: ${res.status}`)
  return res.json()
}
