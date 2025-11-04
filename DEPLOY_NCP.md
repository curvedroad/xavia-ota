## NCP Container Registry Deployment Guide (newsboy-ota-server)

This guide shows how to build, tag, push, and run the image as `newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest`.

Note: This repo's Dockerfile is named `dockerfile` (lowercase). Always pass `-f dockerfile` when building.

### 1) Verify current directory
```bash
pwd
ls -la
# Ensure you are in the project root (e.g., /Users/sehyeona/workspaces/forked-repo/xavia-ota)
```

### 2) Login to the registry
```bash
docker login newsboy-container-registry.kr.ncr.ntruss.com
# Enter your NCP Container Registry credentials when prompted
```

### 3) Build the image
- On Apple Silicon (M1/M2), use `--platform linux/amd64` for compatibility.
```bash
# Build with the final registry tag directly
docker build --platform linux/amd64 -f dockerfile -t newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest .

# (Alternative) Build with a local tag then retag
# docker build -f dockerfile -t newsboy-ota-server:latest .
# docker tag newsboy-ota-server:latest newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest
```

### 4) Push the image
```bash
docker push newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest
```

### 5) local test
The `dockerfile` exposes port 3000 and runs `node server.js`.
```bash
docker build -f dockerfile -t newsboy/newsboy-ota-server:latest .


# Run with .env file
docker run --rm \
  --name newsboy-ota-server \
  -p 3000:3000 \
  --env-file .env \
  newsboy/newsboy-ota-server:latest
```

### 6) (Optional) Deploy with Docker Compose
Use `containers/prod/docker-compose.yml` as a reference, updating `image` to the NCR path.
```yaml
services:
  xavia-ota:
    image: newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest
    ports:
      - '3000:3000'
    environment:
      - HOST=http://localhost:3000
      - BLOB_STORAGE_TYPE=supabase
      - DB_TYPE=supabase
      - PRIVATE_KEY_BASE_64=your_base64_encoded_private_key
      - ADMIN_PASSWORD=your_secure_admin_password
      - UPLOAD_KEY=abc123def456
      - SUPABASE_URL=your_supabase_project_url
      - SUPABASE_API_KEY=your_supabase_service_role_key
      - SUPABASE_BUCKET_NAME=your_bucket_name
    restart: unless-stopped
```
Run:
```bash
docker compose -f <your-compose.yml> up -d
```

### 7) (Optional) Multi-architecture build and push
Build and push `amd64/arm64` in one command:
```bash
docker buildx create --use >/dev/null 2>&1 || true
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f dockerfile -t newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest \
  --push .
```

### Quick reference
- Build: `docker build --platform linux/amd64 -f dockerfile -t newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest .`
- Retag (optional): `docker tag newsboy-ota-server:latest newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest`
- Push: `docker push newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest`
- Run: `docker run -d --name newsboy-ota-server -p 3000:3000 newsboy-container-registry.kr.ncr.ntruss.com/newsboy-ota-server:latest`


