import { Pool } from "pg";

let pool: Pool | null = null;
const allowedSchemas = ["_marts", "internal", "raw_data"];
export function setupDB() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        console.log("✅ PostgreSQL pool created");
    }
    return pool;
}

''
export async function closeConnection() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log("🧹 PostgreSQL pool closed");
    }
}

export async function queryWithinSchema(
    schema: string,
    query: string,
    params?: any[]
) {
    if (!pool) throw new Error("❌ PostgreSQL pool not initialized");

    const client = await pool.connect();
    try {
        const safeSchema = schema.replace(/"/g, '""');
        if (!allowedSchemas.includes(safeSchema)) {
            throw new Error(`❌ Schema "${safeSchema}" is not allowed`);
        }
        await client.query(`SET search_path TO "${safeSchema}";`);
        const result = await client.query(query, params);
        return result;
    } finally {
        client.release();
    }
}


