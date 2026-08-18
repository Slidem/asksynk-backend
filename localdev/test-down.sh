#!/usr/bin/env bash
set -euo pipefail

docker compose -f localdev/docker-compose.test.yml down
