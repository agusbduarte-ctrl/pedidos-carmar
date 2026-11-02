# Plan de rediseño — que la app sea más práctica que WhatsApp

Acordado el 2026-11-02.

## El problema

1. **Armar un pedido cuesta más que mandarlo por WhatsApp.** El repositor busca cada producto entre 14.322 artículos y lo agrega de a uno, con pasos extra (período, título, confirmaciones).
2. **Se compra de más.** Carmar tiene un depósito externo (galpón) a cargo de Rodrigo. A veces se pide al proveedor mercadería que ya está en el galpón.
3. **El consolidado no sirve como está.** No muestra qué día se pidió cada cosa. Lo valioso es el historial: cuánto se pidió de cada producto, cuándo y a quién, para analizar después (ej.: cuánta Coca por semana, qué mes se vende más).
4. **La encargada igual tiene que escribirle a cada proveedor** a mano.

## Flujo nuevo

```
Repositor            Rodrigo (depósito)        Eli (encargada)               Salida
─────────            ──────────────────        ───────────────               ──────
Elige proveedor  →   Marca por producto   →    Revisa lo que falta comprar → Mensaje WhatsApp al proveedor
Completa cantidades  "hay en galpón: X"        Ajusta y aprueba            → Lista de traslado galpón → sucursal
Envía                                                                       → Queda en el historial
```

## Decisiones

| Tema | Decisión |
|---|---|
| Depósito | Primero **Rodrigo revisa cada pedido** (sin stock en la app). Más adelante, stock del galpón cargado en la app. |
| Orden de revisión | **Primero Rodrigo, después Eli.** Eli ve el pedido con lo del galpón ya descontado. |
| Períodos | **Se sacan.** Se trabaja pedido por pedido, con su fecha. Los datos viejos se conservan. |
| Consolidado | **Se reemplaza por Historial + Excel** con fecha, sucursal, repositor, proveedor, producto, cantidad pedida, cubierta por el galpón y comprada. |
| Título | Opcional. Si no se pone, se muestra "Proveedor – fecha". |
| Mensaje al proveedor | La app arma el texto. Botón "Enviar por WhatsApp" (abre WhatsApp con el número del proveedor y el texto) y botón "Copiar". La app **no** manda nada sola. |

## Fases

Cada fase se prueba en la PC y se sube a producción por separado. Ninguna borra datos existentes.

### Fase 1 — Pedido rápido y mensaje al proveedor

- El pedido arranca **eligiendo el proveedor** (obligatorio para pedidos nuevos).
- Al elegirlo, se muestra **lo que ya se le pidió antes a ese proveedor**, con un casillero de cantidad por producto. Se sale de los pedidos anteriores: no hace falta cargar a mano qué vende cada proveedor, la lista se arma sola con el uso.
- Botón **"Repetir último pedido"** a ese proveedor.
- El buscador queda para productos que nunca se pidieron.
- Eli, al aprobar, ve el **mensaje listo** con los botones "Enviar por WhatsApp" y "Copiar".
- Requisito previo (lo hace el admin o Eli): cargar los proveedores reales con su **WhatsApp** (el campo teléfono ya existe).

### Fase 2 — Rodrigo y el depósito externo

- Nuevo rol **DEPOSITO** (Rodrigo).
- Los pedidos enviados le llegan primero a él. Marca por producto cuánto hay en el galpón (0 si no hay) y lo da por revisado.
- Eli ve, por producto: pedido / sale del galpón / a comprar. El mensaje al proveedor lleva **solo lo que hay que comprar**.
- Al aprobar se genera la **lista de traslado** para Rodrigo: qué mandar a cada sucursal.
- Si Rodrigo no está, Eli puede aprobar igual con un aviso de que el pedido no pasó por el depósito.

### Fase 3 — Sin períodos y con historial

- Los pedidos dejan de depender de un período. Desaparece la pantalla de períodos.
- La pantalla de consolidado se reemplaza por el **Historial**: filtros por fechas, proveedor, sucursal y producto.
- **Excel del historial** con una fila por producto pedido: fecha, sucursal, repositor, proveedor, código, producto, rubro, pedido, del galpón, comprado. Sirve para tablas dinámicas (por semana, por mes, por proveedor).
- Más adelante: gráficos dentro de la app (ej.: Coca por semana).

### Fase 4 — Stock del galpón (más adelante)

- Rodrigo carga entradas y salidas del galpón.
- Mientras el repositor arma el pedido, la app avisa "hay 30 en el galpón".
- Solo vale la pena si Rodrigo puede mantenerlo al día. Se decide después de usar la Fase 2.

## Riesgos y cuidados

- Hay usuarios usando producción (Dani, Eli): cada migración tiene que conservar los pedidos existentes.
- Los pedidos viejos sin proveedor siguen visibles y aparecen en el historial como "Sin proveedor".
- Actualizar los manuales (`docs/manual/`) al terminar cada fase, sobre todo el del repositor.
