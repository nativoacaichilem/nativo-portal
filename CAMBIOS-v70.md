# v70 · Precios netos en el portal

## Qué cambió

**Panel (admin.html) › Portal de clientes › 🛍️ Qué se puede pedir**
- Cada producto tiene una columna **Precio neto** (sin IVA). Escribes el precio y se guarda al salir del campo (o con Enter). Queda con puntos de miles.
- **Vacío = sin precio:** ese producto no muestra precio en el portal.
- El precio es el mismo en el portal general y en los links de Pichilemu.

**Portal de pedidos (index.html)**
- El producto que tiene precio lo muestra bajo su formato, por ejemplo «$24.990 neto». El que no tiene precio se ve como siempre.
- El carro suma el total neto de lo elegido que tiene precio («3 productos seleccionados · $113.960 neto»).
- La orden de compra agrega **Precio neto** y **Subtotal** por línea y el **Total neto**. Si algún producto no tiene precio, va con una raya y la orden avisa que el total final se confirma en la factura. Siempre aclara que son valores netos, sin IVA.
- Con precios, el formato del producto va como línea chica bajo el nombre, para que la tabla quepa en el celular. Sin ningún precio, la orden queda igual que antes.

**Worker**
- Entrega los precios al portal junto con la disponibilidad. Solo pasan números enteros positivos: un precio raro se descarta y ese producto no muestra precio.

Los precios son solo para mostrar: el pedido se guarda igual que siempre y lo que se cobra lo define la factura.

## Instalación, paso a paso

No hay SQL: los precios se guardan en la tabla de ajustes que ya existe.

**1. Worker (Cloudflare)**
1. Workers & Pages → `nativo-proxy` → Edit code → reemplaza todo por `worker.js` → Deploy.
2. `https://nativo-proxy.mkitzing.workers.dev/salud` debe decir `v70 · precios netos en el portal`.

**2. Pantallas (GitHub)**
1. Sube y reemplaza `index.html` y `admin.html`.
2. Sube también `CAMBIOS-v70.md`, `package.json` y la carpeta `pruebas/`.

**3. Poner los precios**
1. Panel → Portal de clientes → 🛍️ Qué se puede pedir.
2. Escribe el precio neto de cada producto en su campo. Los que dejes vacíos no mostrarán precio.
3. Abre el portal con recarga forzada (Ctrl+Shift+R) y revisa un producto con precio y la orden de compra.

## Pruebas

- `npm test`: 35 + 54 + 12 + 7 pruebas del Worker (las 7 nuevas: precios guardados, descarte de montos raros y los mismos precios en Pichilemu).
- `npm run test:pantallas`: 133 pruebas en navegador. Las nuevas revisan el precio en el producto, el total del carro, la orden con subtotales y total (y el aviso del producto sin precio), que en el celular todo quepa y las filas queden parejas, la orden sin precios como antes, y la columna de precio del panel.
