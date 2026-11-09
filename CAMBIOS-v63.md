# v63 · Barra lateral común (Etapa 4)

Cambian seis archivos de oficina: `admin.html`, `bodega.html`, `compras.html`,
`maquinas.html`, `kpi.html` y `planner.html`. No hay SQL ni cambios en el Worker.
Los portales de terreno (`bodeguero.html`, `produccion.html`) y el de clientes
(`index.html`) no se tocan.

## Qué cambió

- **Una barra lateral igual en las seis pantallas**, en pantallas de 1100 px o más. Agrupa todo en cinco grupos:
  - Operación: Pedidos, Rutas, Producción.
  - Inventario: Stock, Movimientos, Aprobaciones, Conteos, Cuadratura de ventas, Compras.
  - Clientes y equipos: Clientes, Máquinas.
  - Análisis: Indicadores, Planner.
  - Configuración: Zonas y comunas, Bodegas y productos, Diagnóstico.
- Cada ítem apunta a `archivo.html#sección`. Los archivos no se juntaron.
- Dentro de la misma pantalla, la barra cambia de sección sin recargar.
- La barra marca dónde estás, también cuando cambias de sección desde otro botón.
- En pantalla ancha se esconde la barra de módulos de arriba. En admin y bodega se esconde también la fila de secciones, porque todas están en la barra lateral. Compras, Máquinas e Indicadores conservan sus pestañas internas.
- «Salir» pasa al pie de la barra lateral. La cabecera de arriba se esconde si queda vacía.
- En admin, «Agregar» pasa a ser el botón «➕ Nuevo pedido» en la lista de pedidos.
- Admin guarda la sección en la dirección (`admin.html#rutas`), igual que ya hacía bodega: recargar deja donde estabas.

## Lo que no cambió

- En el celular todo sigue igual: barra de módulos arriba y fila de secciones.
- Ninguna sección se movió de archivo. Configuración queda agrupada en la barra, aunque sus partes siguen en admin y bodega.

## Detalle técnico

- Bloque idéntico en los seis archivos, marcado como `BARRA LATERAL COMÚN (v63)`: estilos, `<aside id="lat-comun">` y un script que la arma desde una lista.
- Cada archivo con secciones expone `window.irSeccionLateral(sección)` y llama a `marcarLateral(sección)` al cambiar de sección (`goTab` en admin, `irA` en bodega).
