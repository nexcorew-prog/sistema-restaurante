import { asc, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'
import { apiError, HttpError, moneyToCents, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { categories, ingredients, productIngredients, products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_BYTES = 900_000

async function validateCategory(value: unknown) {
  const name = requiredText(value, 'La categoría', 60)
  const [category] = await getDb()
    .select({ name: categories.name })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${name})`)
    .limit(1)
  if (!category) throw new HttpError('La categoría seleccionada ya no existe.', 409)
  return category.name
}

function parseProductImage(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return { imageData: null, imageContentType: null }
  if (typeof value !== 'string') {
    throw new HttpError('La imagen del plato no es válida.', 400)
  }
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new HttpError('La imagen debe ser JPG, PNG o WebP.', 400)
  const imageData = match[2]
  if (Buffer.byteLength(imageData, 'base64') > MAX_IMAGE_BYTES) {
    throw new HttpError('La imagen es demasiado grande. Reduce su tamaño e inténtalo otra vez.', 413)
  }
  return { imageData, imageContentType: match[1] }
}

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

type ProductRow = Pick<
  typeof products.$inferSelect,
  'id' | 'name' | 'category' | 'priceCents' | 'available' | 'createdAt' | 'updatedAt' | 'imageContentType'
>

async function withRecipe(rows: ProductRow[]) {
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
    const { imageContentType, ...productData } = product
    return {
      ...productData,
      price: product.priceCents / 100,
      imageUrl: imageContentType ? `/api/products/${product.id}/image` : null,
      ingredients: recipe.map(item => item.name),
      recipe,
    }
  })
}

export async function GET() {
  try {
    await requireUser()
    const rows = await getDb()
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        priceCents: products.priceCents,
        available: products.available,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        imageContentType: products.imageContentType,
      })
      .from(products)
      .orderBy(asc(products.name))
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
    const category = await validateCategory(body.category)
    const priceCents = moneyToCents(body.price)
    const image = parseProductImage(body.imageData)
    const ingredientIds = await validateIngredientIds(body.ingredientIds ?? body.recipe)
    const created = await getDb().transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({
          name,
          category,
          priceCents,
          available: body.available !== false,
          ...(image ?? { imageData: null, imageContentType: null }),
        })
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
    const category = await validateCategory(body.category)
    const priceCents = moneyToCents(body.price)
    const image = parseProductImage(body.imageData)
    const ingredientIds = await validateIngredientIds(body.ingredientIds ?? body.recipe)
    const updated = await getDb().transaction(async tx => {
      const [product] = await tx
        .update(products)
        .set({
          name,
          category,
          priceCents,
          available: body.available !== false,
          updatedAt: new Date(),
          ...(image ?? {}),
        })
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
