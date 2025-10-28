import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { sqlAgent } from './agents/sql-agent';
import { databaseQueryWorkflow } from './workflows/database-query-workflow';
import { metricsAgent } from './agents/metrics-agent';

export const mastra = new Mastra({
  agents: { sqlAgent, metricsAgent },
  workflows: {
    databaseQueryWorkflow,
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ':memory:',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: {
    default: {
      enabled: true,
    },
  },
});
