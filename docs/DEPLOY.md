# Guía de instalación en producción

Esta guía deja el sistema de pedidos funcionando en **un solo servidor** (Ubuntu 24.04 en AWS Lightsail) con Docker. Se hace una vez; después actualizar es un solo comando.

Qué se instala (todo con Docker Compose, archivo `docker-compose.prod.yml`):

- **db**: la base de datos (Postgres 16). No es accesible desde internet.
- **api**: el sistema (Fastify + Prisma). No es accesible desde internet.
- **web**: Caddy. Muestra la página, hace de intermediario con la API (`/api`) y consigue solo el candado HTTPS.

> **NUNCA correr `seed` en producción.** Borra todo el catálogo y crea usuarios con contraseñas de prueba.

Todos los comandos de las secciones 2 en adelante se escriben en el servidor, salvo que diga "en tu PC".

---

## 1. Crear el servidor en Lightsail

1. Entrar a <https://lightsail.aws.amazon.com> y elegir **Create instance**.
2. Región: **São Paulo (sa-east-1)**.
3. Plataforma **Linux/Unix**, sistema **Ubuntu 24.04 LTS** (solo sistema operativo, sin aplicaciones).
4. Plan: **2 GB de memoria**.
5. En "SSH key pair" crear o elegir una llave y **descargar el archivo `.pem`**. Guardarlo bien: es la llave para entrar. Si se pierde, no hay forma de recuperarla.
6. Ponerle un nombre (por ejemplo `carmar-pedidos`) y crear.
7. Pestaña **Networking** de la instancia:
   - **Create static IP** y asociarla a la instancia (así la IP no cambia si se reinicia).
   - **IPv4 Firewall**: dejar **solo** estas reglas: SSH (22), HTTP (80) y HTTPS (443). Borrar cualquier otra.
   - Para que HTTP/3 funcione se puede agregar también UDP 443. Es opcional.

Anotar la IP estática. En esta guía se llama `IP-DEL-SERVIDOR`.

## 2. Entrar por SSH

En tu PC (PowerShell), con la llave descargada:

```powershell
ssh -i C:\ruta\a\la-llave.pem ubuntu@IP-DEL-SERVIDOR
```

La primera vez pregunta si confiás en el servidor: escribir `yes`. El usuario inicial se llama `ubuntu`.

## 3. Seguridad básica del servidor

Actualizar el sistema:

```bash
sudo apt update && sudo apt upgrade -y
```

Firewall del propio servidor (`ufw`). **Primero se permite SSH**, si no te dejás afuera:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status
```

Actualizaciones de seguridad automáticas:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

(Elegir "Yes" en la pantalla.)

> Docker se salta el `ufw` cuando publica puertos. No importa acá porque solo el contenedor `web` publica puertos (80 y 443), pero por eso el firewall de Lightsail de la sección 1 es la barrera real.

## 4. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Cerrar la sesión (`exit`) y volver a entrar por SSH para que el cambio de grupo tenga efecto. Probar:

```bash
docker compose version
```

## 5. Bajar el código

```bash
cd ~
git clone URL-DEL-REPOSITORIO pedidos_carmar
cd pedidos_carmar
```

(Si el repositorio es privado, GitHub pide usuario y un token de acceso en lugar de la contraseña.)

## 6. Crear el archivo de variables `.env.prod`

```bash
cp deploy/.env.prod.example .env.prod
nano .env.prod
```

Generar las claves (se corre cada comando y se copia el resultado en el archivo):

```bash
openssl rand -hex 24    # para POSTGRES_PASSWORD
openssl rand -hex 48    # para JWT_SECRET
```

Completar:

| Variable | Qué poner |
|---|---|
| `DOMINIO` | La dirección de la web, **sin** `https://`. Ver sección 7. |
| `POSTGRES_PASSWORD` | La clave generada de 48 caracteres. |
| `JWT_SECRET` | La clave generada de 96 caracteres. |
| `CORS_ORIGIN` | `https://` + el mismo `DOMINIO`. |

Las demás (`JWT_EXPIRES_IN`, `NODE_ENV`, `TRUST_PROXY_HOPS`, `CATALOGO_XLSX_PATH`) se dejan como están. Guardar en nano con `Ctrl+O`, Enter, `Ctrl+X`.

Proteger el archivo:

