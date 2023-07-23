import "server-only";
import { z } from "zod";
import { openai } from "@/app/api/ai/openai";
import { ACTIONS, AI_MODEL, generalPrompt } from "@/utils/config";
import { getPlan, planSchema, savePlan } from "@/utils/redis/plan";
import { saveUsage } from "@/utils/redis/usage";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { getUserLabels } from "@/utils/label";

export const planBody = z.object({
  id: z.string(),
  subject: z.string(),
  message: z.string(),
  replan: z.boolean(),
  senderEmail: z.string(),
});
export type PlanBody = z.infer<typeof planBody>;
export type PlanResponse = Awaited<ReturnType<typeof plan>>;

async function calculatePlan(
  subject: string,
  message: string,
  senderEmail: string,
  labels: { name: string; description?: string | null }[]
) {
  const systemMessage = `You are an AI assistant that helps people manage their emails by replying, archiving and labelling emails on the user's behalf.
The user will send emails and it is your job to plan a course of action to handle them.
You will always return valid JSON as a response.

The JSON should contain the following fields:
  
action: ${ACTIONS.join(", ")}
label?: LABEL
response?: string
  
${
  labels.length
    ? `LABEL can be one of the following:
${labels
  .map((l) => `* ${l.name}${l.description ? ` - ${l.description}` : ""}`)
  .join(", \n")}`
    : ""
}
  
If action is "reply", include a "response" field with a response to send.
If action is "label", include a "label" field with the label from the list of labels above.
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.
`;

  const response = await openai.createChatCompletion({
    model: AI_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: `${generalPrompt}`,
      },
      {
        role: "user",
        content: `The email:
Subject: ${subject}
From: ${senderEmail}
Body:
${message.substring(0, 3000)}
        `,
      },
    ],
  });
  const json: ChatCompletionResponse | ChatCompletionError =
    await response.json();

  return json;
}

export async function plan(
  body: PlanBody,
  user: { id: string; email: string }
) {
  // check cache
  const data = body.replan
    ? undefined
    : await getPlan({ email: user.email, threadId: body.id });
  if (data) return { plan: data };

  const labels = await getUserLabels({ email: user.email });

  let json = await calculatePlan(
    body.subject,
    body.message,
    body.senderEmail,
    labels || []
  );

  if (isChatCompletionError(json)) return { plan: undefined };

  const planString: string = json?.choices?.[0]?.message?.content;

  if (!planString) {
    console.error("plan string undefined");
    console.error("length", body.message.length);
    console.error("json", json);
  }

  const planJson = planSchema.parse(JSON.parse(planString));

  // cache result
  await savePlan({
    email: user.email,
    threadId: body.id,
    plan: planJson,
  });

  await saveUsage({
    email: user.email,
    tokensUsed: json.usage.total_tokens,
  });

  return { plan: planJson };
}
