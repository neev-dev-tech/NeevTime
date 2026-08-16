#!/bin/sh
# nginx only. Node lives in its own container.
#
# That separation is the point of this image. The previous single-container
# arrangement started Node in the background and ran nginx as PID 1:
#
#     cd /app && node server.js &
#     exec nginx -g 'daemon off;'
#
# So when Node died the container stayed up and healthy — nginx was still
# answering — and proxied to a dead port. It did exactly that from 2026-03-24
# until 2026-08-16: 145 days, four readers polling every 30 seconds, every punch
# refused with a 502, and the container reporting healthy throughout. Here nginx
# is the only process, so `restart: always` on the server container means a dead
# backend actually gets restarted instead of quietly proxied to.
set -e

if [ "$TLS_ENABLED" = "true" ]; then
    CERT_DIR=/etc/nginx/certs
    mkdir -p "$CERT_DIR"

    # Mounted as a volume in compose so the pair survives a recreate. Without
    # that, every deploy issues a new self-signed certificate and every browser
    # shows a fresh warning, which trains people to click through them.
    if [ ! -f "$CERT_DIR/server.crt" ] || [ ! -f "$CERT_DIR/server.key" ]; then
        echo "No certificate found; generating a self-signed pair valid for 825 days."
        openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
            -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" \
            -subj "/CN=${TLS_COMMON_NAME:-neevtime.local}" 2>/dev/null
    fi

    cp /etc/nginx/nginx-tls.conf /etc/nginx/conf.d/default.conf

    # Fall back rather than fail to start. A container that will not boot takes
    # the readers down with it, and clear-text on port 80 is worse than TLS but
    # far better than no attendance collection.
    if ! nginx -t >/dev/null 2>&1; then
        echo "TLS configuration failed to parse; falling back to HTTP only." >&2
        nginx -t || true
        cp /etc/nginx/nginx-http.conf /etc/nginx/conf.d/default.conf
    fi
fi

exec nginx -g 'daemon off;'
