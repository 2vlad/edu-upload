"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { supabase, isSupabaseConfigured } from "./supabaseClient"
import type { User, Session } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAnonymous: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  openAuthDialog: () => void
  closeAuthDialog: () => void
  isAuthDialogOpen: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: new Error("Supabase не настроен") }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { error }
    }

    return { error: null }
  }

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: new Error("Supabase не настроен") }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      return { error }
    }

    return { error: null }
  }

  const signOutUser = async () => {
    if (!isSupabaseConfigured() || !supabase) {
      return
    }

    await supabase.auth.signOut()
  }

  const openAuthDialog = () => setIsAuthDialogOpen(true)
  const closeAuthDialog = () => setIsAuthDialogOpen(false)

  const isAnonymous = user?.is_anonymous ?? false

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAnonymous,
        signIn,
        signUp,
        signOut: signOutUser,
        openAuthDialog,
        closeAuthDialog,
        isAuthDialogOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
