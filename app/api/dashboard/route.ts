import { and, asc, gte, inArray, isNull, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { apiError } from '@/lib/http'
import { getDb } from '@/lib/db'
import { cashSessions, ingredients, saleItems, sales } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

function boliviaDayStart(date = new Date()) {
  const local = new Date(date.getTime() - 4 * 60 * 60 * 1000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4))
}

export async function GET(request: Request) {
  try {
    await requireUser()
    const url = new URL(request.url)
    const range = url.searchParams.get('range') ?? 'today'
    const now = new Date()
    const dayStart = boliviaDayStart(now)
    const start =
      range === 'week'
        ? new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
        : range === 'month'
          ? new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1, 4))
          : dayStart
    const db = getDb()
    const records = await db
      .select()
      .from(sales)
      .where(and(gte(sales.createdAt, start), lt(sales.createdAt, now)))
      .orderBy(asc(sales.createdAt))
    const ids = records.map(record => record.id)
    const filteredLines = ids.length
      ? await db.select().from(saleItems).where(inArray(saleItems.saleId, ids))
      : []
    const totalCents = records.reduce((sum, record) => sum + record.totalCents, 0)
    const countsByProduct = new Map<string, number>()
    const hours = Array.from({ length: 16 }, (_, index) => ({
      hour: index + 8,
      totalCents: 0,
    }))
    for (const record of records) {
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
    for (const line of filteredLines) {
      countsByProduct.set(line.name, (countsByProduct.get(line.name) ?? 0) + line.quantity)
    }
    const [activeSession] = await db
      .select()
      .from(cashSessions)
      .where(isNull(cashSessions.closedAt))
      .limit(1)
    const lowStockItems = await db.select().from(ingredients)
    const sortedProducts = [...countsByProduct].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return NextResponse.json({
      range,
      total: totalCents / 100,
      orderCount: records.length,
      itemCount: filteredLines.reduce((sum, item) => sum + item.quantity, 0),
      average: records.length ? totalCents / records.length / 100 : 0,
      bestSeller: sortedProducts[0] ? { name: sortedProducts[0][0], quantity: sortedProducts[0][1] } : null,
      topProducts: sortedProducts.map(([name, quantity]) => ({ name, quantity })),
      hourlySales: hours.map(item => ({ hour: item.hour, total: item.totalCents / 100 })),
      lowStockCount: lowStockItems.filter(item => Number(item.stock) <= Number(item.lowStock)).length,
      cashOpen: Boolean(activeSession),
      recentSales: records.slice(-5).reverse().map(record => ({
        id: record.id,
        createdAt: record.createdAt,
        total: record.totalCents / 100,
        paymentMethod: record.paymentMethod,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}
