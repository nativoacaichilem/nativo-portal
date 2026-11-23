# v66 · Clientes del portal con sus direcciones de despacho

## Qué cambió

**Portal de pedidos (index.html): dos puertas**
- Al entrar, el cliente elige: **Soy cliente nuevo** o **Ya tengo mis datos ingresados**.
- **Cliente nuevo:** deja una sola vez el RUT de la empresa, la razón social, el nombre del local, el giro, la dirección de facturación y el encargado (nombre, email y teléfono). El RUT se revisa con su dígito verificador antes de guardar.
- **Ya tengo mis datos:** escribe solo el RUT.
- Los dos llegan a su **perfil**: ven su local, su razón social y su RUT, y eligen a qué dirección de despacho va el pedido. Desde ahí pueden **agregar una dirección** (nombre, dirección y comuna) o **quitar** las que ya no usan. Al guardar una dirección nueva, pasan directo al catálogo con ella.
- En el catálogo hay un botón **Cambiar dirección** que vuelve al perfil sin borrar lo que ya eligieron.
- Si un RUT no tiene perfil, el portal lo dice y ofrece entrar como cliente nuevo con el RUT ya escrito. Si un cliente nuevo usa un RUT que ya existe, lo manda a «Ya tengo mis datos».
- Se ve ordenado en celular y en computador: en el celular el encabezado del catálogo deja solo los botones y nada se sale de la pantalla.

**Dónde queda guardado**
- En dos tablas nuevas, **aparte** de los clientes y sucursales del panel: `portal_clientes` (datos de facturación, con el RUT como llave) y `portal_direcciones` (las direcciones que crea cada cliente).
- Quitar una dirección no la borra: queda archivada, y los pedidos que ya salieron siguen mostrando a dónde fueron.

**Cuidado de los datos (se entra solo con el RUT)**
- Al portal le llega lo mínimo para pedir: razón social, local y direcciones. El email y el teléfono del encargado van tapados (por ejemplo «a•••@cafeola.cl» y «•••• 4321»). El giro y la dirección de facturación no salen nunca.
- El pedido toma la empresa, el RUT, la dirección y el contacto completos desde el perfil guardado, en el Worker: lo que escriba el navegador no manda.
- Buscar RUT y crear o quitar direcciones tienen tope por IP, para que probar RUT al azar no sea gratis.
- El RUT de mostrador del panel (11.111.111-1) no sirve para crear un perfil: lo usan muchas personas y cada una vería las direcciones de las demás.

**Panel (admin.html)**
- En «Por facturar», el **primer pedido** de un cliente del portal llega marcado «🆕 Primer pedido» con un bloque verde con sus datos de facturación (razón social, giro, dirección de facturación y encargado) y el botón **Copiar datos**, para pegarlos en el sistema de facturación.
- Los pedidos siguientes del mismo cliente muestran una línea con la razón social y el mismo botón.

## Instalación, paso a paso

**El orden importa:** primero la base, después el Worker y al final las pantallas. Si el portal nuevo se sube antes que el Worker, los clientes no pueden entrar.

**1. Base de datos (Supabase)**
1. Supabase → tu proyecto → SQL Editor → New query.
2. Pega el contenido de `sql/v66-clientes-portal.sql` y aprieta Run.
3. Abajo deben aparecer `portal_clientes` y `portal_direcciones`, con 0 filas.

**2. Worker (Cloudflare)**
1. Workers & Pages → `nativo-proxy` → Edit code. Reemplaza todo por `worker.js` y aprieta Deploy.
2. Abre `https://nativo-proxy.mkitzing.workers.dev/salud`: debe decir `v66` y, en `tablas`, aparecer `portal_clientes` y `portal_direcciones`.

**3. Pantallas (GitHub)**
1. Sube y reemplaza `index.html` y `admin.html`.
2. Sube también `CAMBIOS-v66.md`, `package.json`, `sql/v66-clientes-portal.sql` y la carpeta `pruebas/`.
3. Abre el portal con recarga forzada (Ctrl+Shift+R).

**4. Probar**
1. Entra como **cliente nuevo** con el RUT de Nativo, crea una dirección y haz un pedido de prueba.
2. En el panel, en «Por facturar», ese pedido debe decir «🆕 Primer pedido» con los datos de facturación y el botón Copiar datos.
3. Vuelve al portal, entra por **Ya tengo mis datos** con el mismo RUT: debe aparecer la dirección que creaste.
4. Anula el pedido de prueba desde su tarjeta.

## Pruebas

- `npm test`: 35 pruebas de la v65 y 37 de la v66 (RUT y dígito verificador, perfil nuevo, RUT repetido, datos tapados, direcciones que se crean y se archivan, que otro cliente no pueda quitarlas, pedido con los datos del perfil y primer pedido marcado).
- `npm run test:pantallas`: 68 pruebas en navegador, incluido el recorrido completo del cliente nuevo en un celular, las puertas equivocadas, la tarjeta en computador y los datos de facturación en el panel.

## Si algo falla

- **El portal dice «El portal se está actualizando»:** falta correr el SQL de la v66.
- **Los clientes no pueden entrar con su RUT:** revisa que /salud diga `v66`.
- **Un cliente escribió mal un dato:** por ahora se corrige en Supabase → Table editor → `portal_clientes`.
