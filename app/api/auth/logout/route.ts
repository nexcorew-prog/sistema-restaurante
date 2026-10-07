import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { hashSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { userSessions } from '@/lib/db/schema'
import { apiError } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (token) {
      await getDb()
        .delete(userSessions)
        .where(eq(userSessions.tokenHash, hashSessionToken(token)))
    }
    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return response
  } catch (error) {
    return apiError(error)
  }
}
