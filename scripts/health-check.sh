#!/bin/bash
# Probe the listener health endpoint.
# Default port 8787 matches EVENTS_API_PORT (see listener/src/config.ts).
# Usage: ./scripts/health-check.sh [url]
TARGET_URL=${1:-"http://localhost:8787/health"}

RESPONSE=$(curl -sS -w "\n%{http_code}" "$TARGET_URL") || exit 1
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

echo "GET $TARGET_URL -> HTTP $HTTP_STATUS"
if [ -n "$HTTP_BODY" ]; then
  echo "$HTTP_BODY"
fi

if [ "$HTTP_STATUS" -eq 200 ]; then
  exit 0
fi

exit 1