```bash
chmod 600 .env.prod
```

**`.env.prod` no se sube a git ni se manda por mail o chat.** Guardá una copia de las claves en un gestor de contraseñas: si se pierde `JWT_SECRET` solo hay que generar otra (todos vuelven a iniciar sesión); `POSTGRES_PASSWORD` no se puede cambiar editando el archivo una vez creada la base.

## 7. Apuntar el dominio

Hay dos opciones:

- **Dominio propio** (por ejemplo `pedidos.carmar.com.ar`): en el panel donde se administra el dominio crear un **registro A** con nombre `pedidos` y valor `IP-DEL-SERVIDOR`. Puede tardar unos minutos en funcionar. Poner `DOMINIO=pedidos.carmar.com.ar`.
- **Provisorio sin dominio**: usar `sslip.io`, que convierte la IP en un nombre. Si la IP es `54.10.20.30`, el dominio es `pedidos.54-10-20-30.sslip.io` (puntos de la IP reemplazados por guiones). Poner `DOMINIO=pedidos.54-10-20-30.sslip.io`.

Caddy pide el certificado HTTPS solo, pero necesita que el nombre ya apunte al servidor y que los puertos 80 y 443 estén abiertos.

## 8. Levantar todo

Desde ahora, **todos** los comandos de Docker de esta guía llevan `-f docker-compose.prod.yml --env-file .env.prod` (si falta, Docker no lee las claves):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

La primera vez tarda varios minutos (descarga y compila). Al terminar, ver el estado:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Los tres servicios tienen que figurar como `Up` (la API, además, `healthy`). Al arrancar, la API crea las tablas sola. Probar en el navegador: `https://TU-DOMINIO/api/health` tiene que mostrar `"status":"ok"`.

## 9. Crear el primer administrador

Elegir un email y una contraseña de **al menos 10 caracteres**:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec \
  -e ADMIN_EMAIL=correo@ejemplo.com -e ADMIN_PASSWORD='una-clave-larga-y-propia' \
  api pnpm --filter api crear-admin
```

Si ya existe un usuario con ese email, avisa y no lo pisa. El aviso `.env not found. Continuing without it.` es normal.

Después entrar a la web con ese usuario y crear desde la pantalla de administración al resto de las personas.

## 10. Cargar el catálogo

En **tu PC** (no en el servidor), copiar el Excel al servidor. El archivo tiene que terminar llamándose `catalogo.xlsx`:

```powershell
scp -i C:\ruta\a\la-llave.pem C:\ruta\al\excel.xlsx ubuntu@IP-DEL-SERVIDOR:~/pedidos_carmar/data/catalogo.xlsx
```

Si la carpeta `data` no existe, crearla antes en el servidor con `mkdir -p ~/pedidos_carmar/data`.

Importar (se puede repetir cada vez que haya un Excel nuevo; no borra nada):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api pnpm --filter api import-catalogo
```

El Excel está en `data/`, una carpeta que **no** va a git ni entra a las imágenes de Docker.

## 11. Asignar las unidades

Los productos nuevos entran en `UN` (unidad). Hay que pasar a kilos y a packs los rubros que corresponden. **Siempre primero el simulacro**, que solo cuenta cuántos productos cambiarían:

```bash
# Simulacro: rubro 104 a KG
docker compose -f docker-compose.prod.yml --env-file .env.prod exec \
  -e UNIDAD=KG -e RUBROS=104 api pnpm --filter api asignar-unidad

# Simulacro: rubro 47 a PACK
docker compose -f docker-compose.prod.yml --env-file .env.prod exec \
  -e UNIDAD=PACK -e RUBROS=47 api pnpm --filter api asignar-unidad
```

Si las cantidades tienen sentido, repetir el mismo comando agregando `-e APLICAR=1`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec \
  -e UNIDAD=KG -e RUBROS=104 -e APLICAR=1 api pnpm --filter api asignar-unidad

docker compose -f docker-compose.prod.yml --env-file .env.prod exec \
  -e UNIDAD=PACK -e RUBROS=47 -e APLICAR=1 api pnpm --filter api asignar-unidad
