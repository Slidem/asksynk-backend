#!/usr/bin/env bash
set -euo pipefail

docker compose -f localdev/docker-compose.test.yml up -d --wait

# Garage bootstrap (layout, key, buckets, website, CORS). Idempotent; safe per-up.
GARAGE_CONTAINER=asksynk-garage-test bash localdev/garage/init.sh
