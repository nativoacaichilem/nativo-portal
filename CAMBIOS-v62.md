# v62 · Pedidos por pestañas (Etapa 3)

Solo cambia `admin.html`. No hay SQL ni cambios en el Worker.

## Qué cambió

- **Pestañas por estado** en la lista de pedidos: Por facturar · Por despachar · En ruta · Entregados, cada una con su contador. Reemplazan los 8 contadores de arriba y el desplegable de 13 opciones.
  - Cada pedido vive en una sola pestaña, calculada con los estados que ya existen (`tabDe()`).
  - Lo que no se cobra (muestras, mermas, tareas, producción) se salta «Por facturar».
  - «Entregado · sin facturar» va arriba de Por facturar, en rojo, y la pestaña avisa cuántos hay.
- **Grupos dentro de cada pestaña**:
  - Por facturar: ya entregados, con día asignado (el más cercano primero) y sin día.
  - Por despachar: por día y camión, con el estado de la ruta y el chofer, más «Retiros en oficina» aparte.
  - En ruta: por camión.
  - Entregados: el período elegido, lo más reciente primero.
- **Entregados** abre en los últimos 30 días, con «Este mes», «Ver todos» y rango de fechas. La franja de la semana se esconde ahí.
- **Dos descargas** de lo que se está viendo:
  - Resumen por pedido: suma tipo, canal, bodega de salida, quién entregó, total y si se descargó bodega.
  - Detalle por producto: usa lo que realmente salió de bodega; si el pedido no se descargó, usa el detalle escrito.
- **Buscador** que busca en todas las pestañas y avisa «También en: …».
- **Chips de tipo** (Ventas, Web, Producción, Muestras, Tareas, Mermas) y **filtros plegados** (zona, despacho o retiro, prioritarios, sin descargar bodega).
- **Fila compacta**: cliente primero, folio chico, día y zona, tipo, estado, factura y hasta dos marcas. Toda la fila abre el pedido.
- **Detalle al costado** en pantallas de 1100 px o más: la ventana de edición se abre a la derecha y la lista sigue a la vista. En pantallas chicas sigue igual que antes.
- Color de «Entregado · sin facturar» pasa a rojo (escala de estados aprobada).

## Lo que se mantuvo igual

- La ventana de edición, la barra de cambios masivos, la franja «La semana» con su panel del día, la nota interna en la fila y el botón «📦 Descargar bodega».
- El panel del día y el prompt de ruta siguen mirando todos los pedidos del día, no solo la pestaña activa (`filtradosTodos()`).

## Detalle técnico

- La carga de movimientos de bodega ahora pide también `bodega_id, producto_id, cantidad, medida` (columnas que `admin.html` ya escribe) y los guarda en `bodMovsPorPedido`.
- Funciones nuevas: `tabDe`, `filtradosTodos`, `irTabPed`, `gruposPed`, `filaPed`, `exportDetalle`, `marcarAbierto`.
- Los atajos viejos (`verSinFacturar`, `verRetirosPendientes`, `verCortesias`, `verSinDescargo`) siguen existiendo y llevan a la pestaña que corresponde.
