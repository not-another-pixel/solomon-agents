// Here we make premade queries to be used in the application

import { Company } from '../../types/companies';
import { queryWithinSchema } from './setup';

export async function fetchCompanies() {
    const result = await queryWithinSchema('internal', 'SELECT company_id, company FROM Companies');
    return result.rows as Company[];
}


