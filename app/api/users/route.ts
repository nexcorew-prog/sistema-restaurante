import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { getDb } from '@/lib/db'
import { userSessions, users } from '@/lib/db/schema'
import { apiError, HttpError, readObject, requiredText } from '@/lib/http'

export const dynamic = 'force-dynamic'

function validateRole(value: unknown): 'admin' | 'cashier' {
  if (value !== 'admin' && value !== 'cashier') throw new HttpError('Selecciona un rol válido.', 400)
  return value
}

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new HttpError('La contraseña debe tener entre 12 y 128 caracteres.', 400)
  }
  return value
}

export async function GET() {
  try {
    await requireAdmin()
    const rows = await getDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.name)
    return NextResponse.json(rows)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const name = requiredText(body.name, 'El nombre')
    if (
      typeof body.email !== 'string' ||
      body.email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    ) {
      throw new HttpError('Ingresa un correo electrónico válido.', 400)
    }
    const role = validateRole(body.role)
    const [user] = await getDb()
      .insert(users)
      .values({
        name,
        email: body.email.trim().toLowerCase(),
        role,
        passwordHash: await hashPassword(validatePassword(body.password)),
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
      })
    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const current = await requireAdmin()
    const body = await readObject(request)
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El usuario no es válido.', 400)
    const name = requiredText(body.name, 'El nombre')
    const role = validateRole(body.role)
    if (typeof body.active !== 'boolean') throw new HttpError('El estado de la cuenta no es válido.', 400)
    const active = body.active
    const password = body.password === '' || body.password === undefined ? null : validatePassword(body.password)
    if (id === current.id && (!active || role !== 'admin')) {
      throw new HttpError('No puedes desactivar ni quitar el rol de administrador de tu propia cuenta.', 409)
    }
    const passwordHash = password ? await hashPassword(password) : undefined
    const db = getDb()
    const user = await db.transaction(async tx => {
      const [target] = await tx.select().from(users).where(eq(users.id, id)).for('update')
      if (!target) throw new HttpError('No se encontró el usuario.', 404)
      if (target.role === 'admin' && target.active && (role !== 'admin' || !active)) {
        const activeAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'admin'), eq(users.active, true)))
          .for('update')
        if (activeAdmins.length <= 1) throw new HttpError('Debe quedar al menos un administrador activo.', 409)
      }
      const [updated] = await tx
        .update(users)
        .set({
          name,
          role,
          active,
          ...(passwordHash ? { passwordHash } : {}),
        })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
        })
      if (id !== current.id && (!active || role !== target.role || passwordHash)) {
        await tx.delete(userSessions).where(eq(userSessions.userId, id))
      }
      return updated
    })
    return NextResponse.json(user)
  } catch (error) {
    return apiError(error)
  }
}
