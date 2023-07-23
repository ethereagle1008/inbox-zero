// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  getServerSession,
  TokenSet,
  type NextAuthOptions,
  type DefaultSession,
  Account,
} from "next-auth";
import { type JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/utils/prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID) throw new Error("Missing env.GOOGLE_CLIENT_ID");
if (!GOOGLE_CLIENT_SECRET) throw new Error("Missing env.GOOGLE_CLIENT_SECRET");

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",

  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export const authOptions: NextAuthOptions = {
  secret: process.env.SECRET,
  providers: [
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      authorization: {
        url: "https://accounts.google.com/o/oauth2/v2/auth",
        params: {
          scope: SCOPES.join(" "),
          access_type: "offline",
          response_type: "code",
          // can be helpful for dev we don't have the refresh token: https://github.com/nextauthjs/next-auth/issues/269#issuecomment-644274504
          // prompt: "consent",
        },
      },
    }),
  ],
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  // based on: https://authjs.dev/guides/basics/refresh-token-rotation
  // and: https://github.com/nextauthjs/next-auth-refresh-token-example/blob/main/pages/api/auth/%5B...nextauth%5D.js
  callbacks: {
    jwt: async ({ token, user, account }) => {
      // Signing in
      // on first sign in account and user are defined
      // thereafter only token is defined
      if (account && user) {
        // Google sends us refresh_token only on first sign in so we need to save it to the database then
        // On future log ins, we retrieve the refresh_token from the database
        if (account.refresh_token) {
          await saveRefreshToken(
            {
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: calculateExpiresAt(
                account.expires_in as number | undefined
              ),
            },
            {
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
            }
          );
          token.refresh_token = account.refresh_token;
        } else {
          const dbAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                providerAccountId: account.providerAccountId,
                provider: "google",
              },
            },
            select: { refresh_token: true },
          });
          token.refresh_token = dbAccount?.refresh_token ?? undefined;
        }

        token.access_token = account.access_token;
        token.expires_at = account.expires_at;
        token.user = user;

        return token;
      } else if (token.expires_at && Date.now() < token.expires_at) {
        // If the access token has not expired yet, return it
        return token;
      } else {
        // If the access token has expired, try to refresh it
        return await refreshAccessToken(token);
      }
    },
    session: async ({ session, token }) => {
      session.user = {
        ...session.user,
        id: token.sub as string,
      };

      // based on: https://github.com/nextauthjs/next-auth/issues/1162#issuecomment-766331341
      session.accessToken = token?.access_token;
      session.refreshToken = token?.refresh_token;
      session.error = token?.error;

      return session;
    },
  },
  events: {
    createUser: async (message) => {
      console.log("createUser", message);
    },
  },
};

/**
 * Takes a token, and returns a new token with updated
 * `access_token` and `expires_at`. If an error occurs,
 * returns the old token and an error property
 */
const refreshAccessToken = async (token: JWT): Promise<JWT> => {
  const account = await prisma.account.findFirst({
    where: { userId: token.sub as string, provider: "google" },
  });

  if (!account?.refresh_token) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
      method: "POST",
    });

    const tokens: TokenSet & { expires_in: number } = await response.json();

    if (!response.ok) throw tokens;

    const expires_at = calculateExpiresAt(tokens.expires_in);
    await saveRefreshToken(
      { ...tokens, expires_at },
      {
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token,
      }
    );

    return {
      ...token, // Keep the previous token properties
      access_token: tokens.access_token,
      expires_at,
      // Fall back to old refresh token, but note that
      // many providers may only allow using a refresh token once.
      refresh_token: tokens.refresh_token ?? token.refresh_token,
    };
  } catch (error) {
    console.error("Error refreshing access token", error);

    // The error property will be used client-side to handle the refresh token error
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
};

function calculateExpiresAt(expiresIn?: number) {
  if (!expiresIn) return undefined;
  return Math.floor(Date.now() / 1000 + (expiresIn - 10)); // give 10 second buffer
}

async function saveRefreshToken(
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  },
  account: Pick<Account, "refresh_token" | "providerAccountId">
) {
  return await prisma.account.update({
    data: {
      access_token: tokens.access_token,
      expires_at: tokens.expires_at,
      refresh_token: tokens.refresh_token ?? account.refresh_token,
    },
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId,
      },
    },
  });
}

export function getAuthSession() {
  return getServerSession(authOptions) as Promise<{
    user: {
      id: string;
      name: string;
      email: string;
      image: string;
    };
    accessToken?: string;
    refreshToken?: string;
  } | null>;
}

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {} & DefaultSession["user"] & { id: string };
    accessToken?: string;
    refreshToken?: string;
    error?: "RefreshAccessTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string;
    expires_at?: number;
    refresh_token?: string;
    error?: "RefreshAccessTokenError";
  }
}

// export function withSiteAuth(action: any) {
//   return async (
//     formData: FormData | null,
//     siteId: string,
//     key: string | null,
//   ) => {
//     const session = await getSession();
//     if (!session) {
//       return {
//         error: "Not authenticated",
//       };
//     }
//     const site = await prisma.site.findUnique({
//       where: {
//         id: siteId,
//       },
//     });
//     if (!site || site.userId !== session.user.id) {
//       return {
//         error: "Not authorized",
//       };
//     }

//     return action(formData, site, key);
//   };
// }

// export function withPostAuth(action: any) {
//   return async (
//     formData: FormData | null,
//     postId: string,
//     key: string | null,
//   ) => {
//     const session = await getSession();
//     if (!session?.user.id) {
//       return {
//         error: "Not authenticated",
//       };
//     }
//     const post = await prisma.post.findUnique({
//       where: {
//         id: postId,
//       },
//       include: {
//         site: true,
//       },
//     });
//     if (!post || post.userId !== session.user.id) {
//       return {
//         error: "Post not found",
//       };
//     }

//     return action(formData, post, key);
//   };
// }
