import postgres from 'postgres'
import { config } from 'dotenv'
import { hashPassword } from '@/lib/password'

config({ path: '.env.local' })
config()

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database.')
}

const sql = postgres(connectionString, {
  max: 1,
  ssl: databaseSslOptions(),
})

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

async function seed() {
  try {
    await sql.begin(async transaction => {
      await transaction`
        INSERT INTO settings (key, value)
        VALUES
          ('name', 'RESTAURANTE'),
          ('address', ''),
          ('phone', ''),
          ('currency', 'BOB')
        ON CONFLICT (key) DO NOTHING
      `
      const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
      const password = process.env.INITIAL_ADMIN_PASSWORD
      if (email || password) {
        if (!email || !password || password.length < 12 || password.length > 128) {
          throw new Error('Set INITIAL_ADMIN_EMAIL and a 12–128 character INITIAL_ADMIN_PASSWORD together.')
        }
        const existing = await transaction`
          SELECT id FROM users WHERE email = ${email} LIMIT 1
        `
        if (existing.length === 0) {
          const name = process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador'
          const username =
            process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase() ||
            `${email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 54) || 'admin'}.admin`
          if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
            throw new Error('INITIAL_ADMIN_USERNAME must be 3–64 characters: letters, numbers, dots, hyphens, or underscores.')
          }
          const passwordHash = await hashPassword(password)
          await transaction`
            INSERT INTO users (name, username, email, password_hash, role, active)
            VALUES (${name}, ${username}, ${email}, ${passwordHash}, 'admin', true)
          `
          console.info(`Initial admin created for ${email} with username ${username}.`)
        } else {
          console.info(`Admin account ${email} already exists; its password was not changed.`)
        }
      } else {
        console.info('No initial admin created. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD before seeding.')
      }
    })
    console.info('Restaurant settings initialized. No sample sales or stock were created.')
  } finally {
    await sql.end()
  }
}

void seed()
