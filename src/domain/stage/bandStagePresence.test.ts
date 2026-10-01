import { describe, expect, it } from 'vitest'
import {
  presenceStateToParticipants,
  toBandStageParticipant,
} from './bandStagePresence'

describe('bandStagePresence', () => {
  it('normalizes readiness and identifies the MD from the snapshot', () => {
    expect(toBandStageParticipant({
      userId: 'u2',
      displayName: ' Pedro ',
      musicalRole: 'bass',
      isMd: false,
      readiness: 'ready',
    }, 'md1')).toEqual({
      userId: 'u2',
      displayName: 'Pedro',
      musicalRole: 'bass',
      isMd: false,
      readiness: 'ready',
    })
  })

  it('defaults missing or invalid readiness to waiting', () => {
    expect(toBandStageParticipant({ userId: 'u2', displayName: 'Pedro', musicalRole: 'bass' }, 'md1')?.readiness).toBe('waiting')
    expect(toBandStageParticipant({ userId: 'u3', displayName: 'Lucas', musicalRole: 'drums', readiness: 'invalid' }, 'md1')?.readiness).toBe('waiting')
  })

  it('keeps one participant per user, prioritizes the MD, then ready participants', () => {
    const participants = presenceStateToParticipants({
      a: [
        { userId: 'u2', displayName: 'Pedro', musicalRole: 'bass', readiness: 'waiting' },
        { userId: 'u2', displayName: 'Pedro', musicalRole: 'bass', readiness: 'ready' },
      ],
      b: [
        { userId: 'u3', displayName: 'Ana', musicalRole: 'vocals', readiness: 'ready' },
        { userId: 'md1', displayName: 'João', musicalRole: 'keys', readiness: 'waiting' },
      ],
    }, 'md1')

    expect(participants).toEqual([
      { userId: 'md1', displayName: 'João', musicalRole: 'keys', isMd: true, readiness: 'waiting' },
      { userId: 'u3', displayName: 'Ana', musicalRole: 'vocals', isMd: false, readiness: 'ready' },
      { userId: 'u2', displayName: 'Pedro', musicalRole: 'bass', isMd: false, readiness: 'ready' },
    ])
  })
})
