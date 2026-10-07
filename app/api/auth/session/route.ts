import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await currentUser())
  } catch (error) {
    return apiError(error)
  }
}
