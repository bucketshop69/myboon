'use client'

import { FormEvent, useState } from 'react'
import styles from './styles.module.css'

interface LoginPanelProps {
  isConfigured: boolean
}

export function LoginPanel({ isConfigured }: LoginPanelProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/internal/entities/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unable to open internal browser' })) as { error?: string }
        setError(body.error ?? 'Unable to open internal browser')
        return
      }

      window.location.reload()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginPanel}>
        <div className={styles.loginMark}>m</div>
        <p className={styles.kicker}>Internal memory browser</p>
        <h1 className={styles.loginTitle}>Open entity folders</h1>
        <p className={styles.loginCopy}>
          Enter the internal dashboard token to inspect saved entity memories.
        </p>

        {!isConfigured ? (
          <div className={styles.loginError}>
            Internal access is not configured for the web app.
          </div>
        ) : null}

        <form className={styles.loginForm} onSubmit={submit}>
          <label className={styles.loginLabel} htmlFor="internal-token">Dashboard token</label>
          <input
            id="internal-token"
            className={styles.loginInput}
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            disabled={!isConfigured || isSubmitting}
          />
          {error ? <div className={styles.loginError}>{error}</div> : null}
          <button className={styles.loginButton} type="submit" disabled={!isConfigured || isSubmitting || !token.trim()}>
            {isSubmitting ? 'Opening...' : 'Open browser'}
          </button>
        </form>
      </section>
    </main>
  )
}
