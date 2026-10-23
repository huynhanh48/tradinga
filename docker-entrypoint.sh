#!/bin/sh
set -e

# Run embedded postgres inside the same container
su - postgres -c "pg_ctl -D /var/lib/postgresql/data -l /var/lib/postgresql/data/logfile start"

# Wait for PostgreSQL to be ready
until su - postgres -c "pg_isready -d trading_journal" > /dev/null 2>&1; do
  echo "Waiting for postgresql to start..."
  sleep 1
done

echo "PostgreSQL is ready."

# Start TradingA Node Express service serving FE & API
exec node server/index.js
