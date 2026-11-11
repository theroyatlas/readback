import { PEOPLE } from '../shared/catalog.ts'
import type { PersonId } from '../shared/types.ts'

export function Avatar({ who, size = 24 }: { who: PersonId | 'agent'; size?: number }) {
  const label = who === 'agent' ? '✦' : PEOPLE[who].name[0]
  return (
    <span className={`avatar avatar-${who}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}>
      {label}
    </span>
  )
}
