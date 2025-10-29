import { Company } from '../../types/companies';
import { queryWithinSchema } from './setup';
import { createCTRquery } from './pre-made-query/CTR';
import { CTRResult } from '../../types/CTR-results';

export async function fetchCompanies() {
    const result = await queryWithinSchema('internal', 'SELECT company_id, company FROM Companies');
    return result.rows as Company[];
}

export async function fetchHighCTRData(company_id: string, limit: number = 2) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const weekBefore = new Date(today);
    weekBefore.setDate(today.getDate() - 8);

    const startDate = weekBefore.toISOString().split('T')[0];
    const endDate = yesterday.toISOString().split('T')[0];

    const result = await queryWithinSchema("raw_data", createCTRquery(company_id, startDate, endDate, limit, true));
    return result.rows as CTRResult[];
}

export async function fetchLowCTRData(company_id: string, limit: number = 2) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const weekBefore = new Date(today);
    weekBefore.setDate(today.getDate() - 8);

    const startDate = weekBefore.toISOString().split('T')[0];
    const endDate = yesterday.toISOString().split('T')[0];

    const result = await queryWithinSchema("raw_data", createCTRquery(company_id, startDate, endDate, limit, false));
    return result.rows as CTRResult[];
}
