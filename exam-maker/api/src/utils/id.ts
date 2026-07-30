import crypto from 'crypto'

export function generateId(): string {
  return crypto.randomBytes(12).toString('hex')
}
