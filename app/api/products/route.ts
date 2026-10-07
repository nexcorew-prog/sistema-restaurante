import { asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, moneyToCents, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { ingredients, productIngredients, products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

async function validateRecipe(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new HttpError('La receta debe incluir una lista válida de ingredientes.', 400)
  }
  const seen = new Set<number>()
  const recipe = value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HttpError('Un ingrediente de la receta no es válido.', 400)
    }
    const item = raw as Record<string, unknown>
    const ingredientId = Number(item.ingredientId)
    const quantity = Number(item.quantity)
    if (
      !Number.isSafeInteger(ingredientId) ||
      ingredientId < 1 ||
      seen.has(ingredientId) ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 1_000_000
    ) {
      throw new HttpError('Revisa las cantidades de la receta; deben ser positivas y no repetirse.', 400)
    }
    seen.add(ingredientId)
    return { ingredientId, quantity: (Math.round(quantity * 1000) / 1000).toFixed(3) }
  })
  if (recipe.length) {
    const found = await getDb()
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(inArray(ingredients.id, recipe.map(item => item.ingredientId)))
    if (found.length !== recipe.length) throw new HttpError('Un ingrediente de la receta ya no existe.', 409)
  }
  return recipe
}

async function withRecipe(rows: (typeof products.$inferSelect)[]) {
  if (!rows.length) return []
  const recipeRows = await getDb()
    .select({
      productId: productIngredients.productId,
      ingredientId: ingredients.id,
      name: ingredients.name,
      unit: ingredients.unit,
      quantity: productIngredients.quantity,
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
    const recipe = (byProduct.get(product.id) ?? []).map(({ productId: _productId, ...item }) => ({
      ...item,
      quantity: Number(item.quantity),
    }))
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
    const recipe = await validateRecipe(body.recipe)
    const created = await getDb().transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({ name, category, priceCents, available: body.available !== false })
        .returning()
      if (recipe.length) {
        await tx.insert(productIngredients).values(
          recipe.map(item => ({ ...item, productId: product.id })),
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
    const recipe = await validateRecipe(body.recipe)
    const updated = await getDb().transaction(async tx => {
      const [product] = await tx
        .update(products)
        .set({ name, category, priceCents, available: body.available !== false, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning()
      if (!product) throw new HttpError('No se encontró el producto.', 404)
      await tx.delete(productIngredients).where(eq(productIngredients.productId, id))
      if (recipe.length) {
        await tx.insert(productIngredients).values(
          recipe.map(item => ({ ...item, productId: product.id })),
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
