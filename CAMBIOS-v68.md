# v68 · Días de reparto en el portal

## Qué cambió

**Portal de pedidos (index.html)**
- Arriba de todo aparecen los **días de reparto**: cada día con la zona donde se reparte y sus comunas. En computador van en una fila; en celular, uno debajo del otro.
- El **viernes** va destacado en amarillo como aviso: es el día con más pedidos y se recomienda solo como opción de emergencia.
- Debajo de los días va el mensaje para los clientes: «Estimado cliente: debido a la temporada alta, le compartimos los días de reparto por zona. Le recomendamos ajustar su reabastecimiento para que calce con el día de la zona más cercana a su local.»
- En la **orden de compra** hay un recordatorio corto («Recuerde: repartimos por zona y día») que se abre con los días, justo cuando el cliente decide.
- Los links de Pichilemu no lo muestran: ahí entrega la vendedora.

**Panel (admin.html) › Portal de clientes › 📅 Días de reparto**
- Una pestaña nueva para editar todo sin tocar código: cada día con su zona, sus comunas o un mensaje, y la casilla **Aviso** para destacarlo (como el viernes). Se pueden agregar o quitar días.
- También se editan el mensaje para los clientes y el recordatorio de la orden de compra, y hay una casilla para **mostrarlo u ocultarlo** en el portal (por ejemplo, en temporada baja).
- Abajo se ve **cómo lo ve el cliente**, y se actualiza mientras escribes.
- **Volver al calendario original** recupera el que viene de fábrica.
- Hasta que guardes por primera vez, el portal muestra el calendario original.

**Worker**
- Entrega el calendario al portal junto con la disponibilidad de productos, limpio: solo texto y con largo máximo, porque lo ven todos.

## Instalación, paso a paso

No hay SQL: el calendario se guarda en la tabla de ajustes que ya existe.

**1. Worker (Cloudflare)**
1. Workers & Pages → `nativo-proxy` → Edit code. Reemplaza todo por `worker.js` y aprieta Deploy.
2. Abre `https://nativo-proxy.mkitzing.workers.dev/salud`: debe decir `v68 · días de reparto en el portal`.

**2. Pantallas (GitHub)**
1. Sube y reemplaza `index.html` y `admin.html`.
2. Sube también `CAMBIOS-v68.md`, `package.json` y la carpeta `pruebas/`.
3. Abre el portal con recarga forzada (Ctrl+Shift+R): arriba deben aparecer los cinco días.

**3. Ajustar el calendario**
1. Panel → Portal de clientes → 📅 Días de reparto.
2. Revisa las zonas y comunas de cada día, cámbialas si hace falta y aprieta **Guardar**.

## Pruebas

- `npm test`: 35 + 37 + 12 pruebas del Worker (las 12 nuevas: calendario guardado, de fábrica, limpieza de textos, oculto y Pichilemu sin calendario).
- `npm run test:pantallas`: 106 pruebas en navegador; las nuevas revisan el calendario en computador y celular, el recordatorio en la orden, el calendario propio, el apagado, Pichilemu y el editor del panel.
