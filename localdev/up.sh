#!/usr/bin/env bash
set -euo pipefail

docker compose -f localdev/docker-compose.yml up -d

# Garage bootstrap (layout, key, buckets, website, CORS). Idempotent; safe per-up.
bash localdev/garage/init.sh
