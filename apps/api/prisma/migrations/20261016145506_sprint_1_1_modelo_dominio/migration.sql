-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'ENCARGADA', 'REPOSITOR');

-- CreateEnum
CREATE TYPE "Sucursal" AS ENUM ('CARMAR_1', 'CARMAR_2');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('BORRADOR', 'ENVIADO', 'DEVUELTO', 'APROBADO');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "EstadoConsolidado" AS ENUM ('BORRADOR', 'APROBADO');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UN', 'KG', 'LT', 'CAJA', 'PACK');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "sucursal" "Sucursal",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubro" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rubro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositorRubro" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "rubroId" TEXT NOT NULL,
    "sucursal" "Sucursal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositorRubro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rubroId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "unidad" "UnidadMedida" NOT NULL DEFAULT 'UN',
    "precioReferencia" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Periodo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaApertura" TIMESTAMP(3) NOT NULL,
    "fechaCierre" TIMESTAMP(3),
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "repositorId" TEXT NOT NULL,
    "sucursal" "Sucursal" NOT NULL,
    "periodoId" TEXT NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'BORRADOR',
    "observacion" VARCHAR(500),
    "creadoPorId" TEXT NOT NULL,
    "enviadoPorId" TEXT,
    "devueltoPorId" TEXT,
    "aprobadoPorId" TEXT,
    "fechaEnvio" TIMESTAMP(3),
    "fechaDevolucion" TIMESTAMP(3),
    "fechaAprobacion" TIMESTAMP(3),
    "comentarioDevolucion" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "observacion" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consolidado" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "estado" "EstadoConsolidado" NOT NULL DEFAULT 'BORRADOR',
    "aprobadoPorId" TEXT,
    "fechaAprobacion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consolidado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemConsolidado" (
    "id" TEXT NOT NULL,
    "consolidadoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidadTotal" DECIMAL(10,2) NOT NULL,
    "cantidadEditada" DECIMAL(10,2),
    "observacion" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemConsolidado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_rol_idx" ON "Usuario"("rol");

-- CreateIndex
CREATE INDEX "Usuario_sucursal_idx" ON "Usuario"("sucursal");

-- CreateIndex
CREATE INDEX "Usuario_activo_idx" ON "Usuario"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "Rubro_nombre_key" ON "Rubro"("nombre");

-- CreateIndex
CREATE INDEX "RepositorRubro_usuarioId_idx" ON "RepositorRubro"("usuarioId");

-- CreateIndex
CREATE INDEX "RepositorRubro_rubroId_idx" ON "RepositorRubro"("rubroId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositorRubro_usuarioId_rubroId_sucursal_key" ON "RepositorRubro"("usuarioId", "rubroId", "sucursal");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_nombre_key" ON "Proveedor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");

-- CreateIndex
CREATE INDEX "Producto_rubroId_idx" ON "Producto"("rubroId");

-- CreateIndex
CREATE INDEX "Producto_proveedorId_idx" ON "Producto"("proveedorId");

-- CreateIndex
CREATE INDEX "Producto_activo_idx" ON "Producto"("activo");

-- CreateIndex
CREATE INDEX "Producto_nombre_idx" ON "Producto"("nombre");

-- CreateIndex
CREATE INDEX "Periodo_estado_idx" ON "Periodo"("estado");

-- CreateIndex
CREATE INDEX "Periodo_fechaApertura_idx" ON "Periodo"("fechaApertura");

-- CreateIndex
CREATE INDEX "Pedido_repositorId_idx" ON "Pedido"("repositorId");

-- CreateIndex
CREATE INDEX "Pedido_periodoId_idx" ON "Pedido"("periodoId");

-- CreateIndex
CREATE INDEX "Pedido_estado_idx" ON "Pedido"("estado");

-- CreateIndex
CREATE INDEX "Pedido_sucursal_idx" ON "Pedido"("sucursal");

-- CreateIndex
CREATE INDEX "ItemPedido_pedidoId_idx" ON "ItemPedido"("pedidoId");

-- CreateIndex
CREATE INDEX "ItemPedido_productoId_idx" ON "ItemPedido"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPedido_pedidoId_productoId_key" ON "ItemPedido"("pedidoId", "productoId");

-- CreateIndex
CREATE INDEX "Consolidado_periodoId_idx" ON "Consolidado"("periodoId");

-- CreateIndex
CREATE INDEX "Consolidado_estado_idx" ON "Consolidado"("estado");

-- CreateIndex
CREATE INDEX "ItemConsolidado_consolidadoId_idx" ON "ItemConsolidado"("consolidadoId");

-- CreateIndex
CREATE INDEX "ItemConsolidado_productoId_idx" ON "ItemConsolidado"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemConsolidado_consolidadoId_productoId_key" ON "ItemConsolidado"("consolidadoId", "productoId");

-- AddForeignKey
ALTER TABLE "RepositorRubro" ADD CONSTRAINT "RepositorRubro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositorRubro" ADD CONSTRAINT "RepositorRubro_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "Rubro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "Rubro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_repositorId_fkey" FOREIGN KEY ("repositorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_devueltoPorId_fkey" FOREIGN KEY ("devueltoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consolidado" ADD CONSTRAINT "Consolidado_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consolidado" ADD CONSTRAINT "Consolidado_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemConsolidado" ADD CONSTRAINT "ItemConsolidado_consolidadoId_fkey" FOREIGN KEY ("consolidadoId") REFERENCES "Consolidado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemConsolidado" ADD CONSTRAINT "ItemConsolidado_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
