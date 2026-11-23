# v67 · Clientes del portal en el panel

## Qué cambió

**Panel (admin.html) › Portal de clientes**
- La página tiene dos pestañas: **🛍️ Qué se puede pedir** (lo de antes) y **👥 Clientes del portal**, con el número de clientes registrados.
- **La lista:** todos los que se registraron como cliente nuevo, el más reciente primero, con su local, razón social, RUT, cuántas direcciones y pedidos tiene, y desde cuándo. Se busca por RUT, razón social o local.
- **El perfil de cada cliente:**
  - **Datos de facturación** (RUT, razón social, local, giro, dirección de facturación y encargado con email y teléfono), todos editables con **Guardar cambios**. El RUT se revisa con su dígito verificador; si se cambia, el cliente entra al portal con el RUT nuevo.
  - **Direcciones de despacho:** corregir, agregar una a nombre del cliente o archivar (es lo mismo que «Quitar» en el portal). Las archivadas quedan aparte, se pueden restaurar y, solo desde ahí, eliminar para siempre.
  - **Sus pedidos:** los últimos, con folio, fecha y estado.
  - **Copiar datos**, igual que en «Por facturar».
  - **Eliminar perfil:** borra los datos de facturación y todas sus direcciones. Pide escribir ELIMINAR para confirmar. Sus pedidos no se tocan.
- Todo cambio vale desde el próximo pedido del cliente: cada pedido guarda copia de los datos con que salió, así que los anteriores quedan como estaban.
- En el celular, el perfil reemplaza a la lista y se vuelve con «‹ Todos los clientes».

No cambian la base ni el Worker: el panel ya podía leer y escribir esas tablas con la clave de admin.

## Instalación

1. En GitHub, sube y reemplaza `admin.html`. Sube también `CAMBIOS-v67.md` y la carpeta `pruebas/`.
2. Abre el panel con recarga forzada (Ctrl+Shift+R) → Portal de clientes → 👥 Clientes del portal.

## Pruebas

- `npm test`: 72 pruebas del Worker (sin cambios).
- `npm run test:pantallas`: 87 pruebas en navegador; 20 nuevas para esta pestaña (lista, búsqueda, editar con RUT malo y bueno, direcciones, archivar, restaurar, eliminar, borrar perfil con y sin confirmar, y el celular).
