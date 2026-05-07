import { Pool, QueryResultRow } from 'pg'

const rawConnectionString = process.env.DATABASE_URL || ''
const isSupabaseUrl = /supabase\.co|pooler\.supabase/i.test(rawConnectionString)
const connectionString = isSupabaseUrl ? '' : rawConnectionString

if (isSupabaseUrl) {
  console.warn('[db] Supabase DATABASE_URL detected and ignored. Falling back to local DB_* settings.')
}

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'stirams',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
)

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const result = await pool.query<T>(text, params)
    return result.rows
  } catch (error: any) {
    const message = error?.message || 'Unknown database error'
    throw new Error(
      `Local PostgreSQL operation failed. Verify DATABASE_URL/DB_* for localhost:5432. Original error: ${message}`
    )
  }
}

export async function dbHealthCheck(): Promise<boolean> {
  const rows = await dbQuery<{ ok: number }>('SELECT 1 AS ok')
  return rows.length > 0 && rows[0].ok === 1
}

export { pool }
