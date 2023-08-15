import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

async function getMessages() {
  const session = await getAuthSession();
  if (!session) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);

  const messages = await gmail.users.messages.list({
    userId: "me",
    maxResults: 10,
  });

  const fullMessages = await Promise.all(
    (messages.data.messages || []).map(async (m) => {
      const res = await getMessage(m.id!, gmail);

      return {
        ...res,
        parsedMessage: parseMessage(res),
      };
    })
  );

  return { messages: fullMessages };
}

export async function GET() {
  const result = await getMessages();

  return NextResponse.json(result);
}
