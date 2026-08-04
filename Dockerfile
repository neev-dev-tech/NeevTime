# Multi-stage build for TimeNexa Attendance Management System

# ============================================
# Stage 1: Backend Build
# ============================================
FROM node:20-alpine AS backend

WORKDIR /app/server

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server files
COPY server/ .

# ============================================
# Stage 2: Frontend Build
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Copy package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci

# Copy client files
COPY client/ .

# Build frontend
RUN npm run build

# ============================================
# Stage 3: Production - Nginx + Backend
# ============================================
FROM nginx:alpine

# Install Node.js for backend
RUN apk add --no-cache nodejs npm openssl

# Copy built frontend
COPY --from=frontend-builder /app/client/dist /usr/share/nginx/html

# Copy backend
WORKDIR /app
COPY --from=backend /app/server ./
COPY database /app/database

# Copy Nginx configuration
COPY nginx-docker.conf /etc/nginx/conf.d/default.conf
# Kept as the fallback the entrypoint restores if the TLS config fails to parse
COPY nginx-docker.conf /etc/nginx/nginx-http.conf
# Installed over default.conf by the entrypoint when TLS_ENABLED=true
COPY nginx-tls.conf /etc/nginx/nginx-tls.conf
# Shared by both configurations so they cannot drift apart
COPY nginx-locations.conf /etc/nginx/app-locations.conf
COPY nginx-iclock.conf /etc/nginx/iclock.conf
# http-level map feeding the HSTS header. conf.d/*.conf is auto-included there,
# which is exactly what a map needs — unlike the header file, which must not be.
COPY nginx-hsts-map.conf /etc/nginx/conf.d/00-hsts-map.conf
# Deliberately NOT under conf.d/: nginx.conf auto-includes conf.d/*.conf at
# the http level, which would apply these globally — including to /iclock/ —
# and duplicate every header. It is included per-location by default.conf.
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf

# Expose ports
EXPOSE 80 443 3001 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start script
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

