#!/bin/sh
# Daily backup (M9-4): database dump + uploaded files, kept for RETENTION_DAYS days.
# Cron (as a user that may run docker), e.g. every night at 02:15:
#   15 2 * * * /opt/pos-apotek/deploy/backup.sh >> /var/log/pos-apotek-backup.log 2>&1
#
# Settings (environment or defaults):
#   BACKUP_DIR       where backups go                        (default /var/backups/pos-apotek)
#   RETENTION_DAYS   delete older backups                    (default 30)
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE               external PostgreSQL; or
#   COMPOSE_DB=1     dump from the compose `db` service instead
# Restore: see docs/DEPLOY.md.
set -eu

cd "$(dirname "$0")"
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pos-apotek}
RETENTION_DAYS=${RETENTION_DAYS:-30}
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
if [ "${COMPOSE_DB:-0}" = "1" ]; then
    docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$DB_FILE.tmp"
else
    pg_dump -Fc > "$DB_FILE.tmp"
fi
mv "$DB_FILE.tmp" "$DB_FILE"

# Uploads live in the API volume (/app/storage/uploads).
UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
docker compose exec -T api tar -czf - -C /app/storage uploads > "$UP_FILE.tmp"
mv "$UP_FILE.tmp" "$UP_FILE"

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete
echo "$(date '+%F %T') backup ok: $(basename "$DB_FILE") $(du -h "$DB_FILE" | cut -f1), $(basename "$UP_FILE") $(du -h "$UP_FILE" | cut -f1)"
