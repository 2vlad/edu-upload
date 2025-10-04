import { supabase } from './supabaseClient'

/**
 * Ensures user is authenticated (anonymous or regular).
 * Checks for existing session first to avoid creating duplicate anonymous users.
 * @returns The current session or throws an error
 */
export async function ensureAuth() {
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
 * Gets the current user ID (works for both anonymous and regular users)
 * @returns The user ID or null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

/**
 * Checks if the current user is anonymous
 * @returns True if user is anonymous, false otherwise
 */
export async function isAnonymousUser(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.is_anonymous ?? false
}

/**
 * Signs out the current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(`Failed to sign out: ${error.message}`)
  }
}
