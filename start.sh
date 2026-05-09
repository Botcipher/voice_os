#!/bin/bash
set -e

echo "==> Starting Next.js dashboard on port 3001..."
# Run Next.js in a subshell so the parent shell stays at the project root
(cd dashboard && npm run start) &
NEXT_PID=$!

echo "==> Waiting for Next.js to be ready..."
until curl -sf http://localhost:3001 > /dev/null 2>&1; do
  sleep 2
done
echo "==> Next.js is ready"

echo "==> Starting Express API on port 10000..."
node server.js &
EXPRESS_PID=$!

wait $NEXT_PID $EXPRESS_PID
