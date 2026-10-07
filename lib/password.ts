import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const key = (await deriveKey(password, salt, 64)) as Buffer
  return `scrypt:${salt}:${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, encoded] = stored.split(':')
  if (algorithm !== 'scrypt' || !salt || !encoded) return false
  const expected = Buffer.from(encoded, 'base64url')
  if (expected.length !== 64) return false
  const actual = (await deriveKey(password, salt, expected.length)) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
