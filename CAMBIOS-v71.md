# v71 · Bodega del camión y traslados entre bodegas

## Qué cambió

**La bodega del camión: de ahí salen todos los pedidos**
- Todo pedido que sube al camión se descuenta de **la bodega del camión** (la Oficina), que se elige en Bodegas y productos › Portal de clientes (el mismo ajuste que define el stock de referencia del portal). Sin elegir, se usa la que se llama «Oficina».
- **En el panel,** la ventana «Descargar bodega» propone siempre la bodega del camión. Antes proponía la de más stock de cada producto, que casi siempre era una bodega grande. Se puede cambiar a mano en un caso excepcional.
- **En el portal del bodeguero,** al marcar «Salió» se descuenta siempre de la bodega del camión, no de la que el encargado tenga elegida en su barra (antes, si nunca la elegía, quedaba Almafrigo).
- Las rutas nuevas también parten con la bodega del camión.
- El momento no cambia: el stock se descuenta cuando el pedido sale en el camión.


**Bodega (bodega.html) › 🔁 Traslados (pestaña nueva)**
- Los traslados entre bodegas se manejan aparte de los pedidos de clientes, en su propia pestaña (también en la barra lateral, en Inventario).
- **Agendar traslado:** eliges desde qué bodega, hacia cuál (parte en la Bodega Oficina, de donde sale el camión), el día del camión, la zona de la ruta, una nota para el camión y los productos con su cantidad en cajas o unidades. Junto a cada producto se ve cuánto hay en la bodega de origen.
- **La lista** muestra cada traslado en su etapa: «Falta registrar en stock» (en el camión o ya entregado), «Agendados · esperan al camión» y «Registrados».
- **Registrar recepción:** cuando el producto llega, registras la recepción. Si llegó otra cantidad, la corriges antes. Se anota un traslado por producto, de la bodega de origen a la de destino, firmado por quien registra y ligado al traslado, y el traslado queda entregado.
- **Quitar:** un traslado que todavía no sale se puede quitar, y sale también de la ruta.

**En la ruta del camión**
- El traslado entra directo a «Por despachar» como parada especial **🔁 Traslado**, sin pasar por facturación. Se le asigna camión y día como a cualquier pedido.
- En el portal del bodeguero aparece como «🔁 Traslado entre bodegas», con la indicación de subirlo al camión. No se carga ni se descuenta como venta: el stock lo registra la oficina.

**Panel y Worker**
- El panel conoce el tipo «traslado»: no lo manda a facturar ni le ofrece «Descargar bodega».
- El stock de referencia del portal de clientes no cuenta los traslados como pedidos comprometidos.

## Instalación, paso a paso

Si todavía no instalas las versiones anteriores, primero corre `sql/v69-clave-clientes.sql` (y los SQL de precios, si quieres cargarlos).

**1. Base de datos (Supabase)**
1. SQL Editor → New query → pega `sql/v71-traslados.sql` → Run.
2. Abajo deben aparecer las tres columnas nuevas: `bodega_origen_id`, `bodega_destino_id` y `traslado_lineas`.

**2. Worker (Cloudflare)**
1. Workers & Pages → `nativo-proxy` → Edit code → reemplaza todo por `worker.js` → Deploy.
2. `/salud` debe decir `v71 · traslados entre bodegas en la ruta del camión`.

**3. Pantallas (GitHub)**
1. Sube y reemplaza: `bodega.html`, `admin.html`, `bodeguero.html`, `index.html`, `compras.html`, `kpi.html`, `maquinas.html` y `planner.html` (estos cuatro por el ítem nuevo de la barra lateral).
2. Sube también `CAMBIOS-v71.md`, `sql/v71-traslados.sql` y la carpeta `pruebas/`.

**4. Probar**
1. Bodega → 🔁 Traslados → **+ Agendar traslado** con un producto de prueba.
2. En el panel, en «Por despachar», debe aparecer como **🔁 Traslado**, sin pasar por «Por facturar».
3. Abre «Descargar bodega» en un pedido: cada producto debe proponer la Bodega Oficina.
4. De vuelta en Traslados, aprieta **Registrar recepción**: en Movimientos debe aparecer el traslado de una bodega a la otra.
5. Si fue solo una prueba, revierte el movimiento desde Movimientos.

## Pruebas

- `npm test`: 108 pruebas del Worker (la nueva: un traslado no reserva stock).
- `npm run test:pantallas`: 154 pruebas en navegador. Las nuevas revisan que el panel proponga la bodega del camión aunque una bodega grande tenga más stock (y la elegida en la configuración), que el bodeguero descuente de ella al salir, y además agendan un traslado (y rechazan origen y destino iguales), revisan lo que se guarda, registran la recepción con una cantidad distinta y confirman que queda entregado; además, que el panel lo mande a «Por despachar» sin descargo y que el bodeguero no lo marque como «no subió».
