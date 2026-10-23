# Multi-stage Dockerfile for TradingA All-In-One Container (FE + BE + PostgreSQL)
# Build Stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package descriptors and source
COPY package*.json ./
RUN npm ci

COPY . .

# Build assets, compile Astro, and flatten build output to dist/
RUN npm run build
RUN npm run docs-compile && npm run flatten-build

# Production Runtime Stage
FROM node:22-alpine
WORKDIR /app

# Install PostgreSQL server & client tools
RUN apk add --no-cache postgresql postgresql-contrib su-exec

# Configure PostgreSQL data directory
ENV PGDATA=/var/lib/postgresql/data
RUN mkdir -p /var/lib/postgresql/data /run/postgresql && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chmod 0700 /var/lib/postgresql/data

# Initialize DB as postgres user
USER postgres
RUN initdb -D /var/lib/postgresql/data && \
    echo "host all all 127.0.0.1/32 trust" >> /var/lib/postgresql/data/pg_hba.conf && \
    echo "local all all trust" >> /var/lib/postgresql/data/pg_hba.conf && \
    pg_ctl -D /var/lib/postgresql/data -w start && \
    createdb -O postgres trading_journal && \
    pg_ctl -D /var/lib/postgresql/data -m fast -w stop

USER root

# Production node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled static distribution and backend server
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=postgres://postgres@localhost:5432/trading_journal

# Expose ONLY the single application port (serving Frontend & Backend API)
EXPOSE 3000

# Persistence for PostgreSQL data
VOLUME ["/var/lib/postgresql/data"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
