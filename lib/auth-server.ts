import { createSupabaseServer } from './supabase/server'
import { isSupabaseConfigured } from './supabaseClient'

/**
 * Server-side authentication utilities using SSR Supabase client
 * Use these functions in Server Components, Server Actions, and Route Handlers
 */

/**
 * Ensures user is authenticated (anonymous or regular) on the server-side.
 * Uses cookie-based session management through SSR client.
 * If Supabase is not configured, returns a mock session.
 * @returns The current session or throws an error
 */
export async function ensureAuthServer() {
  // If Supabase is not configured, return mock session
  if (!isSupabaseConfigured()) {
    return {
      user: {
        id: 'local-user',
        is_anonymous: true,
      },
      access_token: 'mock-token',
    } as any
  }

  const supabase = createSupabaseServer()

  // Check for existing session first
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    throw new Error(`Failed to get session: ${sessionError.message}`)
  }

  // If session exists, return it
  if (session) {
    return session
  }

  // No session exists, create anonymous user
  const { data, error } = await supabase.auth.signInAnonymously()

  if (error) {
    throw new Error(`Failed to sign in anonymously: ${error.message}`)
  }

  if (!data.session) {
    throw new Error('Anonymous sign-in succeeded but no session was created')
  }

  return data.session
}

/**
 * Gets the current user ID on the server-side
 * @returns The user ID or null if not authenticated
 */
export async function getCurrentUserIdServer(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return 'local-user'
  }

  const supabase = createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

/**
 * Checks if the current user is anonymous on the server-side
 * @returns True if user is anonymous, false otherwise
 */
export async function isAnonymousUserServer(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return true
  }

  const supabase = createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.is_anonymous ?? false
}

/**
 * Gets the current session on the server-side
 * @returns The session or null if not authenticated
 */
export async function getSessionServer() {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
