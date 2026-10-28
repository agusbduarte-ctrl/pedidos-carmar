#!/usr/bin/env bash
# Copia de seguridad de la base de datos (comprimida) en /var/backups/carmar.
# Se corre desde cualquier carpeta; guarda las últimas 14 y borra las más viejas.
# Si algo falla, sale con error (código distinto de 0) y no deja un archivo a medias.
#
# Variables opcionales: DIR_BACKUPS (carpeta destino), CANTIDAD_A_CONSERVAR (por defecto 14).
set -euo pipefail

DIR_BACKUPS="${DIR_BACKUPS:-/var/backups/carmar}"
CANTIDAD_A_CONSERVAR="${CANTIDAD_A_CONSERVAR:-14}"

# Ir a la raíz del repo (esta carpeta es deploy/)
cd "$(dirname "$0")/.."

mkdir -p "$DIR_BACKUPS"
destino="$DIR_BACKUPS/$(date +%Y-%m-%d_%H%M).sql.gz"
temporal="$destino.tmp"
trap 'rm -f "$temporal"' EXIT

# -T: sin terminal (necesario para cron). Usuario y base salen de las variables del contenedor.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$temporal"

# Comprobar que el archivo es válido y no está vacío
gzip -t "$temporal"
if [ ! -s "$temporal" ]; then
  echo "ERROR: el backup quedó vacío" >&2
  exit 1
fi
mv "$temporal" "$destino"
echo "Backup listo: $destino"

# Conservar solo los últimos N
ls -1t "$DIR_BACKUPS"/*.sql.gz 2>/dev/null | tail -n +"$((CANTIDAD_A_CONSERVAR + 1))" | xargs -r rm -f --
