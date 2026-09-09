# Authentication and authorization

The server has three independent trust boundaries:

1. Google OAuth authenticates people using the admin console.
2. Expiring API keys authenticate automated upload clients.
3. The existing RSA private key signs Expo manifests. Code signing is unchanged by this work.

## Admin console

Configure Google OAuth with this redirect URI:

```text
https://updates.newsboy.news/api/auth/callback/google
```

Required environment variables:

```env
NEXTAUTH_URL=https://updates.newsboy.news
NEXTAUTH_SECRET=<32-or-more-random-bytes>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_ALLOWED_DOMAIN=curved-road.com
GOOGLE_ALLOWED_EMAILS=admin1@curved-road.com,admin2@curved-road.com
```

Login is allowed only when Google reports a verified email, the hosted domain matches, and the
normalized email is explicitly listed. Sessions are encrypted/signed HTTP-only cookies with an
eight-hour maximum lifetime. Because there is one administrator role and the allowlist is the
source of authorization, an application user table is intentionally not used.

## Upload API keys

An authenticated administrator issues a key from `/api-keys`. The complete token is returned only
once. PostgreSQL stores only its SHA-256 hash, a non-secret prefix, timestamps, issuer, expiry, and
revocation state.

```http
Authorization: Bearer nbota_<prefix>_<secret>
```

Keys are upload-only; channels and channel-specific permissions are intentionally deferred. Key
creation, listing, revocation, and every upload attempt made with a valid key are recorded in
`ota_audit_logs`.

Anonymous authentication failures are written to the application security log instead of the
database so an unauthenticated client cannot grow the audit table. Database audit records are
reserved for an identified OAuth user or valid API key.

## Protected and public routes

- Public Expo client routes: `/api/manifest`, `/api/assets`
- Bearer API key route: `POST /api/upload`
- OAuth session routes: release list, rollback, tracking, API key management, and audit logs
- Cookie-authenticated mutations also require a same-origin request.

Never place OAuth secrets, upload API keys, database credentials, or the signing private key in Git.
