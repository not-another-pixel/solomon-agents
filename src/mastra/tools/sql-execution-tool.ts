import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Client } from 'pg';

const createDatabaseConnection = () => {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000, // 30 seconds
    statement_timeout: 60000, // 1 minute
    query_timeout: 60000, // 1 minute
  });
};

const executeQuery = async (client: Client, query: string, params: any[] = []) => {
  try {
    console.log('Executing query:', query, 'Params:', params);
    const result = await client.query(query, params);
    console.log('Query result:', result.rows);
    return result.rows;
  } catch (error) {
    throw new Error(`Failed to execute query: ${error instanceof Error ? error.message : String(error)}`);
  }
};


export const sqlExecutionTool = createTool({
  id: 'sql-execution',
  inputSchema: z.object({
    company_id: z.string().describe('Company ID of the client that is executing the query'),
    query: z.string().describe('SQL query to execute'),
  }),
  description: 'Executes SQL queries against a PostgreSQL database',
  execute: async ({ context: { company_id, query } }) => {
    const client = createDatabaseConnection();

    try {
      console.log('🔌 Connecting to PostgreSQL for query execution...');
      await client.connect();
      console.log('✅ Connected to PostgreSQL for query execution');

      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith('select')) {
        throw new Error('Only SELECT queries are allowed for security reasons');
      }

      // Apply company_id filtering if table includes it (safe append)
      let filteredQuery = query.trim();

      // Detect if the query already contains WHERE (case-insensitive)
      const hasWhere = /\bwhere\b/i.test(filteredQuery);

      // Only append condition if the query doesn't already explicitly reference company_id
      if (!/\bcompany_id\b/i.test(filteredQuery)) {
        filteredQuery += hasWhere
          ? ` AND company_id = $1`
          : ` WHERE company_id = $1`;
      }

      const result = await executeQuery(client, filteredQuery, [company_id]);

      return {
        success: true,
        company_id,
        rowCount: result.length,
        data: result,
        executedQuery: filteredQuery,
      };
    } finally {
      await client.end();
    }
  },
});