```

## 12. Copias de seguridad

El script `deploy/backup.sh` guarda la base comprimida en `/var/backups/carmar/AAAA-MM-DD_HHMM.sql.gz`, conserva las últimas 14 y sale con error si algo falla.

Preparar la carpeta y probarlo una vez a mano:

```bash
sudo mkdir -p /var/backups/carmar
sudo chown ubuntu:ubuntu /var/backups/carmar
bash ~/pedidos_carmar/deploy/backup.sh
ls -lh /var/backups/carmar
```

Programarlo todos los días a las 3:00 (hora del servidor, que es UTC):

```bash
crontab -e
```

(Si pregunta qué editor, elegir nano.) Agregar al final esta línea:

```
0 3 * * * bash /home/ubuntu/pedidos_carmar/deploy/backup.sh >> /var/backups/carmar/backup.log 2>&1
```

Revisar de vez en cuando que haya un archivo nuevo por día y que `backup.log` no tenga errores.

### Copiar los backups fuera del servidor

Un backup que está solo en el mismo servidor no sirve si el servidor se pierde. Cada semana, como mínimo, en **tu PC**:

```powershell
scp -i C:\ruta\a\la-llave.pem "ubuntu@IP-DEL-SERVIDOR:/var/backups/carmar/*.sql.gz" C:\backups\carmar\
```

También conviene activar los **snapshots automáticos** de Lightsail (pestaña Snapshots de la instancia).

### Restaurar un backup

Es un procedimiento que **reemplaza todos los datos actuales** por los del backup. Probado: se borra la base, se recrea y se carga el archivo. Si el backup está en tu PC, primero subirlo al servidor con `scp`.

Desde `~/pedidos_carmar`:

```bash
# 1. Elegir el archivo
ls -lh /var/backups/carmar/
ARCHIVO=/var/backups/carmar/AAAA-MM-DD_HHMM.sql.gz

# 2. Verificar que el archivo no esté dañado
gzip -t "$ARCHIVO"

# 3. Parar la web y la API (la base sigue arriba)
docker compose -f docker-compose.prod.yml --env-file .env.prod stop web api

# 4. Borrar y recrear la base vacía
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  psql -U carmar -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE pedidos_carmar WITH (FORCE)' \
  -c 'CREATE DATABASE pedidos_carmar OWNER carmar'

# 5. Cargar el backup
gunzip -c "$ARCHIVO" | docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  psql -U carmar -d pedidos_carmar -v ON_ERROR_STOP=1 -q

# 6. Volver a levantar todo
docker compose -f docker-compose.prod.yml --env-file .env.prod start api web
```

Si el paso 5 muestra un error, no levantar nada: repetir desde el paso 4 o pedir ayuda. Al final, abrir `https://TU-DOMINIO/api/health` y comprobar que las cantidades (`usuarios`, `productos`) son las esperadas.

Para ensayar la restauración sin riesgo, hacerlo en un servidor de prueba o con un nombre de proyecto aparte (`-p carmar-prueba`) y otro `DOMINIO`.

## 13. Actualizar el sistema

Cuando haya cambios nuevos en el repositorio:

```bash
cd ~/pedidos_carmar
bash deploy/backup.sh        # por las dudas, antes de tocar nada
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Las migraciones de la base se aplican solas al arrancar la API. Los datos no se tocan.

## 14. Ver qué pasa (logs)

```bash
# Últimas 100 líneas de la API y seguir en vivo (salir con Ctrl+C)
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 100 -f api

# Caddy (certificados, accesos)
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 100 web

# Base de datos
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 100 db
```

Reiniciar un servicio: `docker compose -f docker-compose.prod.yml --env-file .env.prod restart api`.

## Problemas comunes

- **La web no carga o dice que el certificado no es válido**: el `DOMINIO` no apunta a la IP del servidor, o los puertos 80/443 no están abiertos en el firewall de Lightsail. Mirar los logs de `web`.
- **La API no arranca**: mirar los logs de `api`. Lo más común es una variable mal copiada en `.env.prod`.
- **No puedo iniciar sesión pero el usuario existe**: `CORS_ORIGIN` tiene que ser exactamente `https://` + el `DOMINIO`.
- **Quedé sin espacio**: `docker system prune` borra imágenes viejas sin usar (no toca los datos de la base). Nunca usar la opción `--volumes`: borraría la base.
- **Nunca** correr `docker compose ... down -v` en producción: borra el volumen de la base de datos.
