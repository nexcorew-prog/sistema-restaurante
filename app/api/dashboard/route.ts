import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { apiError, HttpError } from '@/lib/http'
import { getDb } from '@/lib/db'
import { cashSessions, products, saleItems, sales, users } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

function boliviaDayStart(date = new Date()) {
  const local = new Date(date.getTime() - 4 * 60 * 60 * 1000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4))
}

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError('La fecha del reporte no es válida.', 400)
  }
  const start = new Date(`${value}T04:00:00.000Z`)
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== value) {
    throw new HttpError('La fecha del reporte no es válida.', 400)
  }
  return start
}

export async function GET(request: Request) {
  try {
    await requireUser()
    const url = new URL(request.url)
    const range = url.searchParams.get('range') ?? 'today'
    if (!['today', 'week', 'month'].includes(range)) {
      throw new HttpError('El periodo del reporte no es válido.', 400)
    }
    const now = new Date()
    const dayStart =
      range === 'today'
        ? url.searchParams.has('date')
          ? parseDate(url.searchParams.get('date'))
          : boliviaDayStart(now)
        : boliviaDayStart(now)
    const end = range === 'today' ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) : now
    const start =
      range === 'week'
        ? new Date(boliviaDayStart(now).getTime() - 6 * 24 * 60 * 60 * 1000)
        : range === 'month'
          ? new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1, 4))
          : dayStart
    const db = getDb()
    const records = await db
      .select()
      .from(sales)
      .where(and(gte(sales.createdAt, start), lt(sales.createdAt, end)))
      .orderBy(asc(sales.createdAt))
    const completed = records.filter(record => record.status === 'completed')
    const completedIds = completed.map(record => record.id)
    const [lines, catalog, activeSessions] = await Promise.all([
      completedIds.length
        ? db.select().from(saleItems).where(inArray(saleItems.saleId, completedIds))
        : Promise.resolve([]),
      db.select({ id: products.id, name: products.name, category: products.category }).from(products),
      db.select({ id: cashSessions.id }).from(cashSessions).where(isNull(cashSessions.closedAt)).limit(1),
    ])
    const orderItems = new Map<number, {
      quantity: number
      name: string
      total: number
      excludedIngredients: string[]
      note: string | null
    }[]>()
    for (const line of lines) {
      const items = orderItems.get(line.saleId) ?? []
      items.push({
        quantity: line.quantity,
        name: line.name,
        total: (line.unitPriceCents * line.quantity) / 100,
        excludedIngredients: line.excludedIngredients,
        note: line.note,
      })
      orderItems.set(line.saleId, items)
    }
    const cancelledDetails = await db
      .select({
        id: sales.id,
        createdAt: sales.createdAt,
        cancelledAt: sales.cancelledAt,
        totalCents: sales.totalCents,
        paymentMethod: sales.paymentMethod,
        serviceType: sales.serviceType,
        customerName: sales.customerName,
        tableNumber: sales.tableNumber,
        cancellationReason: sales.cancellationReason,
        cancelledByName: users.name,
      })
      .from(sales)
      .leftJoin(users, eq(sales.cancelledBy, users.id))
      .where(
        and(
          gte(sales.cancelledAt, start),
          lt(sales.cancelledAt, end),
          eq(sales.status, 'cancelled'),
        ),
      )
      .orderBy(asc(sales.cancelledAt))
    const grossCents = completed.reduce((sum, record) => sum + record.subtotalCents, 0)
    const netCents = completed.reduce((sum, record) => sum + record.totalCents, 0)
    const paymentTotals = { cash: 0, qr: 0, card: 0, transfer: 0 }
    const channels = { dineIn: 0, takeaway: 0, unspecified: 0 }
    for (const record of completed) {
      paymentTotals[record.paymentMethod as keyof typeof paymentTotals] += record.totalCents
      if (record.serviceType === 'dine_in') channels.dineIn += record.totalCents
      else if (record.serviceType === 'takeaway') channels.takeaway += record.totalCents
      else channels.unspecified += record.totalCents
    }

    const productStats = new Map<string, { name: string; category: string; quantity: number; totalCents: number }>()
    for (const product of catalog) {
      productStats.set(`id:${product.id}`, { name: product.name, category: product.category, quantity: 0, totalCents: 0 })
    }
    const categoryTotals = new Map<string, number>()
    for (const line of lines) {
      const productKey = line.productId === null
        ? `historical:${line.name}:${line.category}`
        : `id:${line.productId}`
      const stats = productStats.get(productKey) ?? {
        name: line.name,
        category: line.category || 'Sin categoría',
        quantity: 0,
        totalCents: 0,
      }
      stats.quantity += line.quantity
      stats.totalCents += line.unitPriceCents * line.quantity
      stats.name = line.name
      stats.category = line.category || stats.category
      productStats.set(productKey, stats)
      const category = line.category || 'Sin categoría'
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + line.unitPriceCents * line.quantity)
    }
    const allProducts = [...productStats.values()]
    const sortedTopProducts = [...allProducts]
      .filter(product => product.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents)
      .slice(0, 5)
    const sortedLowProducts = [...allProducts]
      .sort((a, b) => a.quantity - b.quantity || a.totalCents - b.totalCents || a.name.localeCompare(b.name))
      .slice(0, 5)
    const hours = Array.from({ length: 16 }, (_, index) => ({ hour: index + 8, totalCents: 0 }))
    for (const record of completed) {
      const hour = Number(
        new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: 'America/La_Paz',
        }).format(record.createdAt),
      )
      const chartIndex = hour - 8
      if (chartIndex >= 0 && chartIndex < hours.length) hours[chartIndex].totalCents += record.totalCents
    }
    return NextResponse.json({
      range,
      date:
        range === 'today'
          ? new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/La_Paz',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(dayStart)
          : null,
      grossSales: grossCents / 100,
      netSales: netCents / 100,
      discounts: Math.max(0, grossCents - netCents) / 100,
      taxes: 0,
      commissions: 0,
      total: netCents / 100,
      orderCount: completed.length,
      cancelledCount: cancelledDetails.length,
      cancelledOrders: cancelledDetails.map(record => ({
        id: record.id,
        createdAt: record.createdAt,
        cancelledAt: record.cancelledAt,
        total: record.totalCents / 100,
        paymentMethod: record.paymentMethod,
        serviceType: record.serviceType,
        customerName: record.customerName,
        tableNumber: record.tableNumber,
        reason: record.cancellationReason ?? '',
        cancelledByName: record.cancelledByName ?? 'Usuario eliminado',
      })),
      itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
      average: completed.length ? netCents / completed.length / 100 : 0,
      paymentTotals: Object.fromEntries(
        Object.entries(paymentTotals).map(([method, amount]) => [method, amount / 100]),
      ),
      channels: Object.fromEntries(
        Object.entries(channels).map(([channel, amount]) => [channel, amount / 100]),
      ),
      bestSeller: sortedTopProducts[0]
        ? { name: sortedTopProducts[0].name, quantity: sortedTopProducts[0].quantity }
        : null,
      topProducts: sortedTopProducts.map(({ name, category, quantity, totalCents }) => ({
        name,
        category,
        quantity,
        total: totalCents / 100,
      })),
      lowProducts: sortedLowProducts.map(({ name, category, quantity, totalCents }) => ({
        name,
        category,
        quantity,
        total: totalCents / 100,
      })),
      categorySales: [...categoryTotals]
        .map(([category, totalCents]) => ({ category, total: totalCents / 100 }))
        .sort((a, b) => b.total - a.total),
      hourlySales: hours.map(item => ({ hour: item.hour, total: item.totalCents / 100 })),
      cashOpen: activeSessions.length > 0,
      recentSales: completed.slice(-5).reverse().map(record => ({
        id: record.id,
        createdAt: record.createdAt,
        total: record.totalCents / 100,
        paymentMethod: record.paymentMethod,
      })),
      reportOrders: completed.map(record => ({
        id: record.id,
        createdAt: record.createdAt,
        items: orderItems.get(record.id) ?? [],
        paymentMethod: record.paymentMethod,
        serviceType: record.serviceType,
        total: record.totalCents / 100,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}
