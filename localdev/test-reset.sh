#!/usr/bin/env bash
set -euo pipefail

# wipes all test data, including migrations, rows, and pg-boss jobs. Use with caution.
docker compose -f localdev/docker-compose.test.yml down -v
