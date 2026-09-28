# =============================================================================
# Stage 1: Build Frontend Single Page Application
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install root/frontend dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build production assets
COPY . .
RUN npm run build

# =============================================================================
# Stage 2: Production Server Runtime
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

# Copy server package and install production dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev

WORKDIR /app

# Copy server source files
COPY server/ ./server/

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy default initial data templates
COPY data/ ./data/

# Expose HTTP port
EXPOSE 5001

# Run the lightweight Node.js server
CMD ["node", "server/server.js"]
