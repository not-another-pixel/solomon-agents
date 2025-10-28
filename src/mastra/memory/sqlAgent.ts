import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

export const SQLmemory = new Memory({
    storage: new LibSQLStore({
        url: 'file:../sql_interactions.db',
    }),
});


