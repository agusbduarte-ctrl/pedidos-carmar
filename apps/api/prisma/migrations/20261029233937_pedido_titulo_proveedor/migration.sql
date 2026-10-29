-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "proveedorId" TEXT,
ADD COLUMN     "titulo" VARCHAR(80);

-- CreateIndex
CREATE INDEX "Pedido_proveedorId_idx" ON "Pedido"("proveedorId");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
