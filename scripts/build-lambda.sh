#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_DIR="$ROOT_DIR/lambda"

echo "Building Lambda zip..."
cd "$LAMBDA_DIR"

rm -rf node_modules function.zip package-lock.json

npm init -y >/dev/null 2>&1 || true
# overwrite package.json with our pinned deps
cat > package.json <<'JSON'
{
  "name": "apigw-rds-s3-demo",
  "version": "1.0.0",
  "main": "index.js",
  "type": "commonjs",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "mysql2": "^3.11.0"
  }
}
JSON

npm install --omit=dev

zip -r function.zip index.js node_modules package.json >/dev/null

echo "Done: lambda/function.zip"
