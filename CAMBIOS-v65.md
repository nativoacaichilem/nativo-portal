# v65 · Disponibilidad en el portal, links de Pichilemu y Por facturar por orden de llegada

## Qué cambió

**Qué se puede pedir lo decides tú (Pedidos › Portal, nueva)**
- Una lista con todo el catálogo. Cada producto, en cada portal (el general y los links de Pichilemu), está **Disponible**, **Agotado** u **Oculto**. Un clic y queda guardado.
- Al lado de cada producto se ve el stock como referencia: lo que hay en la bodega del portal (por omisión, la Oficina) menos lo que ya está pedido y todavía no sale. Almafrigo, Golden Frost y Pichilemu no cuentan para el portal general. Si un producto está marcado agotado y volvió a haber, la fila lo avisa; la marca no se quita sola.
- Dos ayudas en bloque, que preguntan antes de marcar: «Marcar agotado lo que está en cero» y, en Pichilemu, «Ocultar lo que nunca pasó por Pichilemu».
- El stock nunca bloquea nada por sí solo. Al público no se le muestra ninguna cantidad.

**Portal de clientes (index.html)**
- Lo agotado se ve apagado, con «No disponible por ahora», y no se puede pedir. Lo oculto no aparece.
- No hay topes ni alertas a mitad del pedido: lo que el cliente ve al entrar es lo que puede pedir.
- Si la disponibilidad no se puede leer, todo queda disponible, como antes, para no perder ventas por una falla de red.
- El **Açaí Puro (4×100 g)** vuelve a estar en el portal, por caja de 15, con el mismo nombre y formato que en el panel. Si hay que sacarlo, se marca «Oculto» en Pedidos › Portal.

**Links de las vendedoras de Pichilemu**
- Cada vendedora tiene su link: `index.html?pichilemu=<código>`. Sus clientes ven lo que marques como disponible para Pichilemu en Pedidos › Portal.
- El pedido llega al panel marcado «🏖️ Pichilemu · nombre». El nombre lo pone el Worker a partir del código: un cliente no puede asignarle una venta a otra vendedora escribiendo su nombre.
- Las vendedoras se crean, se copian sus links y se desactivan en Bodegas y productos › Portal de clientes. Desactivar no borra: los pedidos que ya entraron siguen diciendo de quién son.

**Panel (admin.html)**
- «Por facturar» va por orden de llegada, el primero que entró arriba, con su número en la fila, la hora de llegada, la dirección y el RUT en su propia línea, y un producto por línea. Lo ya entregado sin factura sigue primero, en rojo.
- Quien factura trabaja en el mismo panel, con la clave de admin, en «Por facturar» (la pestaña con que abre el panel). Pone el número en la fila y el pedido pasa a «Por despachar». Si se equivoca, se corrige desde la tarjeta del pedido, como siempre.
- La tarjeta del pedido tiene «🏖️ Pichilemu» como tercer origen, junto a mayorista y web. Antes, guardar la tarjeta le habría borrado el origen a un pedido de Pichilemu.
- Las tareas y el retiro de un lote de la sala ya no ofrecen «Descargar bodega» ni aparecen como pendientes de descargo: no tienen nada que descontar, y en el lote se habría descontado al revés.

**Bodegas y productos (bodega.html)**
- Tarjeta nueva «🛒 Portal de clientes»: de qué bodega sale el stock de referencia de cada portal, y la lista de vendedoras con sus links.
- La barra lateral de todas las pantallas tiene el ítem «🛍️ Portal de clientes».

## Qué se limpió

- 16 funciones y una variable que ya nadie usaba: botones viejos del panel (cortesías, retiros pendientes, sin descargo), el armado de rutas que el bodeguero ya no hace, y restos en máquinas y producción. Se revisó en cadena: al borrar una, se volvió a buscar si alguna quedaba huérfana.
- `admin-prueba.html`: una copia vieja del panel (v62) que seguía publicada. **Hay que borrarla también de GitHub.**
- Un comentario del Worker que decía lo contrario de lo que hace el código (las tablas que lee el bodeguero).

## Instalación, paso a paso

**1. Base de datos (Supabase)**
1. Entra a Supabase → tu proyecto → SQL Editor → New query.
2. Pega el contenido de `sql/v65-pichilemu.sql` y aprieta Run.
3. Abajo debe aparecer la columna `vendedora`.

**2. Worker (Cloudflare)**
1. Workers & Pages → `nativo-proxy` → Edit code. Reemplaza todo por `worker.js` y aprieta Deploy.
2. Abre `https://nativo-proxy.mkitzing.workers.dev/salud`: debe decir `v65`. No hay variables nuevas.

**3. Archivos (GitHub)**
1. Sube y reemplaza: `index.html`, `admin.html`, `bodega.html`, `bodeguero.html`, `produccion.html`, `maquinas.html`, `compras.html`, `kpi.html` y `planner.html` (estas tres por el ítem nuevo de la barra lateral).
2. Sube los nuevos: `README.md`, `package.json`, la carpeta `pruebas/` y `sql/v65-pichilemu.sql`.
3. Borra `admin-prueba.html`.

**4. Configurar el portal**
1. Entra al panel → Bodegas y productos → busca la tarjeta «🛒 Portal de clientes».
2. Revisa la bodega del portal general (viene marcada la Oficina; si el camión sale de Koolar, elige esa) y la de Pichilemu. Aprieta Guardar.
3. Agrega a cada vendedora, aprieta «Copiar link» y mándaselo.
4. Ve a Pedidos › Portal. Revisa el portal general y marca lo agotado. Después pasa a «Links de Pichilemu» y aprieta «Ocultar lo que nunca pasó por Pichilemu» para dejar su catálogo corto.

**5. La persona que factura**
- Entra al panel con la clave de admin. El panel abre en «Por facturar»: factura de arriba hacia abajo poniendo el número en cada fila.

**6. Probar**
1. Marca un producto como agotado en Pedidos › Portal y abre el portal como cliente: debe verse apagado y no dejar pedirlo. Márcalo oculto: no debe aparecer.
2. Abre un link de vendedora: debe verse su nombre arriba y solo lo disponible para Pichilemu.
3. Factura un pedido de prueba desde «Por facturar»: debe pasar a «Por despachar».

## Pruebas

- `npm test`: 35 pruebas del Worker (disponibilidad del portal sin cantidades, stock de referencia solo para admin con sus reservas, links de Pichilemu, pedidos sin las columnas nuevas).
- `npm run test:pantallas`: 44 pruebas en navegador (portal con agotados y ocultos, link de Pichilemu, link vencido, Por facturar por orden de llegada y facturar desde la fila, la página Portal, la tarjeta del portal en bodega y que todas las pantallas abran sin errores). Requiere Python con Playwright.

## Si algo falla

- **Marqué un producto y el portal no cambió:** el cliente tiene que volver a abrir el portal. Si sigue igual, revisa que el Worker esté en v65 (/salud).
- **El stock de referencia sale en cero en todo:** la bodega elegida no es la correcta. Cámbiala en la tarjeta del portal en Bodegas y productos.
- **Un pedido de Pichilemu llega con la vendedora escrita en el mensaje:** falta correr el SQL. El pedido se guardó igual.
