import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { databaseIntrospectionTool } from '../tools/database-introspection-tool';
import { sqlGenerationTool } from '../tools/sql-generation-tool';
import { sqlExecutionTool } from '../tools/sql-execution-tool';

import { RuntimeContext } from '@mastra/core/di';
import { metricsAgent } from '../agents/metrics-agent';

// Step 1: Do the introspection
const getDatabaseData = createStep({
  id: 'get-database-data',
  inputSchema: z.object({}),
  outputSchema: z.object({
    company_id: z.string(),
  }),
  resumeSchema: z.object({
    company_id: z.string(),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ resumeData, suspend }) => {
    if (!resumeData?.company_id) {
      await suspend({
        message: 'Please provide your company ID:',
      });

      return {
        company_id: '',
      };
    }

    const { company_id } = resumeData;
    return { company_id };
  },
});


// Step 2: Introspect database
const introspectDatabaseStep = createStep({
  id: 'introspect-database',
  inputSchema: z.object({
    company_id: z.string(),
  }),
  outputSchema: z.object({
    company_id: z.string(),
    schema: z.any(),
    schemaPresentation: z.string(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { company_id } = inputData;

    try {
      // Use the database introspection tool
      if (!databaseIntrospectionTool.execute) {
        throw new Error('Database introspection tool is not available');
      }

      const schemaData = await databaseIntrospectionTool.execute({
        context: { company_id },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard to ensure we have schema data
      if (!schemaData || typeof schemaData !== 'object') {
        throw new Error('Invalid schema data returned from introspection');
      }

      // Create a human-readable presentation
      const schemaPresentation = createSchemaPresentation(schemaData);

      return {
        company_id,
        schema: schemaData,
        schemaPresentation,
      };
    } catch (error) {
      throw new Error(`Failed to introspect database: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

// Step 3: Based on schema, generate metrics that can generate value
const generateMetrics = createStep({
  id: 'generate-metrics',
  inputSchema: z.object({
    company_id: z.string(),
    schema: z.any(),
    schemaPresentation: z.string(),
  }),
  outputSchema: z.object({
    company_id: z.string(),
    schema: z.any(),
    naturalLanguageQuery: z.string(),

  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { company_id, schema, schemaPresentation } = inputData;

    const { text } = await metricsAgent.generate(
      { role: 'user', content: `Based on the following database schema, suggest valuable business metrics that can be derived from the data. Provide the metric in natural language form suitable for SQL query generation.\n\n${schemaPresentation}` }
    )

    return {
      company_id,
      schema,
      naturalLanguageQuery: text,

    };
  },
});


const generateSQLStep = createStep({
  id: 'generate-sql',
  inputSchema: z.object({
    company_id: z.string(),
    schema: z.any(),
    naturalLanguageQuery: z.string(),
  }),
  outputSchema: z.object({
    company_id: z.string(),

    generatedSQL: z.object({
      sql: z.string(),
      explanation: z.string(),
      confidence: z.number(),
      assumptions: z.array(z.string()),
      tables_used: z.array(z.string()),
    }),

  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { company_id, schema, naturalLanguageQuery } = inputData;


    try {
      // Generate SQL from natural language query
      if (!sqlGenerationTool.execute) {
        throw new Error('SQL generation tool is not available');
      }

      const generatedSQL = await sqlGenerationTool.execute({
        context: {
          naturalLanguageQuery,
          databaseSchema: schema,
        },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard for generated SQL
      if (!generatedSQL || typeof generatedSQL !== 'object') {
        throw new Error('Invalid SQL generation result');
      }

      return {
        company_id,
        generatedSQL: generatedSQL as any,

      };
    } catch (error) {
      throw new Error(`Failed to generate SQL: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

// Step 5: Review SQL and execute query
const reviewAndExecuteStep = createStep({
  id: 'review-and-execute',
  inputSchema: z.object({
    company_id: z.string(),
    generatedSQL: z.object({
      sql: z.string(),
      explanation: z.string(),
      confidence: z.number(),
      assumptions: z.array(z.string()),
      tables_used: z.array(z.string()),
    })
  }),
  outputSchema: z.object({
    success: z.boolean(),
    finalSQL: z.string(),
    queryResult: z.any(),
    modifications: z.string().optional(),
    rowCount: z.number().optional(),
    error: z.string().optional(),
  }),
  resumeSchema: z.object({
    approved: z.boolean().optional(),
    modifiedSQL: z.string().optional(),
  }),
  suspendSchema: z.object({
    generatedSQL: z.object({
      sql: z.string(),
      explanation: z.string(),
      confidence: z.number(),
      assumptions: z.array(z.string()),
      tables_used: z.array(z.string()),
    }),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, runtimeContext }) => {
    const { company_id, generatedSQL } = inputData;

    if (!resumeData) {
      await suspend({
        generatedSQL,
        message:
          "Do you want to approve this SQL query or make modifications? (approved: true/false, modifiedSQL: 'your modified query' if needed)",
      });

      return {
        success: false,
        finalSQL: generatedSQL.sql,
        queryResult: null,
      };
    }

    const { approved, modifiedSQL } = resumeData;
    const finalSQL = modifiedSQL || generatedSQL.sql;

    if (!approved) {
      return {
        success: false,
        finalSQL,
        queryResult: null,
        modifications: modifiedSQL ? 'Query was modified but not approved' : 'Query was not approved',
      };
    }

    try {
      // Execute the SQL query
      if (!sqlExecutionTool.execute) {
        throw new Error('SQL execution tool is not available');
      }

      const result = await sqlExecutionTool.execute({
        context: {
          company_id,
          query: finalSQL,
        },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard for execution result
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid SQL execution result');
      }

      const executionResult = result as any;

      return {
        success: executionResult.success || false,
        finalSQL,
        queryResult: executionResult.data || null,
        modifications: modifiedSQL ? 'Query was modified by user' : undefined,
        rowCount: executionResult.rowCount || 0,
      };
    } catch (error) {
      return {
        success: false,
        finalSQL,
        queryResult: null,
        modifications: modifiedSQL ? 'Query was modified by user' : undefined,
        error: `Failed to execute SQL: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// Define the main database query workflow
export const databaseQueryWorkflow = createWorkflow({
  id: 'database-query-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    finalSQL: z.string(),
    queryResult: z.any(),
    modifications: z.string().optional(),
    rowCount: z.number().optional(),
  }),
  steps: [getDatabaseData, introspectDatabaseStep, generateMetrics, generateSQLStep, reviewAndExecuteStep],
});

databaseQueryWorkflow
  .then(getDatabaseData)
  .then(introspectDatabaseStep)
  .then(generateMetrics)
  .then(generateSQLStep)
  .then(reviewAndExecuteStep)
  .commit();

// Helper function to create human-readable schema presentation
function createSchemaPresentation(schema: any): string {
  let presentation = '# Database Schema Overview\n\n';

  presentation += `## Summary\n`;
  presentation += `- **Tables**: ${schema.summary.total_tables}\n`;
  presentation += `- **Columns**: ${schema.summary.total_columns}\n`;
  presentation += `- **Relationships**: ${schema.summary.total_relationships}\n`;
  presentation += `- **Indexes**: ${schema.summary.total_indexes}\n\n`;

  // Group columns by table
  const tableColumns = new Map<string, any[]>();
  schema.columns.forEach((column: any) => {
    const tableKey = `${column.table_schema}.${column.table_name}`;
    if (!tableColumns.has(tableKey)) {
      tableColumns.set(tableKey, []);
    }
    tableColumns.get(tableKey)?.push(column);
  });

  presentation += `## Tables and Columns\n\n`;

  schema.tables.forEach((table: any) => {
    const tableKey = `${table.schema_name}.${table.table_name}`;
    const columns = tableColumns.get(tableKey) || [];
    const rowCount = schema.rowCounts.find(
      (rc: any) => rc.schema_name === table.schema_name && rc.table_name === table.table_name,
    );

    presentation += `### ${table.table_name}`;
    if (rowCount) {
      presentation += ` (${rowCount.row_count.toLocaleString()} rows)`;
    }
    presentation += `\n\n`;

    presentation += `| Column | Type | Nullable | Key | Default |\n`;
    presentation += `|--------|------|----------|-----|----------|\n`;

    columns.forEach((column: any) => {
      const type = column.character_maximum_length
        ? `${column.data_type}(${column.character_maximum_length})`
        : column.data_type;
      const nullable = column.is_nullable === 'YES' ? '✓' : '✗';
      const key = column.is_primary_key ? 'PK' : '';
      const defaultValue = column.column_default || '';

      presentation += `| ${column.column_name} | ${type} | ${nullable} | ${key} | ${defaultValue} |\n`;
    });

    presentation += `\n`;
  });

  if (schema.relationships.length > 0) {
    presentation += `## Relationships\n\n`;
    schema.relationships.forEach((rel: any) => {
      presentation += `- **${rel.table_name}.${rel.column_name}** → **${rel.foreign_table_name}.${rel.foreign_column_name}**\n`;
    });
    presentation += `\n`;
  }

  if (schema.indexes.length > 0) {
    presentation += `## Indexes\n\n`;
    schema.indexes.forEach((index: any) => {
      presentation += `- **${index.table_name}**: ${index.index_name}\n`;
    });
    presentation += `\n`;
  }

  presentation += `---\n\n`;
  presentation += `**Database schema introspection complete!**\n`;
  presentation += `You can now use this information to:\n`;
  presentation += `- Generate SQL queries based on natural language\n`;
  presentation += `- Understand table relationships and structure\n`;
  presentation += `- Analyze data distribution and patterns\n`;

  return presentation;
}
