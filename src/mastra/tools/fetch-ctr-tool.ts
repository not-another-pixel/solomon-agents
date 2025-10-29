import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { closeConnection, setupDB } from '../../../lib/dal/db/setup';
import { fetchHighCTRData, fetchLowCTRData } from '../../../lib/dal/db/queries';

export const fetchCTRTool = createTool({
    id: 'fetch-CTR-tool',
    inputSchema: z.object({
        company_id: z.string().describe('Company ID of the client that is executing the query'),
    }),
    description: 'Executes SQL queries against a PostgreSQL database about the CTR',
    execute: async ({ context: { company_id } }) => {
        setupDB();

        try {
            console.log('🔌 Connecting to PostgreSQL for query execution...');

            const high_CTRData = await fetchHighCTRData(company_id);
            const low_CTRData = await fetchLowCTRData(company_id);

            return {
                success: true,
                company_id,
                high_CTRData,
                low_CTRData
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to fetch CTR data: ${error instanceof Error ? error.message : String(error)}`,
            };
        } finally {
            await closeConnection();
        }
    },
});

