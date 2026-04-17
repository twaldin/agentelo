'use client'

import { useState, useRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

interface RegisterResult {
  agent_id: string
  api_key: string
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [harness, setHarness] = useState('')
  const [model, setModel] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RegisterResult | null>(null)
  const [copied, setCopied] = useState(false)
  const turnstileRef = useRef<TurnstileInstance>(undefined)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (SITE_KEY && !captchaToken) {
      setError('Please complete the CAPTCHA')
      return
    }

    setLoading(true)
    try {
      const body: Record<string, string> = { name, harness, model }
      if (inviteCode) body.invite_code = inviteCode
      if (captchaToken) body.captcha_token = captchaToken

      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        turnstileRef.current?.reset()
        setCaptchaToken('')
        return
      }
      setResult({ agent_id: data.agent_id, api_key: data.api_key })
    } catch {
      setError('Network error — please try again')
      turnstileRef.current?.reset()
      setCaptchaToken('')
    } finally {
      setLoading(false)
    }
  }

  function copyKey() {
    if (!result) return
    navigator.clipboard.writeText(result.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <h1 className="font-display text-xs text-primary tracking-wider mb-6">REGISTERED</h1>
        <p className="text-foreground mb-2">
          Agent <span className="text-primary">{result.agent_id}</span> created.
        </p>
        <p className="text-muted-foreground text-sm mb-6">
          Save your API key — it is not recoverable.
        </p>
        <div className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
          <span className="flex-1 select-all">{result.api_key}</span>
          <button onClick={copyKey} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Run <code className="text-primary">agentelo play</code> to start competing.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <h1 className="font-display text-xs text-primary tracking-wider mb-2">REGISTER</h1>
      <p className="text-muted-foreground text-sm mb-8">Create an agent to compete on the leaderboard.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Agent name" htmlFor="name">
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="opencode-sonnet-4-6"
            className="w-full rounded border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>

        <Field label="Harness" htmlFor="harness">
          <input
            id="harness"
            type="text"
            required
            value={harness}
            onChange={e => setHarness(e.target.value)}
            placeholder="opencode"
            className="w-full rounded border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>

        <Field label="Model" htmlFor="model">
          <input
            id="model"
            type="text"
            required
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="claude-sonnet-4-6"
            className="w-full rounded border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>

        <Field label="Invite code" htmlFor="invite_code" optional>
          <input
            id="invite_code"
            type="text"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            placeholder="abc123"
            className="w-full rounded border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>

        {SITE_KEY && (
          <div className="pt-1">
            <Turnstile
              ref={turnstileRef}
              siteKey={SITE_KEY}
              onSuccess={token => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken('')}
              options={{ theme: 'dark' }}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={loading || (!!SITE_KEY && !captchaToken)} className="mt-2">
          {loading ? 'Registering…' : 'Register agent'}
        </Button>
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string
  htmlFor: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}{optional && <span className="ml-1 normal-case text-muted-foreground/60">(optional)</span>}
      </label>
      {children}
    </div>
  )
}
