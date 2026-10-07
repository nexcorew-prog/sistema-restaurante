import { NextResponse } from 'next/server'

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new HttpError('El cuerpo de la solicitud no es un JSON válido.', 400)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('Se esperaba un objeto JSON.', 400)
  }
  return value as Record<string, unknown>
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === '23505' || error.code === '23503')
  ) {
    return NextResponse.json(
      { error: 'La operación entra en conflicto con datos existentes. Actualiza la pantalla e inténtalo otra vez.' },
      { status: 409 },
    )
  }
  console.error(
    'API request failed:',
    error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown server error',
  )
  return NextResponse.json({ error: 'Ocurrió un error interno. Inténtalo de nuevo.' }, { status: 500 })
}

export function requiredText(value: unknown, label: string, maxLength = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(`${label} es obligatorio y no puede exceder ${maxLength} caracteres.`, 400)
  }
  return value.trim()
}

export function moneyToCents(value: unknown, label = 'El precio'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new HttpError(`${label} debe ser un importe válido.`, 400)
  }
  return Math.round(value * 100)
}
