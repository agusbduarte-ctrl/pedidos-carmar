# vendor/

Dependencias guardadas dentro del repo en lugar de bajarlas de un registro.

## xlsx-0.20.3.tgz

SheetJS (`xlsx`), usado para leer el Excel del catálogo (`src/lib/excel-parser.ts`).

- **Por qué está acá:** la última versión de `xlsx` publicada en npm es la 0.18.5, que tiene vulnerabilidades altas sin corrección ahí (Prototype Pollution GHSA-4r6h-8v6p-xvw6 y ReDoS GHSA-5pgg-2g8v-p4x9). SheetJS publica las versiones corregidas solo en su CDN. Guardar el tarball en el repo hace que la instalación no dependa de que ese CDN siga disponible.
- **Origen:** https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
- **SHA-256:** `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- **Se instala con:** `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` en `apps/api/package.json`.

Verificar el archivo:

```bash
sha256sum apps/api/vendor/xlsx-0.20.3.tgz                       # Linux / Git Bash
Get-FileHash apps\api\vendor\xlsx-0.20.3.tgz -Algorithm SHA256   # PowerShell
```

Para actualizar: bajar la versión nueva desde `cdn.sheetjs.com`, reemplazar el archivo, actualizar `package.json`, este README (nombre y hash) y correr `pnpm install`.
