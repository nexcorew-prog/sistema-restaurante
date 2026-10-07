import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { ingredients } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireUser()
    const rows = await getDb()
      .select({ id: ingredients.id, name: ingredients.name })
      .from(ingredients)
      .orderBy(asc(ingredients.name))
    return NextResponse.json(rows)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const [item] = await getDb()
      .insert(ingredients)
      .values({
        name: requiredText(body.name, 'El nombre'),
        unit: 'unidad',
        stock: '0',
        lowStock: '0',
      })
      .returning({ id: ingredients.id, name: ingredients.name })
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El ingrediente no es válido.', 400)
    const [item] = await getDb()
      .update(ingredients)
      .set({
        name: requiredText(body.name, 'El nombre'),
      })
      .where(eq(ingredients.id, id))
      .returning({ id: ingredients.id, name: ingredients.name })
    if (!item) throw new HttpError('No se encontró el ingrediente.', 404)
    return NextResponse.json(item)
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El ingrediente no es válido.', 400)
    const [item] = await getDb().delete(ingredients).where(eq(ingredients.id, id)).returning({ id: ingredients.id })
    if (!item) throw new HttpError('No se encontró el ingrediente.', 404)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return apiError(error)
  }
}
