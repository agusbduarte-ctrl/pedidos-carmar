-- DropForeignKey
ALTER TABLE "Producto" DROP CONSTRAINT "Producto_proveedorId_fkey";

-- AlterTable
ALTER TABLE "Producto" ALTER COLUMN "proveedorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Rubro" ADD COLUMN     "codigo" TEXT;

-- CreateTable
CREATE TABLE "CodigoBarras" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoBarras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodigoBarras_codigo_key" ON "CodigoBarras"("codigo");

-- CreateIndex
CREATE INDEX "CodigoBarras_productoId_idx" ON "CodigoBarras"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Rubro_codigo_key" ON "Rubro"("codigo");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoBarras" ADD CONSTRAINT "CodigoBarras_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
