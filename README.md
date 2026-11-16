# Plataforma Nativo Açaí

| Archivo | Quién lo usa | Para qué |
| --- | --- | --- |
| index.html | Clientes | Portal de pedidos. Con `?pichilemu=<código>`, el link de una vendedora de Pichilemu |
| admin.html | Oficina | Pedidos, rutas, clientes, producción y qué se puede pedir en el portal (Portal) |
| bodega.html | Oficina | Stock, movimientos, conteos y configuración (incluido el portal de clientes) |
| compras.html, maquinas.html, kpi.html, planner.html | Oficina | Compras, máquinas, indicadores, planificador |
| bodeguero.html | Encargado de bodega | Rutas y stock desde el celular |
| produccion.html | Sala de producción | Lotes y materia prima |
| worker.js | Cloudflare | La única puerta a Supabase: permisos de cada clave y stock del portal |
| sql/ | Supabase | Cambios a la base, en orden de versión |
| pruebas/ | — | `npm test` (Worker) y `npm run test:pantallas` (navegador, requiere Playwright) |

Los cambios de cada versión están en `CAMBIOS-vNN.md`.
