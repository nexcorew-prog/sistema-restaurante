import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { apiError, HttpError, moneyToCents, readObject, requiredText } from '@/lib/http'
import { getDb } from '@/lib/db'
import { cashMovements, cashSessions, sales } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

async function cashSummary(session: typeof cashSessions.$inferSelect) {
  const db = getDb()
  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.cashSessionId, session.id))
    .orderBy(desc(cashMovements.createdAt))
  const payments = await db.select().from(sales).where(eq(sales.cashSessionId, session.id))
  const paymentTotals = payments.reduce(
    (sum, sale) => {
      if (sale.paymentMethod === 'cash') sum.cash += sale.totalCents
      else sum.digital += sale.totalCents
      return sum
    },
    { cash: 0, digital: 0 },
  )
  const additions = movements
    .filter(movement => movement.type === 'deposit')
    .reduce((sum, movement) => sum + movement.amountCents, 0)
  const withdrawals = movements
    .filter(movement => movement.type === 'withdrawal')
    .reduce((sum, movement) => sum + movement.amountCents, 0)
  const expectedCents = session.openingAmountCents + paymentTotals.cash + additions - withdrawals
  return {
    session: {
      ...session,
      openingAmount: session.openingAmountCents / 100,
      countedAmount: session.countedAmountCents === null ? null : session.countedAmountCents / 100,
      expectedAmount: session.expectedAmountCents === null ? expectedCents / 100 : session.expectedAmountCents / 100,
    },
    paymentTotals: { cash: paymentTotals.cash / 100, digital: paymentTotals.digital / 100 },
    expectedAmount: expectedCents / 100,
    salesCount: payments.length,
    movements: movements.map(movement => ({ ...movement, amount: movement.amountCents / 100 })),
  }
}

export async function GET(request: Request) {
  try {
    await requireUser()
    const db = getDb()
    const url = new URL(request.url)
    if (url.searchParams.get('history') === '1') {
      const date = url.searchParams.get('date')
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new HttpError('Selecciona una fecha válida para el historial.', 400)
      }
      const start = new Date(`${date}T04:00:00.000Z`)
      if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date) {
        throw new HttpError('Selecciona una fecha válida para el historial.', 400)
      }
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
      const sessions = await db
        .select()
        .from(cashSessions)
        .where(and(gte(cashSessions.openedAt, start), lt(cashSessions.openedAt, end)))
        .orderBy(desc(cashSessions.openedAt))
        .limit(100)
      return NextResponse.json(await Promise.all(sessions.map(cashSummary)))
    }
    const [active] = await db
      .select()
      .from(cashSessions)
      .where(isNull(cashSessions.closedAt))
      .orderBy(desc(cashSessions.openedAt))
      .limit(1)
    if (active) return NextResponse.json({ open: true, ...(await cashSummary(active)) })
    const [latest] = await db.select().from(cashSessions).orderBy(desc(cashSessions.openedAt)).limit(1)
    return NextResponse.json({ open: false, session: latest ?? null })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await readObject(request)
    const db = getDb()
    if (body.action === 'open') {
      const openingAmountCents = moneyToCents(body.openingAmount, 'El monto inicial')
      const [session] = await db
        .insert(cashSessions)
        .values({ openingAmountCents, openedBy: user.id })
        .returning()
      return NextResponse.json({ id: session.id, open: true }, { status: 201 })
    }
    if (body.action === 'close') {
      const id = Number(body.id)
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('La sesión de caja no es válida.', 400)
      const countedAmountCents = moneyToCents(body.countedAmount, 'El efectivo contado')
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
      const closed = await db.transaction(async tx => {
        const [session] = await tx
          .select()
          .from(cashSessions)
          .where(and(eq(cashSessions.id, id), isNull(cashSessions.closedAt)))
          .limit(1)
          .for('update')
        if (!session) throw new HttpError('La caja ya está cerrada o no existe.', 409)
        const movements = await tx
          .select()
          .from(cashMovements)
          .where(eq(cashMovements.cashSessionId, session.id))
        const sessionSales = await tx.select().from(sales).where(eq(sales.cashSessionId, session.id))
        const cashSalesCents = sessionSales
          .filter(sale => sale.paymentMethod === 'cash')
          .reduce((sum, sale) => sum + sale.totalCents, 0)
        const expectedAmountCents =
          session.openingAmountCents +
          cashSalesCents +
          movements
            .filter(movement => movement.type === 'deposit')
            .reduce((sum, movement) => sum + movement.amountCents, 0) -
          movements
            .filter(movement => movement.type === 'withdrawal')
            .reduce((sum, movement) => sum + movement.amountCents, 0)
        const [result] = await tx
          .update(cashSessions)
          .set({ closedAt: new Date(), countedAmountCents, expectedAmountCents, note, closedBy: user.id })
          .where(eq(cashSessions.id, session.id))
          .returning()
        return { ...result, difference: (countedAmountCents - expectedAmountCents) / 100 }
      })
      return NextResponse.json(closed)
    }
    if (body.action === 'movement') {
      const id = Number(body.id)
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('La sesión de caja no es válida.', 400)
      if (body.type !== 'deposit' && body.type !== 'withdrawal') {
        throw new HttpError('Selecciona un tipo de movimiento válido.', 400)
      }
      const amountCents = moneyToCents(body.amount, 'El monto')
      if (amountCents === 0) throw new HttpError('El monto debe ser mayor a cero.', 400)
      const movement = await db.transaction(async tx => {
        const [session] = await tx
          .select({ id: cashSessions.id })
          .from(cashSessions)
          .where(and(eq(cashSessions.id, id), isNull(cashSessions.closedAt)))
          .limit(1)
          .for('update')
        if (!session) throw new HttpError('No se pueden agregar movimientos a una caja cerrada.', 409)
        const [result] = await tx
          .insert(cashMovements)
          .values({
            cashSessionId: id,
            type: body.type as 'deposit' | 'withdrawal',
            amountCents,
            description: requiredText(body.description, 'La descripción', 240),
            userId: user.id,
          })
          .returning()
        return result
      })
      return NextResponse.json({ ...movement, amount: amountCents / 100 }, { status: 201 })
    }
    throw new HttpError('La acción de caja no es válida.', 400)
  } catch (error) {
    return apiError(error)
  }
}
