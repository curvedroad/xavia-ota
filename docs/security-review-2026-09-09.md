# Security review — 2026-09-09

## Dependency result

The original production dependency audit reported 39 findings: 3 critical, 6 high, 25 moderate,
and 5 low. After the changes below, `npm audit --audit-level=moderate` reports zero findings.

| Area              | Before                                              | Resolution                                                                       |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Next.js           | 15.2.x line, affected by later framework advisories | Upgraded to 16.3.4                                                               |
| Node.js           | 18.18 container                                     | Upgraded to Node 22.22.3 and non-root runtime user                               |
| form-data         | 4.0.0 range                                         | Pinned to 4.0.6                                                                  |
| formidable        | 3.5.2 range                                         | Pinned to 3.5.4 and upload limits added                                          |
| AWS SDK           | 3.779 range                                         | Pinned to 3.1128.0                                                               |
| adm-zip           | Known archive handling advisories                   | Replaced by yauzl 3.4.0 with entry, size, path, and compression-ratio validation |
| GCS/Supabase SDKs | Installed but unused by Newsboy production          | Removed; production remains PostgreSQL plus S3                                   |
| Jest/TypeScript   | Old test and compiler dependency trees              | Updated to Jest 30 and TypeScript 5.9                                            |

## Application security changes

- Removed the browser-only `localStorage` authentication flag and shared admin password endpoint.
- Added Google OAuth with verified-domain and exact-email checks.
- Protected all console data APIs and rollback on the server.
- Replaced multipart `uploadKey` with revocable, expiring bearer API keys stored as hashes.
- Rollback now accepts a release ID and reads path, runtime, and commit metadata from PostgreSQL;
  client-supplied storage paths are no longer trusted.
- Added request-size, field-size, archive-entry, uncompressed-size, compression-ratio, path, runtime
  version, commit hash, and commit message validation.
- Public manifest and asset routes reject unsupported methods, protocols, runtime versions, unsafe
  archive paths, and files that are not declared in the release metadata.
- PostgreSQL release metadata is the publication source of truth; an unregistered ZIP placed
  directly in object storage is not selected or signed as an OTA release.
- Added security headers and disabled the framework identification header.
- Added database-backed audit records without storing API key values or OAuth tokens.

## Intentionally deferred

- OTA channel routing and channel-scoped API keys.
- RSA signing key separation and certificate rotation. Existing applications must keep trusting the
  current certificate until a planned binary rollout provides a safe rotation path.
- Removing `'unsafe-inline'` from the Content Security Policy requires a separate Chakra/Next nonce
  migration. The current policy still blocks framing, plugins, foreign default sources, and foreign
  connections.
