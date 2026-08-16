# The browser-facing container: the built React app, plus nginx in front of it.
#
# This replaces a version that served the app on port 80 with no TLS, none of
# the security headers, and — critically — no /iclock location at all. Cutting
# over to it would have taken HTTPS away and left the biometric readers with
# nowhere to post. It now carries the same nginx configuration as the
# single-container image, with one difference: the backend is the `server`
# container rather than loopback.
#
# Built from the REPOSITORY ROOT, not from client/, because the nginx
# configuration is shared with the single-container image and lives at the root.
# A build context cannot reach above itself, and duplicating those files into
# client/ is how the two copies drift apart — which is the class of problem this
# whole change exists to fix. See docker-compose.yml: context is `.`.
#
# Node 20 to match the server image. The previous node:18-bullseye built the
# same source on a runtime nothing else in this project uses.

# Stage 1: build the React application
FROM node:20-alpine AS build

WORKDIR /app

COPY client/package*.json ./
RUN npm ci

COPY client/ .
RUN npm run build

# Stage 2: serve it
FROM nginx:alpine

RUN apk add --no-cache openssl

COPY --from=build /app/dist /usr/share/nginx/html

# Where the backend lives. The one file that differs from the combined image.
COPY client/nginx-upstream-split.conf /etc/nginx/conf.d/01-upstream.conf

# Plain HTTP by default; the entrypoint installs the TLS configuration over it
# when TLS_ENABLED=true, and restores this one if that fails to parse.
COPY nginx-docker.conf /etc/nginx/conf.d/default.conf
COPY nginx-docker.conf /etc/nginx/nginx-http.conf
COPY nginx-tls.conf /etc/nginx/nginx-tls.conf

# Shared location blocks, included by both configurations above so the two
# cannot drift apart.
COPY nginx-locations.conf /etc/nginx/app-locations.conf
COPY nginx-iclock.conf /etc/nginx/iclock.conf
COPY nginx-hsts-map.conf /etc/nginx/conf.d/00-hsts-map.conf
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf

COPY client/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
