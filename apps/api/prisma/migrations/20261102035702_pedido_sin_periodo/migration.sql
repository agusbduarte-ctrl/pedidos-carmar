-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_periodoId_fkey";

-- AlterTable
ALTER TABLE "Pedido" ALTER COLUMN "periodoId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
