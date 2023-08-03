import { NextResponse } from "next/server";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await prisma.account.findMany({
    select: { access_token: true, refresh_token: true, userId: true },
  });

  for (const account of accounts) {
    try {
      console.log(account.userId);

      const gmail = getGmailClient({
        accessToken: account.access_token ?? undefined,
      });

      await watchEmails(account.userId, gmail);
    } catch (error) {
      console.error(`Error for user ${account.userId}`);
      console.error(error);
    }
  }

  return NextResponse.json({ ok: true });
}
