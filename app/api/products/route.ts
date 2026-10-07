import { asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, moneyToCents, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { ingredients, productIngredients, products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

async function validateIngredientIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new HttpError('Selecciona una lista válida de ingredientes.', 400)
  }
  const seen = new Set<number>()
  const ingredientIds = value.map(raw => {
    const ingredientId =
      typeof raw === 'number'
        ? raw
        : raw && typeof raw === 'object' && !Array.isArray(raw)
          ? Number((raw as Record<string, unknown>).ingredientId)
          : NaN
    if (!Number.isSafeInteger(ingredientId) || ingredientId < 1 || seen.has(ingredientId)) {
      throw new HttpError('Revisa la selección de ingredientes; no debe haber ingredientes repetidos.', 400)
    }
    seen.add(ingredientId)
    return ingredientId
  })
  if (ingredientIds.length) {
    const found = await getDb()
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(inArray(ingredients.id, ingredientIds))
    if (found.length !== ingredientIds.length) throw new HttpError('Un ingrediente seleccionado ya no existe.', 409)
  }
  return ingredientIds
}

async function withRecipe(rows: (typeof products.$inferSelect)[]) {
  if (!rows.length) return []
  const recipeRows = await getDb()
    .select({
      productId: productIngredients.productId,
      ingredientId: ingredients.id,
      name: ingredients.name,
    })
    .from(productIngredients)
    .innerJoin(ingredients, eq(productIngredients.ingredientId, ingredients.id))
    .where(inArray(productIngredients.productId, rows.map(product => product.id)))
    .orderBy(asc(ingredients.name))
  const byProduct = new Map<number, typeof recipeRows>()
  for (const row of recipeRows) {
    const items = byProduct.get(row.productId) ?? []
    items.push(row)
    byProduct.set(row.productId, items)
  }
  return rows.map(product => {
    const recipe = (byProduct.get(product.id) ?? []).map(({ productId: _productId, ...item }) => item)
    return {
      ...product,
      price: product.priceCents / 100,
      ingredients: recipe.map(item => item.name),
      recipe,
    }
  })
}

export async function GET() {
  try {
    await requireUser()
    const rows = await getDb().select().from(products).orderBy(asc(products.name))
    return NextResponse.json(await withRecipe(rows))
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const name = requiredText(body.name, 'El nombre')
    const category = requiredText(body.category, 'La categoría', 60)
    const priceCents = moneyToCents(body.price)
    const ingredientIds = await validateIngredientIds(body.ingredientIds ?? body.recipe)
    const created = await getDb().transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({ name, category, priceCents, available: body.available !== false })
        .returning()
      if (ingredientIds.length) {
        await tx.insert(productIngredients).values(
          ingredientIds.map(ingredientId => ({ productId: product.id, ingredientId, quantity: null })),
        )
      }
      return product
    })
    return NextResponse.json((await withRecipe([created]))[0], { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const body = await readObject(request)
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El producto no es válido.', 400)
    const name = requiredText(body.name, 'El nombre')
    const category = requiredText(body.category, 'La categoría', 60)
    const priceCents = moneyToCents(body.price)
    const ingredientIds = await validateIngredientIds(body.ingredientIds ?? body.recipe)
    const updated = await getDb().transaction(async tx => {
      const [product] = await tx
        .update(products)
        .set({ name, category, priceCents, available: body.available !== false, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning()
      if (!product) throw new HttpError('No se encontró el producto.', 404)
      await tx.delete(productIngredients).where(eq(productIngredients.productId, id))
      if (ingredientIds.length) {
        await tx.insert(productIngredients).values(
          ingredientIds.map(ingredientId => ({ productId: product.id, ingredientId, quantity: null })),
        )
      }
      return product
    })
    return NextResponse.json((await withRecipe([updated]))[0])
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El producto no es válido.', 400)
    const [product] = await getDb().delete(products).where(eq(products.id, id)).returning({ id: products.id })
    if (!product) throw new HttpError('No se encontró el producto.', 404)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return apiError(error)
  }
}
