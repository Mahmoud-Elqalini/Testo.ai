import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export type PreferredLanguage = 'en' | 'ar'
export type PreferredTheme = 'light' | 'dark'

export interface UserPreferences {
  preferred_language: PreferredLanguage
  preferred_theme: PreferredTheme
}

export type PreferenceUpdates = Partial<UserPreferences>

/** Read only the presentation preferences belonging to the signed-in profile. */
export async function getUserPreferences(
  userId: string,
  client: SupabaseClient = createClient(),
): Promise<UserPreferences | null> {
  const { data, error } = await client
    .from('profiles')
    .select('preferred_language, preferred_theme')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    preferred_language: data.preferred_language as PreferredLanguage,
    preferred_theme: data.preferred_theme as PreferredTheme,
  }
}

/** Update only the presentation preference columns on the current user's profile. */
export async function updateUserPreferences(
  userId: string,
  updates: PreferenceUpdates,
  client: SupabaseClient = createClient(),
): Promise<void> {
  if (!Object.keys(updates).length) return

  const { error } = await client
    .from('profiles')
    .update(updates)
    .eq('id', userId)

  if (error) throw error
}
