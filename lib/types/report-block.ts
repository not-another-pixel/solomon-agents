// report-schema.ts
import { z } from "zod";

/* ---------- Leaf Schemas ---------- */

export const PerformanceAdDataSchema = z.object({
    name: z.string(),
    id: z.string(),
    copy: z.string().optional(),
    ctr: z.string().optional(),
    roas: z.string().optional(),
    spent: z.string().optional(),
    explanation: z.string().optional(),
});

export const MetricDataSchema = z.object({
    title: z.string(),
    value: z.string(),
    change: z.string().optional(),
    trend: z.enum(["up", "down", "neutral"]).optional(),
    description: z.string().optional(),
    type: z.enum(["success", "fail"]).optional(),
});

export const ComparisonDataSchema = z.object({
    aspect: z.string(),
    highPerformers: z.string(),
    lowPerformers: z.string(),
});

export const WhyWorksDataSchema = z.object({
    title: z.string(),
    description: z.string(),
});

/* ---------- Main ReportBlock Schema (Simplificado) ---------- */

export const ReportBlockSchema = z.discriminatedUnion("type", [
    // Header
    z.object({
        type: z.literal("header"),
        title: z.string(),
        subtitle: z.string().optional(),
        period: z.string().optional(),
        preparedAt: z.string().optional(),
    }),

    // Metrics
    z.object({
        type: z.literal("metrics"),
        title: z.string().optional(),
        metrics: z.array(MetricDataSchema).min(1),
    }),

    // Performance Table
    z.object({
        type: z.literal("performance_table"),
        title: z.string().optional(),
        performanceData: z.array(PerformanceAdDataSchema).min(1),
    }),

    // Comparison Table
    z.object({
        type: z.literal("comparison_table"),
        title: z.string().optional(),
        comparisonData: z.array(ComparisonDataSchema).min(1),
    }),

    // Insight Card
    z.object({
        type: z.literal("insight_card"),
        title: z.string().optional(),
        insights: z.array(z.string()).min(1),
        insightType: z.enum(["success", "warning", "info", "recommendation"]),
    }),

    // Why Works Section
    z.object({
        type: z.literal("why_works_section"),
        title: z.string().optional(),
        whyWorksData: z.array(WhyWorksDataSchema).min(1),
    }),

    // Bullets Card
    z.object({
        type: z.literal("bullets_card"),
        title: z.string().optional(),
        items: z.array(z.string()).min(1),
        icon: z.string().optional(),
    }),

    // Text
    z.object({
        type: z.literal("text"),
        content: z.string(),
        title: z.string().optional(),
    }),

    // Section
    z.object({
        type: z.literal("section"),
        title: z.string(),
        content: z.string().optional(),
    }),
]);

export const ReportSchema = z.array(ReportBlockSchema);
export type ReportBlock = z.infer<typeof ReportBlockSchema>;
export type Report = z.infer<typeof ReportSchema>;

export const ReportWrapperSchema = z.object({
    blocks: ReportSchema,
});