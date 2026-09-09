import { NextApiRequest, NextApiResponse } from 'next';
import { AuthOptions, getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

import { AuditActor } from '../database/DatabaseInterface';
import { recordAudit } from './audit';

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: 'openid email profile',
          prompt: 'select_account',
          hd: process.env.GOOGLE_ALLOWED_DOMAIN ?? '',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  callbacks: {
    async signIn({ profile, user }) {
      const email = normalizeEmail(profile?.email ?? user.email);
      const allowed = isAllowedGoogleProfile(profile);

      if (!allowed) {
        await recordAudit({
          actor: { type: 'oauth_user', id: email || 'unknown' },
          action: 'auth.sign_in',
          outcome: 'denied',
          httpStatus: 403,
          metadata: { provider: 'google' },
        });
      }

      return allowed;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  events: {
    async signIn({ user }) {
      const email = normalizeEmail(user.email) || 'unknown';
      await recordAudit({
        actor: { type: 'oauth_user', id: email },
        action: 'auth.sign_in',
        outcome: 'success',
        httpStatus: 200,
        metadata: { provider: 'google' },
      });
    },
    async signOut(message) {
      const token = (message as { token?: { email?: string | null } }).token;
      const email = normalizeEmail(token?.email);
      await recordAudit({
        actor: { type: 'oauth_user', id: email || 'unknown' },
        action: 'auth.sign_out',
        outcome: 'success',
        httpStatus: 200,
      });
    },
  },
};

export async function requireAdminSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuditActor | null> {
  const session = await getServerSession(req, res, authOptions);
  const email = normalizeEmail(session?.user?.email);

  if (!isAllowedAdminEmail(email)) {
    const httpStatus = email ? 403 : 401;
    if (email) {
      await recordAudit({
        req,
        actor: { type: 'oauth_user', id: email },
        action: 'auth.authorization',
        outcome: 'denied',
        httpStatus,
      });
    }
    res.status(httpStatus).json({
      error: email ? 'Account is not authorized' : 'Authentication required',
    });
    return null;
  }

  return { type: 'oauth_user', id: email };
}

export function isAllowedGoogleProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;

  const googleProfile = profile as Record<string, unknown>;
  const email = normalizeEmail(typeof googleProfile.email === 'string' ? googleProfile.email : '');
  const verified = googleProfile.email_verified === true || googleProfile.verified_email === true;
  const hostedDomain =
    typeof googleProfile.hd === 'string' ? googleProfile.hd.trim().toLowerCase() : '';
  const allowedDomain = getAllowedDomain();

  if (!verified || !isAllowedAdminEmail(email)) return false;
  if (hostedDomain !== allowedDomain) return false;

  return true;
}

export function isAllowedAdminEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  const allowedDomain = getAllowedDomain();
  const allowedEmails = new Set(
    (process.env.GOOGLE_ALLOWED_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean)
  );

  return Boolean(
    email &&
      allowedDomain &&
      allowedEmails.size > 0 &&
      allowedEmails.has(email) &&
      email.endsWith(`@${allowedDomain}`)
  );
}

function getAllowedDomain(): string {
  return (process.env.GOOGLE_ALLOWED_DOMAIN ?? '').trim().toLowerCase();
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
