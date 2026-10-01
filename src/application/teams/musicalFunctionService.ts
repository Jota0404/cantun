import { supabase } from '../../lib/supabase'

export type MusicalFunction = string

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function functions(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((row) => row && typeof row === 'object' && 'musical_function' in row ? [String(row.musical_function)] : [])
}

export async function getMyTeamMusicalFunctions(teamId: string): Promise<string[]> {
  const { data, error } = await requireSupabase().rpc('get_my_team_musical_functions', { p_team_id: teamId })
  if (error) throw error
  return functions(data)
}

export async function setMyTeamMusicalFunctions(teamId: string, musicalFunctions: string[]): Promise<string[]> {
  const { data, error } = await requireSupabase().rpc('set_my_team_musical_functions', {
    p_team_id: teamId,
    p_musical_functions: musicalFunctions,
  })
  if (error) throw error
  return functions(data)
}
