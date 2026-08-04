#!/bin/sh
set -e

# TLS is opt-in. Without TLS_ENABLED=true nothing below runs and the container
# serves plain HTTP exactly as before — a missing or malformed certificate must
# never be able to stop attendance collection.
if [ "$TLS_ENABLED" = "true" ]; then
    CERT_DIR=/etc/nginx/certs
    mkdir -p "$CERT_DIR"

    # A mounted certificate always wins. One is generated only when none is
    # present, so swapping the self-signed pair for a real one is just a volume
    # mount and a restart.
    if [ ! -s "$CERT_DIR/server.crt" ] || [ ! -s "$CERT_DIR/server.key" ]; then
        # The SAN matters more than the CN: browsers ignore CN entirely, so a
        # certificate that does not list the address people actually type will
        # fail to validate no matter what it is named.
        CERT_HOST="${TLS_HOST:-localhost}"
        echo "[entrypoint] No certificate found. Generating a self-signed pair for ${CERT_HOST}."
        case "$CERT_HOST" in
            *[0-9].[0-9]*) SAN="IP:${CERT_HOST}" ;;
            *)             SAN="DNS:${CERT_HOST}" ;;
        esac
        openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
            -keyout "$CERT_DIR/server.key" \
            -out "$CERT_DIR/server.crt" \
            -subj "/CN=${CERT_HOST}" \
            -addext "subjectAltName=${SAN},DNS:localhost,IP:127.0.0.1" \
            >/dev/null 2>&1
        chmod 600 "$CERT_DIR/server.key"
        echo "[entrypoint] Self-signed certificate created. Browsers will warn until it is trusted or replaced."
    fi

    cp /etc/nginx/nginx-tls.conf /etc/nginx/conf.d/default.conf

    # If the TLS configuration will not parse, fall back rather than refuse to
    # boot. Losing HTTPS is an inconvenience; a container that will not start is
    # lost attendance.
    if ! nginx -t >/dev/null 2>&1; then
        echo "[entrypoint] TLS config failed validation — falling back to HTTP so the readers keep working."
        cp /etc/nginx/nginx-http.conf /etc/nginx/conf.d/default.conf
    fi
fi

# Start backend in background
cd /app && node server.js &

# Start Nginx in foreground
exec nginx -g 'daemon off;'
