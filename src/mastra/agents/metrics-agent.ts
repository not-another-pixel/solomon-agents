import { Agent } from '@mastra/core/agent';
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { metricDefinitionPrompt } from '../prompts/metric-agent';


export const metricsAgent = new Agent({
    name: "Marketing-Agent",
    instructions: metricDefinitionPrompt,
    model: 'google/gemini-2.5-pro',
    memory: new Memory({
        storage: new LibSQLStore({
            url: 'file:../interactions.db',
        }),
    }),
    tools: {}

})