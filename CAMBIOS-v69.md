# v69 · Clave de 4 números para los clientes del portal

## Qué cambió

**Portal de pedidos (index.html)**
- **Cliente nuevo:** al final del formulario crea una **clave de 4 números** y la repite. El campo solo acepta números.
- **Ya tengo mis datos:** se entra con el **RUT y la clave**. Si la clave no es correcta, el portal lo dice, limpia el campo y sugiere pedírsela a Nativo.
- **¿Olvidaste tu clave?:** explica que se pide a Nativo, que la puede decir o cambiar.
- **Clientes registrados antes de la clave:** la primera vez que entran con su RUT, el portal les pide crearla (dos veces, para no equivocarse) y entran.
- La clave acompaña cada dirección que se crea o se quita y cada pedido. Vive solo en la memoria de la pestaña: no queda guardada en el navegador.
- Si la oficina cambia la clave mientras el cliente está adentro, al siguiente cambio el portal le pide volver a entrar.

**Panel (admin.html) › Portal de clientes › 👥 Clientes del portal**
- En el perfil de cada cliente se **ve su clave**, con el botón **Cambiar clave** (o **Asignar clave** si todavía no tiene).
- En la lista se marca **sin clave** a quien todavía no la tiene.
- La clave la cambia solo la oficina: el cliente que la olvida, la pide.

**Worker**
- Pide la clave para entrar, para crear o quitar direcciones y para pedir a nombre de una empresa. Un pedido con la clave equivocada no entra.
- La clave nunca viaja de vuelta al portal.
- **No hay bloqueo por intentos fallidos**, como decidiste. Se mantiene el tope de consultas por conexión que ya existía: no bloquea al cliente, solo frena a quien prueba claves a toda velocidad.
- Si un portal viejo quedó en caché y busca solo con el RUT, recibe el aviso «recarga la página».

## Instalación, paso a paso

**El orden importa:** SQL, después Worker y enseguida las pantallas. Con el Worker nuevo, el portal viejo pide recargar la página.

**1. Base de datos (Supabase)**
1. SQL Editor → New query → pega `sql/v69-clave-clientes.sql` → Run.
2. Abajo aparece cuántos clientes tienen clave y cuántos no (los ya registrados quedan sin clave).

**2. Worker (Cloudflare)**
1. Workers & Pages → `nativo-proxy` → Edit code → reemplaza todo por `worker.js` → Deploy.
2. `https://nativo-proxy.mkitzing.workers.dev/salud` debe decir `v69 · clave de 4 números para los clientes del portal`.

**3. Pantallas (GitHub)** — enseguida del Worker
1. Sube y reemplaza `index.html` y `admin.html`.
2. Sube también `CAMBIOS-v69.md`, `sql/v69-clave-clientes.sql` y la carpeta `pruebas/`.
3. Abre el portal con recarga forzada (Ctrl+Shift+R).

**4. Probar**
1. Entra con el RUT del cliente de prueba: como no tiene clave, el portal te pide crearla.
2. En el panel, en su perfil, debe aparecer esa clave. Cámbiala con **Cambiar clave** y vuelve a entrar al portal con la nueva.

## Pruebas

- `npm test`: 35 + 54 + 12 pruebas del Worker. Las nuevas revisan la clave al registrarse, entrar, crear y quitar direcciones y pedir; que nunca vuelva al portal; que no haya bloqueo tras muchos intentos; y la clave de los clientes antiguos, que se crea una sola vez.
- `npm run test:pantallas`: 119 pruebas en navegador, entre ellas la clave equivocada, «¿Olvidaste tu clave?», crear la clave de un cliente antiguo, claves que no coinciden y cambiar la clave desde el panel.
