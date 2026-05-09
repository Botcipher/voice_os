#!/bin/bash
# Start both Next.js and Express, then wait
echo "Starting Next.js dashboard on port 3001..."
cd dashboard && npm run start &
NEXT_PID=$!

echo "Starting Express API on port 10000..."
cd .. && node server.js &
EXPRESS_PID=$!

# Wait for either to exit
wait $NEXT_PID $EXPRESS_PID
