import { nanoid } from 'nanoid'

export function newId(prefix?: string): string {
  const id = nanoid(8)
  return prefix ? `${prefix}_${id}` : id
}
