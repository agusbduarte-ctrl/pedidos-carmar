import { PrismaClient, Rol, Sucursal, UnidadMedida,
         EstadoPeriodo } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // 1. Limpieza en orden correcto (respetando FKs RESTRICT)
  console.log('🧹 Limpiando tablas...');
  await prisma.itemConsolidado.deleteMany();
  await prisma.consolidado.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.periodo.deleteMany();
  await prisma.repositorRubro.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.rubro.deleteMany();
  await prisma.usuario.deleteMany();

  // 2. Rubros
  console.log('📂 Creando rubros...');
  const rubrosData = [
    { nombre: 'Limpieza' },
    { nombre: 'Perfumería' },
    { nombre: 'Condimentos' },
    { nombre: 'Panadería' },
    { nombre: 'Bazar' },
  ];
  const rubros = await Promise.all(
    rubrosData.map(r => prisma.rubro.create({ data: r }))
  );
  const [limpieza, perfumeria, condimentos, panaderia, bazar] = rubros;

  // 3. Proveedores
  console.log('🏭 Creando proveedores...');
  const proveedoresData = [
    { nombre: 'Distribuidora Norte', email: 'norte@example.com' },
    { nombre: 'Mayorista Sur', email: 'sur@example.com' },
    { nombre: 'Alimentos del Centro', email: 'centro@example.com' },
  ];
  const proveedores = await Promise.all(
    proveedoresData.map(p => prisma.proveedor.create({ data: p }))
  );
  const [distNorte, maySur, aliCentro] = proveedores;

  // 4. Productos (10, repartidos entre rubros)
  console.log('📦 Creando productos...');
  const productosData = [
    { codigo: 'PROD-001', nombre: 'Detergente 500ml',
      rubroId: limpieza.id, proveedorId: distNorte.id,
      unidad: UnidadMedida.UN, precioReferencia: 1500 },
    { codigo: 'PROD-002', nombre: 'Lavandina 1L',
      rubroId: limpieza.id, proveedorId: distNorte.id,
      unidad: UnidadMedida.LT, precioReferencia: 800 },
    { codigo: 'PROD-003', nombre: 'Jabón líquido 250ml',
      rubroId: limpieza.id, proveedorId: maySur.id,
      unidad: UnidadMedida.UN, precioReferencia: 1200 },
    { codigo: 'PROD-004', nombre: 'Shampoo 400ml',
      rubroId: perfumeria.id, proveedorId: maySur.id,
      unidad: UnidadMedida.UN, precioReferencia: 3500 },
    { codigo: 'PROD-005', nombre: 'Desodorante spray',
      rubroId: perfumeria.id, proveedorId: maySur.id,
      unidad: UnidadMedida.UN, precioReferencia: 2800 },
    { codigo: 'PROD-006', nombre: 'Orégano 50g',
      rubroId: condimentos.id, proveedorId: aliCentro.id,
      unidad: UnidadMedida.UN, precioReferencia: 450 },
    { codigo: 'PROD-007', nombre: 'Pimienta negra 50g',
      rubroId: condimentos.id, proveedorId: aliCentro.id,
      unidad: UnidadMedida.UN, precioReferencia: 600 },
    { codigo: 'PROD-008', nombre: 'Pan francés',
      rubroId: panaderia.id, proveedorId: aliCentro.id,
      unidad: UnidadMedida.KG, precioReferencia: 2200 },
    { codigo: 'PROD-009', nombre: 'Vaso de vidrio',
      rubroId: bazar.id, proveedorId: distNorte.id,
      unidad: UnidadMedida.UN, precioReferencia: 900 },
    { codigo: 'PROD-010', nombre: 'Plato playo',
      rubroId: bazar.id, proveedorId: distNorte.id,
      unidad: UnidadMedida.UN, precioReferencia: 1100 },
  ];
  const productos = await Promise.all(
    productosData.map(p => prisma.producto.create({ data: p }))
  );

  // 5. Usuarios
  console.log('👥 Creando usuarios...');
  const [adminHash, encargadaHash, pinHash] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('encargada123', 10),
    bcrypt.hash('1234', 10),
  ]);

  const admin = await prisma.usuario.create({
    data: {
      email: 'admin@carmar.com',
      passwordHash: adminHash,
      nombre: 'Admin',
      rol: Rol.ADMIN,
    },
  });

  const encargada = await prisma.usuario.create({
    data: {
      email: 'encargada@carmar.com',
      passwordHash: encargadaHash,
      nombre: 'Encargada de Compras',
      rol: Rol.ENCARGADA,
    },
  });

  const repositor = await prisma.usuario.create({
    data: {
      nombre: 'Jorge Repositor',
      pinHash: pinHash,
      rol: Rol.REPOSITOR,
      sucursal: Sucursal.CARMAR_1,
    },
  });

  // 6. Asignar rubros al repositor
  console.log('🔗 Asignando rubros al repositor...');
  await prisma.repositorRubro.createMany({
    data: [
      { usuarioId: repositor.id, rubroId: limpieza.id,
        sucursal: Sucursal.CARMAR_1 },
      { usuarioId: repositor.id, rubroId: bazar.id,
        sucursal: Sucursal.CARMAR_1 },
    ],
  });

  // 7. Período abierto
  console.log('📅 Creando período abierto...');
  await prisma.periodo.create({
    data: {
      nombre: 'Período Octubre 2026',
      fechaApertura: new Date(),
      estado: EstadoPeriodo.ABIERTO,
    },
  });

  console.log('✅ Seed completado:');
  console.log(`   - ${rubros.length} rubros`);
  console.log(`   - ${proveedores.length} proveedores`);
  console.log(`   - ${productos.length} productos`);
  console.log(`   - 3 usuarios (admin, encargada, repositor)`);
  console.log(`   - Admin: ${admin.email}`);
  console.log(`   - Encargada: ${encargada.email}`);
  console.log(`   - 2 rubros asignados al repositor`);
  console.log(`   - 1 período abierto`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
