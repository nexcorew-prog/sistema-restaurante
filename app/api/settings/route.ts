import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, readObject } from '@/lib/http'
import { getDb } from '@/lib/db'
import { settings } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const settingKeys = ['name', 'address', 'phone', 'currency'] as const

export async function GET() {
  try {
    await requireUser()
    const rows = await getDb().select().from(settings).orderBy(asc(settings.key))
    return NextResponse.json(Object.fromEntries(rows.map(row => [row.key, row.value])))
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const entries = settingKeys.map(key => {
      const value = body[key]
      if (typeof value !== 'string' || value.length > 240) {
        throw new HttpError(`El valor de "${key}" no es válido.`, 400)
      }
      if (key === 'name' && !value.trim()) {
        throw new HttpError('El nombre del restaurante es obligatorio.', 400)
      }
      return { key, value: value.trim() }
    })
    const db = getDb()
    await db.transaction(async tx => {
      for (const entry of entries) {
        await tx
          .insert(settings)
          .values(entry)
          .onConflictDoUpdate({ target: settings.key, set: { value: entry.value } })
      }
    })
    return NextResponse.json(Object.fromEntries(entries.map(entry => [entry.key, entry.value])))
  } catch (error) {
    return apiError(error)
  }
}
