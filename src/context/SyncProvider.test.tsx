import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue } from './authContext'
import { SyncProvider } from './SyncProvider'

// Full module mocks (not vi.spyOn) so SyncProvider's own named imports
// resolve to these mocks regardless of ESM live-binding quirks.
vi.mock('../lib/cloudSync', () => ({
  pullAndMerge: vi.fn().mockResolvedValue(undefined),
  pushSnapshot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/adminDirectory', () => ({
  recordSignIn: vi.fn().mockResolvedValue(undefined),
}))

import { pullAndMerge } from '../lib/cloudSync'

const mockUser = { id: 'user-1', email: 'a@example.com' } as User

function authValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    loading: false,
    enabled: true,
    signInWithGoogle: async () => {},
    signOut: async () => {},
    ...overrides,
  }
}

function Wrapper({ value }: { value: AuthContextValue }) {
  return (
    <AuthContext value={value}>
      <SyncProvider>{null}</SyncProvider>
    </AuthContext>
  )
}

describe('SyncProvider: reload-loop regression', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(pullAndMerge).mockClear()
    // jsdom doesn't implement navigation — stub it so the effect can settle.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    })
  })

  it('does not re-pull on the reload it triggers, even though auth briefly reports {loading:true, user:null} again first', async () => {
    // 1. Fresh sign-in: loading resolves, user appears — mirrors AuthProvider
    //    going from its initial {loading:true, user:null} to the real state.
    const { rerender, unmount } = render(<Wrapper value={authValue({ loading: true, user: null })} />)
    rerender(<Wrapper value={authValue({ loading: false, user: mockUser })} />)
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1))
    expect(pullAndMerge).toHaveBeenCalledTimes(1)

    // 2. Simulate exactly what a real reload produces: a brand-new component
    //    tree mounting with AuthProvider's actual initial state —
    //    {loading:true, user:null} — before getSession() resolves a moment
    //    later with the same signed-in user. sessionStorage (unlike React
    //    state) survives this, matching a real browser reload.
    unmount()
    const { rerender: rerender2 } = render(<Wrapper value={authValue({ loading: true, user: null })} />)
    rerender2(<Wrapper value={authValue({ loading: false, user: mockUser })} />)

    // Let effects settle. The bug: the loading:true render used to call
    // clearPulledFlags(), wiping the flag pullAndMerge just set — causing a
    // second pull + reload right here, forever.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pullAndMerge).toHaveBeenCalledTimes(1)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
})
