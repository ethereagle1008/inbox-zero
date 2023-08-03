import { z } from "zod";
import he from "he";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getPlan } from "@/utils/redis/plan";
import { INBOX_LABEL_ID } from "@/utils/label";
import { ThreadWithPayloadMessages } from "@/utils/types";

export const dynamic = "force-dynamic";

const threadsQuery = z.object({ limit: z.coerce.number().max(500).optional() });
export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(query: ThreadsQuery) {
  const session = await getAuthSession();
  if (!session) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);

  const res = await gmail.users.threads.list({
    userId: "me",
    labelIds: [INBOX_LABEL_ID],
    maxResults: query.limit || 50,
  });

  const threadsWithMessages = await Promise.all(
    res.data.threads?.map(async (t) => {
      const id = t.id!;
      const thread = await gmail.users.threads.get({ userId: "me", id });
      const messages = parseMessages(thread.data as ThreadWithPayloadMessages);

      const plan = await getPlan({ userId: session.user.id, threadId: id });

      return {
        ...t,
        snippet: he.decode(t.snippet || ""),
        thread: { ...thread.data, messages },
        plan,
      };
    }) || []
  );

  return { threads: threadsWithMessages };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const query = threadsQuery.parse({ limit });

  try {
    const threads = await getThreads(query);
    return NextResponse.json(threads);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error });
  }
}
