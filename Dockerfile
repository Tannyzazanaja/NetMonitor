# =============================================================================
# Stage 1: Build Frontend Single Page Application
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install root/frontend dependencies (frozen lockfile)
COPY package*.json ./
RUN npm ci

# Copy frontend source files
COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/

# Compile production assets into /app/dist
RUN npm run build

# =============================================================================
# Stage 2: Hardened Enterprise Runtime Environment (Non-Root, Minimal Alpine)
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

# Create non-root system group and user (UID/GID 10001)
RUN addgroup -g 10001 -S netmon && \
    adduser -u 10001 -S netmon -G netmon

# Install backend production dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev && npm cache clean --force

WORKDIR /app

# Copy server application source code
COPY server/ ./server/

# Copy compiled frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy initial clean data templates & ensure targets directory structure
COPY data/ ./data/
RUN mkdir -p /app/data/targets/blackbox /app/data/targets/snmp && \
    chown -R netmon:netmon /app

# Expose backend application port
EXPOSE 5001

# Container Healthcheck (native Node.js ping without curl dependency)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Enforce least-privilege non-root execution
USER netmon

# Start lightweight NetMonitor application server
CMD ["node", "server/server.js"]
