import { config } from 'dotenv'
import postgres from 'postgres'
import { createInterface } from 'node:readline/promises'

config({ path: '.env.local' })
config()

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to reset the database.')
}

function databaseSslOptions() {
  if (process.env.DATABASE_SSL === 'false') return false
  if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_SSL !== 'true') {
    return false
  }
  const ca = process.env.DATABASE_SSL_CA
  return ca
    ? { ca: ca.replaceAll('\\n', '\n'), rejectUnauthorized: true }
    : { rejectUnauthorized: true }
}

function databaseTarget() {
  try {
    const url = new URL(connectionString!)
    return `${url.hostname}/${decodeURIComponent(url.pathname.slice(1))}`
  } catch {
    return 'No se pudo identificar el destino desde DATABASE_URL'
  }
}

async function resetDatabase() {
  if (!process.stdin.isTTY) {
    throw new Error('Ejecuta pnpm resetdb en una terminal interactiva para confirmar el borrado.')
  }

  const client = postgres(connectionString!, {
    max: 1,
    connect_timeout: 10,
    ssl: databaseSslOptions(),
  })

  try {
    const tables = await client<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('users', '__drizzle_migrations')
      ORDER BY tablename
    `

    console.log(`Base de datos destino: ${databaseTarget()}`)
    console.log('Se conservará la tabla users. Se vaciarán estas tablas:')
    if (tables.length) {
      for (const { tablename } of tables) console.log(`  - ${tablename}`)
    } else {
      console.log('  (no se encontraron tablas para vaciar)')
    }
    console.log('También se cerrarán todas las sesiones de usuario y se restablecerán los contadores.')

    const terminal = createInterface({ input: process.stdin, output: process.stdout })
    let confirmation: string
    try {
      confirmation = await terminal.question('Escribe RESET para confirmar: ')
    } finally {
      terminal.close()
    }

    if (confirmation !== 'RESET') {
      console.log('Operación cancelada; no se modificó la base de datos.')
      return
    }
    if (!tables.length) {
      console.log('No hay tablas que vaciar.')
      return
    }

    const names = tables
      .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
      .join(', ')
    await client.begin(async transaction => {
      await transaction.unsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY`)
    })
    console.log(`Base reiniciada. ${tables.length} tablas vaciadas; users se conservó.`)
  } finally {
    await client.end()
  }
}

void resetDatabase().catch(error => {
  console.error('No se pudo reiniciar la base de datos:', error)
  process.exitCode = 1
})
