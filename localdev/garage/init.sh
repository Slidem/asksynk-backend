#!/usr/bin/env bash
# Host-run, one-shot Garage bootstrap. Run AFTER the Garage container is up:
#   bash localdev/garage/init.sh                                # localdev
#   GARAGE_CONTAINER=asksynk-garage-test bash localdev/garage/init.sh   # tests
# The Garage image is distroless, so we drive the `/garage` CLI via `docker exec`
# (runs the binary directly, no shell needed) and set CORS with a throwaway aws-cli
# container sharing Garage's network namespace.
set -euo pipefail

CONTAINER=${GARAGE_CONTAINER:-asksynk-garage}
# Garage requires its own key format: access key = "GK" + 24 hex, secret = 64 hex.
# Arbitrary strings are rejected by `key import`. These fixed values must match the
# S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY in apps/api/.env(.test).
ACCESS_KEY=GKabcdef0123456789abcdef01
SECRET_KEY=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789
BUCKET_PRIVATE=asksynk-private
BUCKET_PUBLIC=asksynk-public
CORS_JSON="$(cd "$(dirname "$0")" && pwd)/cors.json"

G() { docker exec "$CONTAINER" /garage -c /etc/garage/garage.toml "$@"; }

echo "waiting for garage node..."
until G status >/dev/null 2>&1; do sleep 1; done

NODE_ID=$(G node id -q | cut -d@ -f1)
echo "node: $NODE_ID"

# Single-node layout (no-op on re-run).
G layout assign -z dc1 -c 1G "$NODE_ID" 2>/dev/null || true
G layout apply --version 1 2>/dev/null || true

# Fixed dev key (idempotent; surfaces real import errors instead of hiding them).
if ! G key info "$ACCESS_KEY" >/dev/null 2>&1; then
  G key import --yes -n asksynk-dev "$ACCESS_KEY" "$SECRET_KEY"
fi

for BUCKET in "$BUCKET_PRIVATE" "$BUCKET_PUBLIC"; do
  G bucket info "$BUCKET" >/dev/null 2>&1 || G bucket create "$BUCKET"
  G bucket allow --read --write --owner --key "$ACCESS_KEY" "$BUCKET"
done

# Public bucket served anonymously over the web endpoint (:3902).
G bucket website --allow "$BUCKET_PUBLIC" || true

# CORS so browsers can POST/GET directly (S3 API op). Both buckets take direct
# browser uploads via presigned POST (attachments -> private, avatars -> public).
for BUCKET in "$BUCKET_PRIVATE" "$BUCKET_PUBLIC"; do
  docker run --rm \
    --network "container:${CONTAINER}" \
    -e AWS_ACCESS_KEY_ID="$ACCESS_KEY" \
    -e AWS_SECRET_ACCESS_KEY="$SECRET_KEY" \
    -e AWS_DEFAULT_REGION=garage \
    -v "${CORS_JSON}:/cors.json:ro" \
    amazon/aws-cli --endpoint-url http://localhost:3900 \
    s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration file:///cors.json
done

echo "garage init done"
