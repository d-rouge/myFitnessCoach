#!/usr/bin/env bash
set -euo pipefail

# Build workspace packages in dependency order.
npm run build -w @health-trainer/domain
npm run build -w @health-trainer/config
npm run build -w @health-trainer/db
npm run build -w @health-trainer/ai
npm run build -w @health-trainer/ui
npm run build -w @health-trainer/integrations
