import { Agent } from '@mastra/core/agent';


import { sqlAgentPrompt } from '../prompts/sql-prompt';
import { SQLmemory } from '../memory/sqlAgent';
import { databaseIntrospectionTool } from '../tools/database-introspection-tool';
import { sqlGenerationTool } from '../tools/sql-generation-tool';
import { sqlExecutionTool } from '../tools/sql-execution-tool';

// Initialize memory with LibSQLStore for persistence


export const sqlAgent = new Agent({
    name: 'SQL Agent',
    instructions: sqlAgentPrompt,
    model: 'google/gemini-2.5-pro',
    tools: {
        databaseIntrospectionTool,
        sqlGenerationTool,
        sqlExecutionTool,
    },
    memory: SQLmemory,
});
