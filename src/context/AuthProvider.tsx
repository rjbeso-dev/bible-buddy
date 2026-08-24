import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { AuthContext, type AuthContextValue } from './authContext'

/**
 * Tracks the signed-in Supabase user, if any. When Supabase isn't configured
 * (`enabled: false`), `user` stays null and sign-in/out are no-ops — the rest
 * of the app never has to branch on whether accounts exist.
 *
 * Directory recording (`recordSignIn`) deliberately isn't done here — it's
 * sequenced inside SyncProvider, ahead of pullAndMerge's page reload. Firing
 * it from here raced against that reload and could get its in-flight
 * request cancelled before it ever reached the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

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
