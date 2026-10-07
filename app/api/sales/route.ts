import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { apiError, HttpError, moneyToCents, readObject } from '@/lib/http'
import { getDb } from '@/lib/db'
import {
  cashMovements,
  cashSessions,
  ingredients,
  productIngredients,
  products,
  saleItems,
  sales,
} from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

function boliviaDayStart(date = new Date()) {
  const local = new Date(date.getTime() - 4 * 60 * 60 * 1000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4))
}

export async function GET(request: Request) {
  try {
    await requireUser()
    const url = new URL(request.url)
    const startParam = url.searchParams.get('start')
    const endParam = url.searchParams.get('end')
    const start = startParam ? new Date(startParam) : boliviaDayStart()
    const end = endParam ? new Date(endParam) : new Date()
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      throw new HttpError('El rango de fechas no es válido.', 400)
    }
    const db = getDb()
    const records = await db
      .select()
      .from(sales)
      .where(and(gte(sales.createdAt, start), lt(sales.createdAt, end)))
      .orderBy(desc(sales.createdAt))
      .limit(500)
    const ids = records.map(record => record.id)
    const lines = ids.length
      ? await db.select().from(saleItems).where(inArray(saleItems.saleId, ids))
      : []
    const grouped = new Map<number, typeof lines>()
    for (const line of lines) {
      const items = grouped.get(line.saleId) ?? []
      items.push(line)
      grouped.set(line.saleId, items)
    }
    return NextResponse.json(
      records.map(record => ({
        ...record,
        total: record.totalCents / 100,
        subtotal: record.subtotalCents / 100,
        cashReceived: record.cashReceivedCents === null ? null : record.cashReceivedCents / 100,
        change: record.changeCents / 100,
        items: (grouped.get(record.id) ?? []).map(item => ({
          ...item,
          unitPrice: item.unitPriceCents / 100,
          total: (item.unitPriceCents * item.quantity) / 100,
        })),
      })),
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const cashier = await requireUser()
    const body = await readObject(request)
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      throw new HttpError('Agrega entre 1 y 100 productos a la venta.', 400)
    }
    const items = body.items.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new HttpError('Una línea de la venta no es válida.', 400)
      }
      const item = raw as Record<string, unknown>
      const productId = Number(item.productId)
      const quantity = Number(item.quantity)
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
        throw new HttpError('La cantidad o el producto no son válidos.', 400)
      }
      if (
        (item.excludedIngredients !== undefined &&
          (!Array.isArray(item.excludedIngredients) ||
            item.excludedIngredients.some(ingredient => typeof ingredient !== 'string'))) ||
        (item.note !== undefined && typeof item.note !== 'string')
      ) {
        throw new HttpError('La personalización del producto no es válida.', 400)
      }
      return {
        productId,
        quantity,
        excludedIngredients: (item.excludedIngredients as string[] | undefined) ?? [],
        note: typeof item.note === 'string' ? item.note.trim().slice(0, 500) : null,
      }
    })
    const paymentMethod = body.paymentMethod
    if (!['cash', 'qr', 'card', 'transfer'].includes(String(paymentMethod))) {
      throw new HttpError('Selecciona un método de pago válido.', 400)
    }
    const serviceType = body.serviceType
    if (serviceType !== 'takeaway' && serviceType !== 'dine_in') {
      throw new HttpError('Selecciona si el pedido es para llevar o para comer aquí.', 400)
    }
    const customerName =
      typeof body.customerName === 'string' ? body.customerName.trim() : ''
    if (!customerName || customerName.length > 120) {
      throw new HttpError('Escribe el nombre para llamar al cliente (máximo 120 caracteres).', 400)
    }
    const tableNumber =
      typeof body.tableNumber === 'string' ? body.tableNumber.trim() : ''
    if (
      (serviceType === 'dine_in' && (!tableNumber || tableNumber.length > 30)) ||
      (serviceType === 'takeaway' && tableNumber)
    ) {
      throw new HttpError(
        serviceType === 'dine_in'
          ? 'Escribe la mesa para el pedido que se comerá aquí.'
          : 'Los pedidos para llevar no deben tener una mesa.',
        400,
      )
    }
    if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)) {
      throw new HttpError('El identificador de la venta no es válido.', 400)
    }
    const requestId = body.requestId

    const result = await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`)
      const [previousSale] = await tx
        .select()
        .from(sales)
        .where(eq(sales.idempotencyKey, requestId))
        .limit(1)
      if (previousSale) {
        const previousItems = await tx
          .select()
          .from(saleItems)
          .where(eq(saleItems.saleId, previousSale.id))
        return {
          id: previousSale.id,
          createdAt: previousSale.createdAt,
          serviceType: previousSale.serviceType,
          customerName: previousSale.customerName,
          tableNumber: previousSale.tableNumber,
          subtotal: previousSale.subtotalCents / 100,
          total: previousSale.totalCents / 100,
          paymentMethod: previousSale.paymentMethod,
          cashReceived:
            previousSale.cashReceivedCents === null ? null : previousSale.cashReceivedCents / 100,
          change: previousSale.changeCents / 100,
          items: previousItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPriceCents / 100,
            total: (item.unitPriceCents * item.quantity) / 100,
            excludedIngredients: item.excludedIngredients,
            note: item.note,
          })),
          replayed: true,
        }
      }
      const [activeSession] = await tx
        .select()
        .from(cashSessions)
        .where(isNull(cashSessions.closedAt))
        .limit(1)
        .for('update')
      if (!activeSession) throw new HttpError('Abre la caja antes de registrar ventas.', 409)

      const productIds = [...new Set(items.map(item => item.productId))]
      const catalog = await tx.select().from(products).where(inArray(products.id, productIds)).for('update')
      if (catalog.length !== productIds.length || catalog.some(product => !product.available)) {
        throw new HttpError('Un producto ya no está disponible. Actualiza el catálogo e inténtalo otra vez.', 409)
      }
      const byId = new Map(catalog.map(product => [product.id, product]))
      const recipeRows = await tx
        .select({
          productId: productIngredients.productId,
          ingredientId: ingredients.id,
          ingredientName: ingredients.name,
          quantity: productIngredients.quantity,
          stock: ingredients.stock,
        })
        .from(productIngredients)
        .innerJoin(ingredients, eq(productIngredients.ingredientId, ingredients.id))
        .where(inArray(productIngredients.productId, productIds))
        .for('update')
      const needed = new Map<number, { name: string; amount: number; stock: number }>()
      for (const item of items) {
        const recipe = recipeRows.filter(row => row.productId === item.productId)
        const product = byId.get(item.productId)!
        if (item.excludedIngredients.some(name => !recipe.some(row => row.ingredientName === name))) {
          throw new HttpError(`La personalización de "${product.name}" contiene un ingrediente ajeno a la receta.`, 400)
        }
        for (const row of recipe) {
          if (item.excludedIngredients.includes(row.ingredientName)) continue
          const previous = needed.get(row.ingredientId)
          needed.set(row.ingredientId, {
            name: row.ingredientName,
            amount: (previous?.amount ?? 0) + Number(row.quantity) * item.quantity,
            stock: Number(row.stock),
          })
        }
      }
      for (const [ingredientId, requirement] of needed) {
        if (requirement.stock + 0.000001 < requirement.amount) {
          throw new HttpError(
            `Stock insuficiente de ${requirement.name}: disponible ${requirement.stock}, requerido ${requirement.amount}.`,
            409,
          )
        }
        await tx
          .update(ingredients)
          .set({ stock: (requirement.stock - requirement.amount).toFixed(3) })
          .where(eq(ingredients.id, ingredientId))
      }
      const totalCents = items.reduce((sum, item) => {
        return sum + (byId.get(item.productId)?.priceCents ?? 0) * item.quantity
      }, 0)
      if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647) {
        throw new HttpError('El total de la venta supera el máximo permitido.', 400)
      }
      const cashReceivedCents =
        paymentMethod === 'cash' ? moneyToCents(body.cashReceived, 'El efectivo recibido') : null
      if (paymentMethod === 'cash' && (cashReceivedCents === null || cashReceivedCents < totalCents)) {
        throw new HttpError('El efectivo recibido debe cubrir el total de la venta.', 400)
      }
      const changeCents = cashReceivedCents === null ? 0 : cashReceivedCents - totalCents
      const [sale] = await tx
        .insert(sales)
        .values({
          paymentMethod: String(paymentMethod),
          serviceType,
          customerName,
          tableNumber: serviceType === 'dine_in' ? tableNumber : null,
          idempotencyKey: requestId,
          subtotalCents: totalCents,
          totalCents,
          cashReceivedCents,
          changeCents,
          cashSessionId: activeSession.id,
          cashierUserId: cashier.id,
        })
        .returning()
      const savedItems = items.map(item => {
        const product = byId.get(item.productId)!
        return {
          saleId: sale.id,
          productId: product.id,
          name: product.name,
          unitPriceCents: product.priceCents,
          quantity: item.quantity,
          excludedIngredients: item.excludedIngredients,
          note: item.note,
        }
      })
      await tx.insert(saleItems).values(savedItems)
      if (paymentMethod === 'cash') {
        await tx.insert(cashMovements).values({
          cashSessionId: activeSession.id,
          type: 'sale',
          amountCents: totalCents,
          description: `Venta #${sale.id}`,
          userId: cashier.id,
        })
      }
      return {
        id: sale.id,
        createdAt: sale.createdAt,
        serviceType: sale.serviceType,
        customerName: sale.customerName,
        tableNumber: sale.tableNumber,
        subtotal: totalCents / 100,
        total: totalCents / 100,
        paymentMethod: String(paymentMethod),
        cashReceived: cashReceivedCents === null ? null : cashReceivedCents / 100,
        change: changeCents / 100,
        items: savedItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPriceCents / 100,
          total: (item.unitPriceCents * item.quantity) / 100,
          excludedIngredients: item.excludedIngredients,
          note: item.note,
        })),
        replayed: false,
      }
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
