import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { apiError, HttpError } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser()
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError('El plato no es válido.', 400)
    const [product] = await getDb()
      .select({
        imageData: products.imageData,
        imageContentType: products.imageContentType,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1)
    if (!product?.imageData || !product.imageContentType) {
      throw new HttpError('El plato no tiene una imagen de referencia.', 404)
    }
    return new NextResponse(new Uint8Array(Buffer.from(product.imageData, 'base64')), {
      headers: {
        'Content-Type': product.imageContentType,
        'Cache-Control': 'private, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
