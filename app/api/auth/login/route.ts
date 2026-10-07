import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import {
  hashSessionToken,
  verifyPassword,
  newSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/lib/auth'
import { getDb } from '@/lib/db'
import { userSessions, users } from '@/lib/db/schema'
import { apiError, HttpError, readObject } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await readObject(request)
    if (
      (typeof body.identifier !== 'string' && typeof body.email !== 'string') ||
      typeof body.password !== 'string' ||
      (typeof body.identifier === 'string' && body.identifier.length > 254) ||
      (typeof body.email === 'string' && body.email.length > 254) ||
      body.password.length > 128
    ) {
      throw new HttpError('Usuario, correo o contraseña incorrectos.', 401)
    }
    const identifier = String(body.identifier ?? body.email).trim().toLowerCase()
    const isEmail = identifier.includes('@')
    const [user] = await getDb()
      .select()
      .from(users)
      .where(
        and(
          isEmail ? eq(users.email, identifier) : eq(users.username, identifier),
          eq(users.active, true),
        ),
      )
      .limit(1)
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError('Usuario, correo o contraseña incorrectos.', 401)
    }
    if (user.role !== 'admin' && user.role !== 'cashier') {
      throw new HttpError('La cuenta no tiene un rol válido.', 403)
    }
    const token = newSessionToken()
    await getDb().insert(userSessions).values({
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
    })
    const response = NextResponse.json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    })
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
    return response
  } catch (error) {
    return apiError(error)
  }
}
