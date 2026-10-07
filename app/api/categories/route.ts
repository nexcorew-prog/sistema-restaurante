import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { categories } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

function isMissingCategoriesTable(error: unknown) {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '42P01'
  )
}

export async function GET() {
  try {
    await requireUser()
    const rows = await getDb()
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name))
    return NextResponse.json(rows)
  } catch (error) {
    if (isMissingCategoriesTable(error)) {
      return apiError(
        new HttpError('Falta crear la tabla de categorías. Ejecuta pnpm db:migrate y vuelve a intentarlo.', 503),
      )
    }
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const name = requiredText(body.name, 'El nombre de la categoría', 60)
    const [category] = await getDb()
      .insert(categories)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: categories.id, name: categories.name })
    if (!category) throw new HttpError('Ya existe una categoría con ese nombre.', 409)
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    if (isMissingCategoriesTable(error)) {
      return apiError(
        new HttpError('Falta crear la tabla de categorías. Ejecuta pnpm db:migrate y vuelve a intentarlo.', 503),
      )
    }
    return apiError(error)
  }
}
