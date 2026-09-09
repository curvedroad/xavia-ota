# Storage and database configuration

The Newsboy deployment deliberately supports a small set of backends:

- `BLOB_STORAGE_TYPE=local` for local development only.
- `BLOB_STORAGE_TYPE=s3` for production S3-compatible object storage, including NCloud Object Storage.
- `DB_TYPE=postgres` for release metadata, download tracking, API keys, and audit logs.

## Local storage

```env
BLOB_STORAGE_TYPE=local
```

Local storage is not suitable for an ephemeral Kubernetes Pod.

## S3-compatible storage

```env
BLOB_STORAGE_TYPE=s3
S3_REGION=kr-standard
S3_ENDPOINT=https://kr.object.ncloudstorage.com
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=your-bucket-name
```

## PostgreSQL

```env
DB_TYPE=postgres
POSTGRES_USER=your-user
POSTGRES_PASSWORD=your-password
POSTGRES_DB=your-database-name
POSTGRES_HOST=your-host
POSTGRES_PORT=5432
```

Apply every SQL file under `containers/database/schema` before starting a production release.
The application database user only needs normal data access after the schema has been applied.
