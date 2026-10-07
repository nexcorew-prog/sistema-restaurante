import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { ingredients } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

function quantity(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    throw new HttpError(`${label} debe ser una cantidad válida.`, 400)
  }
  return Math.round(value * 1000) / 1000
}

export async function GET() {
  try {
    await requireUser()
    const rows = await getDb().select().from(ingredients).orderBy(asc(ingredients.name))
    return NextResponse.json(rows.map(row => ({ ...row, stock: Number(row.stock), lowStock: Number(row.lowStock) })))
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    if (body.action === 'adjust-stock') {
      const id = Number(body.id)
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El ingrediente no es válido.', 400)
      if (typeof body.delta !== 'number' || !Number.isFinite(body.delta)) {
        throw new HttpError('El ajuste de stock no es válido.', 400)
      }
      const delta = body.delta
      const updated = await getDb().transaction(async tx => {
        const [current] = await tx.select().from(ingredients).where(eq(ingredients.id, id)).for('update')
        if (!current) throw new HttpError('No se encontró el ingrediente.', 404)
        const stock = quantity(Number(current.stock) + delta, 'El stock')
        const [item] = await tx
          .update(ingredients)
          .set({ stock: stock.toFixed(3) })
          .where(eq(ingredients.id, id))
          .returning()
        return item
      })
      return NextResponse.json({ ...updated, stock: Number(updated.stock), lowStock: Number(updated.lowStock) })
    }

    const [item] = await getDb()
      .insert(ingredients)
      .values({
        name: requiredText(body.name, 'El nombre'),
        unit: requiredText(body.unit, 'La unidad', 24),
        stock: quantity(body.stock ?? 0, 'El stock').toFixed(3),
        lowStock: quantity(body.lowStock ?? 0, 'El mínimo de stock').toFixed(3),
      })
      .returning()
    return NextResponse.json({ ...item, stock: Number(item.stock), lowStock: Number(item.lowStock) }, { status: 201 })
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
        unit: requiredText(body.unit, 'La unidad', 24),
        lowStock: quantity(body.lowStock, 'El mínimo de stock').toFixed(3),
      })
      .where(eq(ingredients.id, id))
      .returning()
    if (!item) throw new HttpError('No se encontró el ingrediente.', 404)
    return NextResponse.json({ ...item, stock: Number(item.stock), lowStock: Number(item.lowStock) })
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
