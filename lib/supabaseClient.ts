import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create Supabase client only if environment variables are configured
let supabaseInstance: SupabaseClient | null = null

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url_here') {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  })
}

export const supabase = supabaseInstance

// Helper to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return supabaseInstance !== null
}
