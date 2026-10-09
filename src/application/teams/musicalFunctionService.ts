import { rpc } from '../../platform/rpc'

export type MusicalFunction = string

function functions(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((row) => row && typeof row === 'object' && 'musical_function' in row ? [String(row.musical_function)] : [])
}

export async function getMyTeamMusicalFunctions(teamId: string): Promise<string[]> {
  return functions(await rpc('get_my_team_musical_functions', { p_team_id: teamId }))
}

export async function setMyTeamMusicalFunctions(teamId: string, musicalFunctions: string[]): Promise<string[]> {
  return functions(await rpc('set_my_team_musical_functions', {
    p_team_id: teamId,
    p_musical_functions: musicalFunctions,
  }))
}
