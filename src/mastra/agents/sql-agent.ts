import { Agent } from '@mastra/core/agent';

import { openai } from '@ai-sdk/openai';
import { sqlAgentPrompt } from '../prompts/sql-prompt';
import { SQLmemory } from '../memory/sqlAgent';
import { databaseIntrospectionTool } from '../tools/database-introspection-tool';
import { sqlGenerationTool } from '../tools/sql-generation-tool';
import { sqlExecutionTool } from '../tools/sql-execution-tool';

// Initialize memory with LibSQLStore for persistence


export const sqlAgent = new Agent({
    name: 'SQL Agent',
    instructions: sqlAgentPrompt,
    model: openai('gpt-4.1-mini'),
    tools: {
        databaseIntrospectionTool,
        sqlGenerationTool,
        sqlExecutionTool,
    },
    memory: SQLmemory,
});
