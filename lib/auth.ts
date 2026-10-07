import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getDb } from '@/lib/db'
import { userSessions, users } from '@/lib/db/schema'
import { HttpError } from '@/lib/http'
export { hashPassword, verifyPassword } from '@/lib/password'

export const SESSION_COOKIE = 'restaurant_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 10
export type UserRole = 'admin' | 'cashier'
export type AuthUser = { id: number; name: string; username: string; email: string; role: UserRole }

export function newSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const tokenHash = hashSessionToken(token)
  const [record] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      active: users.active,
      tokenHash: userSessions.tokenHash,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date())))
    .limit(1)
  if (!record) return null
  if (!record.active) {
    await getDb().delete(userSessions).where(eq(userSessions.tokenHash, tokenHash))
    return null
  }
  if (record.role !== 'admin' && record.role !== 'cashier') {
    throw new HttpError('La cuenta no tiene un rol válido.', 403)
  }
  return { id: record.id, name: record.name, username: record.username, email: record.email, role: record.role }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser()
  if (!user) throw new HttpError('Inicia sesión para continuar.', 401)
  return user
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== 'admin') throw new HttpError('No tienes permiso para realizar esta acción.', 403)
  return user
}
