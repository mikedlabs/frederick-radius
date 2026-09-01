import { z } from "zod";

const answerIdSchema = z
  .string()
  .regex(/^fair-answer-[a-z0-9]+(?:-[a-z0-9]+)*$/);

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  .refine((value) => Number.isFinite(Date.parse(value)));

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"));

export const fairPracticalAnswerSourceSchema = z
  .object({
    publisher: z.string().trim().min(2).max(120),
    label: z.string().trim().min(2).max(160),
    url: httpsUrlSchema,
    checkedAt: offsetTimestampSchema,
  })
  .strict();

export const fairPracticalAnswerSchema = z
  .object({
    id: answerIdSchema,
    category: z.enum([
      "accessibility",
      "arrival",
      "carnival",
      "concert",
      "family",
      "payment",
      "policy",
      "safety",
      "weather",
    ]),
    question: z.string().trim().min(8).max(120),
    answer: z.string().trim().min(12).max(520),
    evidence: z.enum([
      "verified-official",
      "community-pattern",
      "not-confirmed",
    ]),
    usefulBefore: z.array(z.enum(["leave-home", "park", "enter", "inside", "leave"])).min(1).max(5),
    sources: z.array(fairPracticalAnswerSourceSchema).min(1).max(6),
    action: z
      .object({
        label: z.string().trim().min(2).max(80),
        url: httpsUrlSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((answer, ctx) => {
    if (answer.evidence === "community-pattern" && answer.sources.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "community patterns require at least two reviewed sources",
        path: ["sources"],
      });
    }
  });

export const fairPracticalAnswersSchema = z
  .array(fairPracticalAnswerSchema)
  .min(1)
  .max(40)
  .superRefine((answers, ctx) => {
    const ids = new Set<string>();
    answers.forEach((answer, index) => {
      if (ids.has(answer.id)) {
        ctx.addIssue({
          code: "custom",
          message: "practical answer ids must be unique",
          path: [index, "id"],
        });
      }
      ids.add(answer.id);
    });
  });

export type FairPracticalAnswer = z.infer<typeof fairPracticalAnswerSchema>;

export function parseFairPracticalAnswers(
  value: unknown,
): FairPracticalAnswer[] {
  return fairPracticalAnswersSchema.parse(value);
}
