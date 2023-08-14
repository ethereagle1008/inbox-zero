import NextAuth, { AuthOptions } from "next-auth";
import { authOptions, getAuthOptions } from "@/utils/auth";

// https://next-auth.js.org/configuration/initialization#advanced-initialization
async function handler(
  request: Request,
  context: { params?: { nextauth?: string[] } }
) {
  let authOpts = authOptions;

  if (
    request.method === "POST" &&
    context.params?.nextauth?.[0] === "signin" &&
    context.params.nextauth[1] === "google"
  ) {
    const clonedRequest = request.clone();
    const formData = await clonedRequest.formData();
    const requestConsent = formData.get("consent") === "true";
    console.log("requestConsent:", requestConsent);

    authOpts = getAuthOptions({ consent: requestConsent });
  }

  // can remove `as any` once this is fixed: https://github.com/nextauthjs/next-auth/issues/8120
  return await NextAuth(request as any, context as any, authOpts);
}

export { handler as GET, handler as POST };
