import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { recordSignIn } from '../lib/adminDirectory'
import { AuthContext, type AuthContextValue } from './authContext'

/**
 * Tracks the signed-in Supabase user, if any. When Supabase isn't configured
 * (`enabled: false`), `user` stays null and sign-in/out are no-ops — the rest
 * of the app never has to branch on whether accounts exist.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  // onAuthStateChange also fires for token refreshes, not just genuine
  // sign-ins — only record a directory hit when the signed-in user actually
  // changes, not on every ping.
  const recordedFor = useRef<string | null>(null)

  const maybeRecordSignIn = useCallback((next: User | null) => {
    if (!next || recordedFor.current === next.id) return
    recordedFor.current = next.id
    void recordSignIn()
  }, [])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const nextUser = data.session?.user ?? null
      setUser(nextUser)
      setLoading(false)
      maybeRecordSignIn(nextUser)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      maybeRecordSignIn(nextUser)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [maybeRecordSignIn])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      enabled: isSupabaseConfigured,
      signInWithGoogle,
      signOut,
    }),
    [user, loading, signInWithGoogle, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
