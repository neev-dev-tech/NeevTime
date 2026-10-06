# Debian 12 (bookworm). This was node:18-bullseye: Debian 11 reached end of
# life on 31 Aug 2026, its security packages were withdrawn from the mirror,
# and a fresh build failed on apt 404s (CI, 5 Oct 2026). Node 20 matches the
# combined image (root Dockerfile) and CI.
FROM node:20-bookworm

WORKDIR /app

# Install build dependencies for node-zklib/native modules
# python3/make/g++ build native modules. postgresql-client-15 is what the backup
# and restore features shell out to — pg_dump and pg_restore were never
# installed in any image of this application, so every scheduled backup has
# failed since the feature was written. Version 15 to match the server: pg_dump
# refuses to dump a server newer than itself, and Debian ships an older one.
RUN apt-get update \
    && apt-get install -y python3 make g++ curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl --fail -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
         https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y postgresql-client-15 smbclient \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

# Expose the API port and ADMS port
EXPOSE 3001

# Start the application with schema migration
CMD ["sh", "-c", "node scripts/fix_production_schema.js && npm start"]
