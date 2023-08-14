import { z } from "zod";
import { gmail_v1 } from "googleapis";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { ThreadWithPayloadMessages } from "@/utils/types";

export const dynamic = "force-dynamic";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(query: ThreadQuery, gmail: gmail_v1.Gmail) {
  const res = await gmail.users.threads.get({
    userId: "me",
    id: query.id,
  });
  const thread = res.data;

  const messages = parseMessages(thread as ThreadWithPayloadMessages);

  return { thread: { ...thread, messages } };
}

export async function GET(
  request: Request,
  { params }: { params: ThreadQuery }
) {
  const query = threadQuery.parse(params);

  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const thread = await getThread(query, gmail);

  return NextResponse.json(thread);
}
