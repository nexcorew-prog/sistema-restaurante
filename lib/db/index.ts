import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Database = PostgresJsDatabase<typeof schema>

const globalForDb = globalThis as typeof globalThis & {
  restaurantDb?: Database
  restaurantSql?: ReturnType<typeof postgres>
}

export function getDb(): Database {
  if (globalForDb.restaurantDb) return globalForDb.restaurantDb

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL.')
  }

  const sql =
    globalForDb.restaurantSql ??
    postgres(connectionString, {
      max: 1,
      prepare: false,
      idle_timeout: 10,
      max_lifetime: 60,
      connect_timeout: 10,
      ssl: databaseSslOptions(),
    })
  globalForDb.restaurantSql = sql
  globalForDb.restaurantDb = drizzle(sql, { schema })
  return globalForDb.restaurantDb
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
