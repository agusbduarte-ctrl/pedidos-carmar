-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'DEPOSITO';

-- AlterTable
ALTER TABLE "ItemPedido" ADD COLUMN     "cantidadDeposito" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "fechaRevisionDeposito" TIMESTAMP(3),
ADD COLUMN     "fechaTrasladoEnviado" TIMESTAMP(3),
ADD COLUMN     "revisadoDepositoPorId" TEXT,
ADD COLUMN     "trasladoEnviadoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_revisadoDepositoPorId_fkey" FOREIGN KEY ("revisadoDepositoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_trasladoEnviadoPorId_fkey" FOREIGN KEY ("trasladoEnviadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
