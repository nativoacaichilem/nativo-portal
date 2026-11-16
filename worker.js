// ══════════════════════════════════════════════════════════════
//  nativo-proxy — puerta entre el navegador y Supabase
//
//  Variables en Cloudflare → Settings → Variables:
//    SUPABASE_URL   https://qhslmbmnbrpaxdkrclxn.supabase.co   (opcional)
//    SUPABASE_KEY   la llave de Supabase                        SECRETO
//    ADMIN_TOKEN    la clave del panel, larga                   SECRETO
//    BODEGA_TOKEN   la clave del portal de bodega, distinta     SECRETO
//    PRODUCCION_TOKEN  la clave de la sala de producción        SECRETO
//                   Permisos acotados: ver `puedeBodega` y `puedeProduccion`.
//                   Sin una de ellas, ese portal no funciona y el resto sigue
//                   igual.
//    LIMITADOR      binding de Rate Limiting                    (opcional)
//
//  Diagnóstico: abre  /salud  en el navegador. Dice qué variables están
//  configuradas, sin revelar ninguna.
//
//  SI AGREGAS UN CAMPO AL FORMULARIO DEL PORTAL, agrégalo también a
//  CAMPOS_PUBLICOS. Si no, ese campo se descarta en silencio.
//
//  SI EL PORTAL SE MUEVE A OTRO DOMINIO, agrégalo a ORIGENES. Desde un
//  dominio que no esté en la lista, los pedidos se rechazan.
//
//  SI AGREGAS UNA PANTALLA NUEVA con tablas propias, agrégalas a TABLAS.
//  Sin eso el Worker responde 403 y la pantalla no pasa del login.
// ══════════════════════════════════════════════════════════════

const TABLAS = new Set([
  'pedidos', 'clientes', 'sucursales',
  // Zonas de reparto. Antes eran cuatro <option> escritos a mano en seis
  // selectores del HTML más un mapa comuna→zona en JavaScript: crear una zona
  // era editar el archivo y desplegarlo. Ahora son datos.
  'zonas', 'zona_comunas',
  'planner_perfiles', 'planner_tareas', 'planner_config',
  // ── bodegas ──
  'bod_bodegas', 'bod_productos', 'bod_motivos', 'bod_minimos', 'bod_movimientos',
  // vistas de solo lectura: saldos, cruce de ventas contra facturas y el
  // hueco a vigilar (pedidos despachados que no descontaron stock)
  'bod_saldos', 'bod_ventas', 'bod_ventas_por_factura', 'bod_pedidos_sin_descargo',
  'bod_cortesias',      // lo que se entregó sin cobrar, valorizado al costo
  'bod_config',         // ajustes del módulo (la fecha de corte del historial)
  // ── compras ──
  // La pizarra de solicitudes y el directorio de proveedores. `com_pizarra`
  // es una vista de solo lectura que junta la solicitud con el saldo del
  // producto y su proveedor preferido, para que la pantalla no tenga que
  // pedir tres cosas y cruzarlas a mano.
  'com_proveedores', 'com_producto_proveedor', 'com_solicitudes', 'com_pizarra',
  // ── propuestas del bodeguero ──
  // Lo que se anota en la bodega y espera aprobación. `bod_propuestas_abiertas`
  // es la vista con lo pendiente y el efecto que tendría en el saldo.
  'bod_propuestas', 'bod_propuestas_abiertas',
  // Las rutas de despacho: qué camión, qué día y qué chofer.
  'bod_rutas',
  // La nota de cada día: a qué ciudad se despacha.
  'agenda_dias',
  // Las líneas de un pedido: venta y muestra en la misma entrega.
  'pedido_lineas',
  // Las vendedoras de Pichilemu y su comisión.
  'vendedoras',
  // La sala de producción: lo que fabrica y hay que ir a buscar.
  'prod_lotes',
  // Las máquinas: modelos, unidades, colocaciones y precios ofrecidos.
  'maq_modelos', 'maq_unidades', 'maq_colocaciones', 'maq_precios'
]);

const ORIGENES = [
  'https://nativoacaichilem.github.io'
];

// Lo único que el portal público puede escribir
const CAMPOS_PUBLICOS = {
  emp:      300,
  rut:      50,
  dir:      500,
  email:    200,
  contacto: 200,
  telefono: 60,
  detalle:  8000,
  fecha:    40,
  folio:    40,     // lo genera el portal; la base tiene índice único sobre él
  entrega:  20,     // 'despacho' o 'retiro'; se normaliza más abajo
  mensaje:  500,    // lo escribe el cliente. NO es `comentario`, que es interno
  // v65 · el código del link de una vendedora de Pichilemu. NO es una columna:
  // el Worker lo cambia por `canal` y `vendedora` antes de guardar, buscando
  // el código en la lista que mantiene la oficina. Así un cliente no puede
  // escribir el nombre de una vendedora a mano y asignarle una venta.
  pichilemu: 60
};

// Los dos únicos modos de entrega. Cualquier otro valor se trata como despacho.
const ENTREGAS = new Set(['despacho', 'retiro']);

// Campos secundarios: si vienen con un tipo raro se descartan en vez de
// rechazar el pedido. En `emp` o `detalle` un tipo inesperado significa que la
// petición está mal armada y conviene rechazarla; en estos, no vale perder una
// venta por un dato accesorio.
const CAMPOS_OPCIONALES = new Set(['folio', 'entrega', 'mensaje', 'pichilemu']);

// Lo que el portal público NO decide, pase lo que pase.
//
// `tipo` está acá y no en CAMPOS_PUBLICOS a propósito: un cliente no puede
// declarar su propio pedido como "entrega sin venta". Eso lo decide el panel.
const CAMPOS_FORZADOS = {
  tipo:           'venta',
  razon:          '',
  estado:         'pendiente',
  zona:           '',
  factura_num:    '',
  factura_nombre: '',
  comentario:     '',
  // `null` y no '': desde que es una columna de fecha, la base rechaza el
  // texto vacío. Con '' TODOS los pedidos del portal habrían fallado al
  // correr la migración.
  fecha_entrega:  null,
  hora_entrega:   '',
  recibe:         ''
};

const MAX_BODY = 100 * 1024;   // 100 KB
const METODOS  = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

// Estados que por norma NO pueden llevar cuerpo. PostgREST devuelve 204 al
// editar y al borrar; construir una Response con cuerpo aquí lanza excepción.
const SIN_CUERPO = new Set([101, 204, 205, 304]);

// Freno de respaldo, por si no está configurado el binding LIMITADOR.
// Vive en la memoria del isolate: Cloudflare los crea y descarta, así que no
// es un muro, es un tope contra el envío repetido y el script tonto. El freno
// de verdad es LIMITADOR. Generoso a propósito: un cliente real jamás manda
// doce pedidos en un minuto, pero rechazar uno legítimo cuesta una venta.
const TOPE_POR_MINUTO = 12;
const VISTOS = new Map();   // ip -> número[] con marcas de tiempo

// El mismo freno para la consulta de disponibilidad del portal, con su propia
// cuenta y un tope más alto: compartir la cuenta con los pedidos haría que
// abrir el catálogo varias veces le quitara a alguien la posibilidad de comprar.
const TOPE_STOCK_POR_MINUTO = 60;
const VISTOS_STOCK = new Map();

function frenoEn(mapa, tope, ip) {
  const ahora = Date.now();
  const marcas = (mapa.get(ip) || []).filter(t => ahora - t < 60_000);
  marcas.push(ahora);
  mapa.set(ip, marcas);
  if (mapa.size > 5000) {             // no dejar que la memoria crezca sola
    for (const [k, v] of mapa) {
      if (!v.length || ahora - v[v.length - 1] > 60_000) mapa.delete(k);
      if (mapa.size <= 2500) break;
    }
  }
  return marcas.length <= tope;
}
const frenoLocal = ip => frenoEn(VISTOS, TOPE_POR_MINUTO, ip);

// ── helpers ───────────────────────────────────────────────────
const origenConocido = origin => !!origin && ORIGENES.includes(origin);

function cors(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origenConocido(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) }
  });
}

// Comparación en tiempo constante: no revela el token carácter por carácter
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function esAdmin(req, env) {
  const enviado = req.headers.get('X-Admin-Token');
  return !!env.ADMIN_TOKEN && !!enviado && igualSeguro(enviado, env.ADMIN_TOKEN);
}

// ── la clave de bodega ────────────────────────────────────────
//
// Variable BODEGA_TOKEN en Cloudflare. Si no está configurada, el portal del
// bodeguero simplemente no funciona y nada más cambia.
//
// POR QUÉ EXISTE. La clave de admin abre todo: pedidos, clientes, planner, y
// borrar productos o revertir movimientos. Darle esa clave a quien trabaja en
// la bodega es darle la llave maestra, y no hay forma de quitársela a él sin
// cambiársela a todos.
//
// Los permisos se verifican ACÁ y no en la pantalla. Una pantalla se saltea
// con la consola del navegador en diez segundos; el Worker no.
function esBodega(req, env) {
  const enviado = req.headers.get('X-Admin-Token');
  return !!env.BODEGA_TOKEN && !!enviado && igualSeguro(enviado, env.BODEGA_TOKEN);
}

// ── la clave de la sala de producción ──
//
// Variable PRODUCCION_TOKEN en Cloudflare. Sin ella ese portal no funciona y
// nada más cambia.
//
// Una clave aparte y no la de bodega: hacen trabajos distintos y ven cosas
// distintas. Producción no tiene nada que ver con las rutas ni con los
// pedidos de clientes, y el bodeguero no fabrica.
function esProduccion(req, env) {
  const enviado = req.headers.get('X-Admin-Token');
  return !!env.PRODUCCION_TOKEN && !!enviado && igualSeguro(enviado, env.PRODUCCION_TOKEN);
}

// Lo que producción puede leer: el catálogo, sus lotes y sus pedidos de
// materia prima. No ve pedidos de clientes, ni rutas, ni el directorio.
const PRO_LEE = new Set([
  'bod_productos', 'bod_bodegas', 'bod_saldos', 'prod_lotes', 'pedidos'
]);

// Lo que puede crear: lotes y pedidos de materia prima.
const PRO_CREA = new Set(['prod_lotes', 'pedidos', 'bod_productos']);

// Lo único que puede traer un pedido suyo. Sin esta lista podría crear un
// pedido a un cliente con número de factura.
const PRO_CAMPOS_PEDIDO = new Set([
  'emp', 'dir', 'detalle', 'tipo', 'turno', 'fecha', 'fecha_entrega', 'hora_entrega',
  'entrega', 'estado', 'comentario', 'prioritario', 'encargado', 'zona'
]);

function puedeProduccion(metodo, tabla, cuerpo, search) {
  if (metodo === 'GET') {
    if (!PRO_LEE.has(tabla))
      return 'Desde el portal de producción no se puede leer esa información.';
    // Los pedidos solo los suyos: sin el filtro, la clave serviría para
    // bajarse los cuatrocientos con sus facturas y direcciones.
    if (tabla === 'pedidos' && !/[?&]tipo=eq\.produccion/.test(search))
      return 'Desde el portal de producción solo se ven los pedidos de materia prima.';
    return null;
  }
  if (metodo === 'DELETE')
    return 'Desde el portal de producción no se puede borrar nada.';

  if (metodo === 'POST') {
    if (!PRO_CREA.has(tabla))
      return 'Desde el portal de producción no se puede crear eso.';
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    if (tabla === 'pedidos') {
      for (const f of filas) {
        if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
        for (const k of Object.keys(f))
          if (!PRO_CAMPOS_PEDIDO.has(k))
            return `Un pedido de materia prima no puede traer "${k}".`;
        if (f.tipo !== 'produccion')
          return 'Desde el portal de producción solo se piden materias primas.';
      }
    }
    if (tabla === 'bod_productos') {
      // Un producto nuevo nace marcado para revisión: el nombre es la llave
      // que une producción, bodega y pedidos, y si se escribe mal se rompe
      // en silencio. La oficina lo revisa antes de publicarlo.
      for (const f of filas) {
        if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
        if (f.revisar !== true)
          return 'Un producto creado desde producción queda pendiente de revisión.';
      }
    }
    return null;
  }

  if (metodo === 'PATCH') {
    // Solo sus lotes, y solo mientras nadie los haya retirado. Después del
    // retiro el número ya no es suyo: lo confirmó quien lo recibió.
    if (tabla !== 'prod_lotes')
      return 'Desde el portal de producción solo se pueden corregir los lotes propios.';
    if (!/[?&]id=eq\.\d+/.test(search))
      return 'Hay que indicar cuál lote, de a uno.';
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    // Fecha y turno NO están: el lote tiene un pedido de retiro enlazado y
    // producción no puede tocar pedidos. Si pudiera cambiar la fecha del
    // lote, los dos quedarían diciendo días distintos y el camión pasaría
    // cuando no corresponde.
    //
    // Mover el viaje es decisión de la oficina, que es quien sabe si el
    // camión está libre. Producción corrige la cantidad y la nota; para
    // cambiar el día, avisa.
    const permitidos = new Set(['declarada','medida','nota','producto_id','pedido_id']);
    for (const f of filas) {
      if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
      for (const k of Object.keys(f))
        if (!permitidos.has(k))
          return `Desde el portal de producción no se puede cambiar "${k}".`;
    }
    return null;
  }
  return 'Método no permitido desde el portal de producción.';
}

// ── lo que puede el encargado de bodega ──
//
// El rol cambió: antes solo confirmaba lo que la oficina ya había decidido,
// ahora se hace cargo de la bodega. Lleva el stock, arma las rutas y despacha.
//
// LA REGLA, que no es "facturado = administrable":
//
//   pedido de cliente FACTURADO    lo administra
//   pedido de cliente SIN facturar solo lo ve
//   pedido de PRODUCCIÓN           lo administra, y va primero
//
// Los de producción nunca se facturan —son internos— y son los que más
// urgen. Atarlos a la factura los dejaría fuera justo a ellos.

// Lo que el bodeguero puede LEER.
//
// OJO: hoy incluye `clientes`, `sucursales` y el libro `bod_movimientos`. Una
// versión anterior los había sacado (cada pedido ya trae empresa, dirección y
// contacto copiados) y después volvieron. Cada tabla de esta lista es
// información que se lleva quien tenga la clave: si el portal del bodeguero
// deja de necesitar alguna, conviene sacarla.
const BOD_LEE = new Set([
  'bod_bodegas', 'bod_productos', 'bod_motivos', 'bod_saldos', 'bod_movimientos',
  'bod_propuestas', 'bod_rutas', 'bod_config',
  'prod_lotes',    // lo que hay que ir a buscar a la sala
  'pedidos', 'clientes', 'sucursales'
]);

// Ahora escribe en el libro. Un encargado de bodega cuya cuenta de stock
// espera aprobación no está llevando la cuenta: está pidiendo permiso para
// llevarla, y el stock queda siempre atrasado respecto de la realidad.
const BOD_CREA = new Set(['bod_movimientos', 'bod_propuestas', 'bod_rutas']);

// Qué movimientos puede anotar directo y cuáles quedan avisados.
//
// Se aplican solos los que tienen algo que los respalde: una salida contra un
// pedido, una entrada con documento, un traslado entre bodegas.
//
// Un AJUSTE es un conteo y una MERMA es una pérdida: son los únicos sin nada
// que los contraste, y donde un error se vuelve invisible. Se aplican igual
// —no le frenan el trabajo— pero quedan marcados para que la oficina los
// revise. La marca la pone el portal en la nota; acá lo que se exige es que
// una merma venga explicada.
function movimientoBodegaOk(f) {
  if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
  if (!['entrada','salida','traslado','ajuste'].includes(f.tipo))
    return 'Tipo de movimiento desconocido.';
  // Una merma sin explicación es un número que en un mes no le dice nada a
  // nadie, y es justo el dato que permite saber dónde se pierde producto.
  if (f.tipo === 'ajuste' && !String(f.nota || '').trim())
    return 'Un ajuste de conteo necesita una explicación.';
  return null;
}

// Lo que puede traer una propuesta suya. `estado`, `resuelta` y
// `movimiento_id` NO están: eso lo decide quien aprueba, no quien propone.
const BOD_CAMPOS_PROPUESTA = new Set([
  'tipo', 'producto_id', 'bodega_id', 'bodega_destino_id', 'cantidad', 'medida',
  'motivo_id', 'doc', 'nota', 'quien', 'camion'
]);

// Lo que puede cambiar de un pedido.
//
// v64 · salida y vuelta de las rutas:
//   carga, cargado_en    lo que subió al camión. Se guarda al cargar y el
//                        stock se descuenta recién cuando bodega marca
//                        «Salió», para que un camión que no sale no deje el
//                        inventario corto.
//   devuelto_*           el pedido volvió (no salió el camión, no subió o no
//                        se entregó). Queda esperando que la oficina decida:
//                        bodega lo marca, pero no lo puede desmarcar.
const BOD_EDITA_PEDIDO = new Set(['estado', 'recibe', 'fecha_entrega', 'hora_entrega', 'ruta_id',
  'carga', 'cargado_en', 'devuelto_tipo', 'devuelto_motivo', 'devuelto_en']);
const BOD_ESTADOS = new Set(['en-ruta', 'entregado', 'entregado-sin-facturar']);
const BOD_DEVUELTOS = new Set(['no-salio', 'no-subio', 'no-entregado']);

// Y de una ruta: el chofer y el estado. La fecha y el camión no, porque eso
// ya es otra ruta. Desde la v64 también cuándo salió, cuándo volvió y, si no
// salió, por qué.
const BOD_EDITA_RUTA = new Set(['chofer', 'estado', 'notas', 'cerrada', 'bodega_id',
  'resultado', 'motivo', 'salio_en', 'volvio_en']);
const BOD_RESULTADOS = new Set(['salio', 'no-salio']);

// Devuelve null si puede, o el motivo del rechazo.
function puedeBodega(metodo, tabla, cuerpo, search) {
  if (metodo === 'GET')
    return BOD_LEE.has(tabla) ? null
      : 'Desde el portal de bodega no se puede leer esa información.';

  if (metodo === 'DELETE')
    return 'Desde el portal de bodega no se puede borrar nada. Si algo quedó ' +
      'mal anotado, avisa para que se corrija desde el panel.';

  if (metodo === 'POST') {
    if (!BOD_CREA.has(tabla))
      return 'Desde el portal de bodega no se puede crear eso.';
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    if (!filas.length) return 'Cuerpo vacío.';

    if (tabla === 'bod_movimientos') {
      for (const f of filas) {
        const no = movimientoBodegaOk(f);
        if (no) return no;
      }
      return null;
    }
    if (tabla === 'bod_rutas') return null;

    // Propuestas: no puede traer nada que decida quien aprueba.
    for (const f of filas) {
      if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
      for (const k of Object.keys(f))
        if (!BOD_CAMPOS_PROPUESTA.has(k))
          return `Una propuesta no puede traer "${k}".`;
    }
    return null;
  }

  if (metodo === 'PATCH') {
    // De a uno. Una tanda entera cambiada desde la bodega es un error que
    // nadie quiso cometer.
    if (!/[?&]id=eq\.\d+/.test(search))
      return 'Hay que indicar cuál, de a uno.';
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];

    if (tabla === 'pedidos') {
      for (const f of filas) {
        if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
        for (const k of Object.keys(f))
          if (!BOD_EDITA_PEDIDO.has(k))
            return `Desde el portal de bodega no se puede cambiar "${k}".`;
        if (f.estado !== undefined && !BOD_ESTADOS.has(f.estado))
          return `Desde el portal de bodega no se puede dejar un pedido en "${f.estado}".`;
        // Marcar devuelto, sí; desmarcarlo, no. Volver a meter un pedido al
        // flujo es lo que decide la oficina después de verlo.
        if (f.devuelto_tipo !== undefined && !BOD_DEVUELTOS.has(f.devuelto_tipo))
          return 'Desde el portal de bodega un pedido solo se marca como devuelto; ' +
            'la oficina decide qué hacer con él.';
        // La carga es la lista de lo que subió: o una lista, o nada.
        if (f.carga !== undefined && f.carga !== null && !Array.isArray(f.carga))
          return 'La carga de un pedido tiene un formato inesperado.';
      }
      return null;
    }

    if (tabla === 'bod_rutas') {
      for (const f of filas) {
        if (!f || typeof f !== 'object') return 'Cuerpo inválido.';
        for (const k of Object.keys(f))
          if (!BOD_EDITA_RUTA.has(k))
            // La fecha y el camión no se cambian: eso ya es otra ruta, y
            // mover una con pedidos adentro deja al camión yendo otro día.
            return `Desde el portal de bodega no se puede cambiar "${k}" de una ruta.`;
        if (f.resultado !== undefined && f.resultado !== null && !BOD_RESULTADOS.has(f.resultado))
          return `El resultado de una ruta no puede ser "${f.resultado}".`;
      }
      return null;
    }

    return 'Desde el portal de bodega solo se actualizan pedidos y rutas.';
  }
  return 'Método no permitido desde el portal de bodega.';
}

// ── freno contra la prueba de claves ──────────────────────────
//
// El límite de velocidad de más abajo solo cubre el portal público. Las
// peticiones con X-Admin-Token pasaban sin ningún tope, así que la clave se
// podía probar a toda velocidad contra el mismo GET que usa el login del
// panel. La comparación en tiempo constante impide adivinarla carácter por
// carácter, pero no impide probarla un millón de veces.
//
// Solo cuenta los intentos que TRAEN un token equivocado. Una petición sin
// token no es alguien probando la clave: es el portal, o un rastreador, y
// bloquear por eso dejaría al panel afuera sin razón.
//
// Igual que frenoLocal, esto vive en la memoria del isolate y Cloudflare los
// crea y descarta, así que no es un muro. Sube el costo lo suficiente como
// para que probar claves deje de ser gratis, que es lo que se busca.
const TOPE_CLAVES_MALAS = 10;
const VENTANA_CLAVES    = 15 * 60_000;   // 15 minutos
const FALLIDOS = new Map();              // ip -> número[] con marcas de tiempo

function clavesMalas(ip) {
  const ahora = Date.now();
  return (FALLIDOS.get(ip) || []).filter(t => ahora - t < VENTANA_CLAVES).length;
}

function anotarClaveMala(ip) {
  const ahora = Date.now();
  const marcas = (FALLIDOS.get(ip) || []).filter(t => ahora - t < VENTANA_CLAVES);
  marcas.push(ahora);
  FALLIDOS.set(ip, marcas);
  if (FALLIDOS.size > 5000) {            // no dejar que la memoria crezca sola
    for (const [k, v] of FALLIDOS) {
      if (!v.length || ahora - v[v.length - 1] > VENTANA_CLAVES) FALLIDOS.delete(k);
      if (FALLIDOS.size <= 2500) break;
    }
  }
}

// La URL del proyecto no es secreta, así que va por defecto: una variable
// menos que configurar. Igual se puede sobreescribir con SUPABASE_URL.
const URL_POR_DEFECTO = 'https://qhslmbmnbrpaxdkrclxn.supabase.co';

function llaves(env) {
  const url = env.SUPABASE_URL || env.SB_URL || env.SUPABASE_PROJECT_URL || URL_POR_DEFECTO;
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE ||
              env.SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.ANON_KEY || env.SB_KEY;
  return { url, key };
}

// Lectura directa a Supabase desde el propio Worker, con su llave. La usan el
// stock del portal y la búsqueda de vendedoras: lo que el portal necesita sin
// que el navegador lea esas tablas.
async function leerSB(SB_URL, SB_KEY, ruta) {
  const r = await fetch(`${SB_URL.replace(/\/$/, '')}/rest/v1/${ruta}`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Accept': 'application/json' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta.split('?')[0]}`);
  return r.json();
}

// ══════════════════════════════════════════════════════════════
//  DISPONIBILIDAD EN EL PORTAL DE CLIENTES (v65)
//
//  Qué se puede pedir lo decide la oficina, no un cálculo. Cada producto, en
//  cada portal (el general y los links de Pichilemu), está:
//
//    disponible  se pide normal (lo que no está anotado)
//    agotado     se ve, apagado, con «No disponible por ahora»
//    oculto      no aparece en ese portal
//
//  Se guarda en bod_config, clave `portal_disponibilidad`, como texto JSON:
//    {"general":{"granola zero":"agotado"},"pichilemu":{"miel":"oculto"}}
//  La llave de cada producto es su nombre en el catálogo, en minúsculas.
//
//  Así el cliente nunca choca con un tope a mitad del pedido: lo que ve al
//  entrar es lo que puede pedir.
//
//  El STOCK queda como referencia para la oficina (ruta /disponible, solo con
//  la clave de admin): el saldo de la bodega de cada portal menos lo que ya
//  está pedido y todavía no sale. Almafrigo y Golden Frost no cuentan.
// ══════════════════════════════════════════════════════════════

const normTxt = t => String(t == null ? '' : t).toLowerCase().trim().replace(/\s+/g, ' ');

// Los mismos nombres antiguos que conoce admin.html: los pedidos viejos los
// usan y también reservan stock.
const NOMBRES_ANTIGUOS = {
  'scoopable acai (caja)': 'Scoopable Acai',
  'acai fused (caja)':     'Acai Fused',
  'acai puro (caja)':      'Acai Puro'
};

// Igual que splitDet de admin.html: las líneas van separadas por coma seguida
// de mayúscula, porque los formatos llevan coma decimal ("3,6 L").
function separarDetalle(s) {
  if (!s || !String(s).trim()) return [];
  return String(s).split(/,\s*(?=[A-ZÁÉÍÓÚÑ])/).map(d => d.trim()).filter(Boolean);
}

// Igual que leerLinea de admin.html: "Nombre (formato) x3" son 3 cajas,
// "x3 cajas" también, "x5 un" son 5 unidades sueltas.
const RE_LINEA = /^(.*?)\s*\(([^)]*)\)\s*[x×]\s*([\d.,]+)\s*(cajas?|un|unidades?)?\s*$/i;
function leerLinea(texto) {
  const m = String(texto || '').match(RE_LINEA);
  if (!m) return null;
  const suf = (m[4] || '').toLowerCase();
  return {
    nombre:   m[1].trim(),
    formato:  m[2].trim(),
    cantidad: Number(String(m[3]).replace(',', '.')) || 0,
    medida:   suf.startsWith('un') ? 'unidad' : 'caja'
  };
}

// Igual que el descargo de admin.html: por nombre y formato; si el formato no
// calza, basta el nombre; y si tampoco, el nombre antiguo.
function buscarProducto(vivos, nombre, formato) {
  const n = normTxt(nombre);
  const calza = x => normTxt(x.nombre) === n;
  let p = vivos.find(x => calza(x) && normTxt(x.formato || '') === normTxt(formato || ''));
  if (!p) p = vivos.find(calza);
  if (!p) {
    const alias = NOMBRES_ANTIGUOS[n];
    if (alias) p = vivos.find(x => normTxt(x.nombre) === normTxt(alias));
  }
  return p || null;
}

function factorCaja(prod, saldo) {
  const f = Number(prod && prod.unidades_caja) || Number(saldo && saldo.unidades_caja) || 1;
  return f >= 1 ? Math.floor(f) : 1;
}

// La lista de vendedoras vive en bod_config como texto JSON:
//   [{"slug":"camila-x8k2","nombre":"Camila","activa":true}, ...]
// El slug es lo que va en el link. Lleva una parte al azar para que no se
// pueda adivinar el link de otra vendedora cambiando el nombre.
function vendedoraPorSlug(valor, slug) {
  if (!slug) return null;
  let lista = [];
  try { lista = JSON.parse(valor || '[]'); } catch (_) { return null; }
  if (!Array.isArray(lista)) return null;
  return lista.find(v => v && v.activa !== false && String(v.slug || '') === String(slug)) || null;
}

async function leerConfigPortal(leer) {
  const filas = await leer('bod_config?select=clave,valor&clave=in.(bodega_clientes,bodega_pichilemu,vendedoras_pichilemu,portal_disponibilidad)')
    .catch(() => []);
  const conf = {};
  filas.forEach(f => { conf[f.clave] = f.valor == null ? '' : String(f.valor); });
  return conf;
}

// Los pedidos que todavía no salen de bodega y ya comprometen producto.
async function pedidosQueReservan(leer, canal) {
  const base = 'pedidos?select=id,detalle,tipo,emp&estado=in.(pendiente,facturado)&limit=2000';
  // `canal` es una columna nueva de la v65. Si el SQL no se ha corrido, la
  // consulta con filtro falla: el portal general cuenta entonces todos los
  // pedidos (es lo conservador) y Pichilemu no cuenta ninguno, porque sin la
  // columna no hay forma de saber cuáles son suyos.
  const filtro = canal === 'pichilemu' ? '&canal=eq.pichilemu' : '&or=(canal.is.null,canal.neq.pichilemu)';
  let filas;
  try { filas = await leer(base + filtro); }
  catch (_) {
    if (canal === 'pichilemu') return [];
    try { filas = await leer(base); } catch (_) { return []; }
  }
  // Reservan las ventas, las muestras y la materia prima que se lleva a la
  // sala: todo eso sale de bodega. No reservan las tareas (no llevan
  // producto) ni el retiro de un lote, que trae producto en vez de llevárselo.
  const retiroLote = p => p.tipo === 'produccion' && /·\s*RETIRO$/i.test(String(p.emp || ''));
  filas = filas.filter(p => !['tarea', 'merma'].includes(String(p.tipo || 'venta')) && !retiroLote(p));
  if (!filas.length) return [];

  // Un pedido al que ya se le descontó bodega a mano no reserva: su producto
  // ya salió del saldo, y restarlo otra vez lo contaría dos veces.
  const conMov = new Set();
  const ids = filas.map(p => p.id);
  for (let i = 0; i < ids.length; i += 150) {
    try {
      const mv = await leer(`bod_movimientos?select=pedido_id&pedido_id=in.(${ids.slice(i, i + 150).join(',')})`);
      mv.forEach(m => conMov.add(String(m.pedido_id)));
    } catch (_) { /* sin el libro, se reserva igual: es lo conservador */ }
  }
  return filas.filter(p => !conMov.has(String(p.id)));
}

// Lo que ve el portal al abrir: canal, vendedora y qué productos están
// agotados u ocultos. Nada de cantidades: el stock no se le muestra al público.
async function disponibilidadPortal(SB_URL, SB_KEY, slug) {
  const conf = await leerConfigPortal(ruta => leerSB(SB_URL, SB_KEY, ruta));
  let canal = 'general', vendedora = '';
  if (slug) {
    const v = vendedoraPorSlug(conf.vendedoras_pichilemu, slug);
    if (!v) return { error: 'Este link de pedidos ya no está activo. Pídele a tu vendedora el link actualizado.' };
    canal = 'pichilemu';
    vendedora = String(v.nombre || '');
  }
  let todo = {};
  try { todo = JSON.parse(conf.portal_disponibilidad || '{}') || {}; } catch (_) { todo = {}; }
  const crudo = (todo && typeof todo[canal] === 'object' && todo[canal]) || {};
  // Solo los dos estados conocidos; cualquier otra cosa cuenta como disponible.
  const estados = {};
  for (const [k, v] of Object.entries(crudo))
    if (v === 'agotado' || v === 'oculto') estados[String(k).slice(0, 120)] = v;
  return { canal, vendedora, estados };
}

// El stock de referencia para la oficina: saldo de la bodega del portal menos
// lo comprometido, en lo que vende el portal (cajas o unidades).
async function stockBodega(SB_URL, SB_KEY, canal) {
  const leer = ruta => leerSB(SB_URL, SB_KEY, ruta);
  const [conf, bodegas] = await Promise.all([
    leerConfigPortal(leer),
    leer('bod_bodegas?select=id,nombre,activa')
  ]);
  const elegida = conf[canal === 'pichilemu' ? 'bodega_pichilemu' : 'bodega_clientes'];
  const pista = canal === 'pichilemu' ? 'pichilemu' : 'oficina';
  const bod = bodegas.find(b => elegida && String(b.id) === String(elegida)) ||
              bodegas.find(b => b.activa !== false && normTxt(b.nombre).includes(pista));
  if (!bod) return { canal, bodega: '', productos: [], aviso: 'No hay bodega elegida para este portal.' };

  const [saldos, productos, pendientes] = await Promise.all([
    leer(`bod_saldos?select=producto_id,saldo,unidades_caja&bodega_id=eq.${encodeURIComponent(bod.id)}`),
    leer('bod_productos?select=id,nombre,formato,unidades_caja,activo'),
    pedidosQueReservan(leer, canal)
  ]);

  const vivos = productos.filter(p => p.activo !== false);
  const saldoPor = new Map(saldos.map(s => [String(s.producto_id), s]));

  const reservado = new Map();   // producto → unidades base comprometidas
  pendientes.forEach(p => separarDetalle(p.detalle).forEach(txt => {
    const L = leerLinea(txt);
    if (!L || !L.cantidad) return;
    const prod = buscarProducto(vivos, L.nombre, L.formato);
    if (!prod) return;
    const s = saldoPor.get(String(prod.id));
    const u = L.medida === 'unidad' ? L.cantidad : L.cantidad * factorCaja(prod, s);
    reservado.set(String(prod.id), (reservado.get(String(prod.id)) || 0) + u);
  }));

  const lista = vivos.map(p => {
    const s = saldoPor.get(String(p.id));
    const f = factorCaja(p, s);
    const neto = (s ? Number(s.saldo) || 0 : 0) - (reservado.get(String(p.id)) || 0);
    return {
      nombre: p.nombre,
      formato: p.formato || '',
      disponible: Math.max(0, Math.floor((neto + 1e-9) / f)),
      // Si el producto alguna vez pasó por esta bodega: sirve para ocultar de
      // un viaje, en Pichilemu, lo que esa bodega nunca ha tenido.
      enBodega: !!s
    };
  });
  return { canal, bodega: bod.nombre, productos: lista, actualizado: new Date().toISOString() };
}

// Deja pasar solo los campos del formulario y fuerza el resto
function limpiarPedido(body) {
  if (Array.isArray(body))               return { error: 'Se esperaba un solo pedido.' };
  if (!body || typeof body !== 'object')  return { error: 'Cuerpo inválido.' };

  const fila = {};
  for (const [campo, largo] of Object.entries(CAMPOS_PUBLICOS)) {
    const v = body[campo];
    if (v === undefined || v === null) { fila[campo] = ''; continue; }
    if (typeof v !== 'string' && typeof v !== 'number') {
      if (CAMPOS_OPCIONALES.has(campo)) { fila[campo] = ''; continue; }
      return { error: `El campo ${campo} tiene un formato inesperado.` };
    }
    fila[campo] = String(v).slice(0, largo);
  }
  Object.assign(fila, CAMPOS_FORZADOS);

  // El folio va al índice único de la base: si viene con basura, se descarta en
  // vez de rechazar el pedido. Perder la protección contra duplicados es
  // molesto; perder la venta, no.
  if (!/^NTV-[0-9A-Z]{4,20}$/.test(fila.folio)) fila.folio = '';

  // El modo de entrega manda en cómo se trata el pedido: si viene cualquier
  // cosa, se asume despacho. Equivocarse hacia el despacho es recuperable
  // (el cliente llama y se coordina); equivocarse hacia el retiro deja a
  // alguien esperando un camión que nunca sale.
  fila.entrega = ENTREGAS.has(String(fila.entrega).trim().toLowerCase())
    ? String(fila.entrega).trim().toLowerCase()
    : 'despacho';

  // La dirección se conserva incluso en un retiro. Es un dato que el cliente
  // dio: si mañana quiere despacho, ya la tenemos. Lo que define el
  // comportamiento es `entrega`, no que el campo esté vacío.


  // El formulario ya exige estos dos; si llegan vacíos, no viene del portal
  if (!fila.emp.trim())     return { error: 'Falta el nombre de la empresa.' };
  if (!fila.detalle.trim()) return { error: 'El pedido no tiene productos.' };

  return { fila };
}

// ── entrada ───────────────────────────────────────────────────
export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    const url    = new URL(req.url);
    const metodo = req.method.toUpperCase();

    if (metodo === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors(origin) });

    // ── diagnóstico: qué está configurado, sin decir cuánto vale ──
    if (url.pathname === '/salud') {
      const { key } = llaves(env);
      return json({
        // Qué versión está desplegada. Varias veces el problema fue que lo
        // que corría no era lo que se creía: con esto se ve de un vistazo.
        version: 'v65 · disponibilidad en el portal y links de Pichilemu',
        ok: !!key && !!env.ADMIN_TOKEN,
        supabase_url: !!(env.SUPABASE_URL || env.SB_URL || env.SUPABASE_PROJECT_URL) ? 'configurada' : 'por omisión',
        supabase_key: key ? 'configurada' : 'FALTA',
        admin_token:  env.ADMIN_TOKEN ? 'configurada' : 'FALTA',
        bodega_token: env.BODEGA_TOKEN ? 'configurada' : 'no configurada (el portal de bodega no funciona)',
        produccion_token: env.PRODUCCION_TOKEN ? 'configurada' : 'no configurada (el portal de producción no funciona)',
        limitador:    env.LIMITADOR ? 'activo' : 'no configurado (se usa el freno de respaldo)',
        freno_claves: TOPE_CLAVES_MALAS + ' intentos fallidos por IP cada 15 min',
        origenes:     ORIGENES,
        tablas:       [...TABLAS]
      }, 200, origin);
    }

    // ── quién es esta clave ──
    //
    // Un solo login para todas las pantallas: se teclea la clave y el sistema
    // decide a cuál entrar. Para eso hay que preguntarle al Worker, que es el
    // único que sabe qué clave es cuál.
    //
    // Devuelve el rol y NADA más. No dice si la otra clave existe, ni cuántas
    // hay: una respuesta que distinguiera "clave mala" de "clave de otro rol"
    // le diría a quien prueba claves que va por buen camino.
    //
    // Que esto exista no relaja nada. Los permisos los sigue verificando cada
    // petición según la clave que trae; esta ruta solo evita que el usuario
    // tenga que saber en qué dirección entrar.
    if (url.pathname === '/rol') {
      if (esAdmin(req, env))  return json({ rol: 'admin' },  200, origin);
      if (esBodega(req, env)) return json({ rol: 'bodega' }, 200, origin);
      if (esProduccion(req, env)) return json({ rol: 'produccion' }, 200, origin);
      // Se cuenta como intento fallido, igual que cualquier otro: si no, esta
      // ruta sería una forma de probar claves sin tope.
      const ip = req.headers.get('CF-Connecting-IP') || 'sin-ip';
      if (req.headers.get('X-Admin-Token')) {
        if (clavesMalas(ip) >= TOPE_CLAVES_MALAS)
          return json({ error: 'Demasiados intentos con la clave equivocada. ' +
            'Espera quince minutos antes de volver a probar.' }, 429, origin);
        anotarClaveMala(ip);
      }
      return json({ error: 'Clave incorrecta.' }, 401, origin);
    }

    // ── lo que el portal puede ofrecer (v65) ──
    //
    // Pública, como el envío de pedidos, y con las mismas dos cercas: solo
    // desde el dominio del portal y con freno por IP. Devuelve solo qué está
    // agotado u oculto: ninguna cantidad.
    if (url.pathname === '/portal') {
      if (metodo !== 'GET') return json({ error: 'Método no permitido.' }, 405, origin);
      if (!origenConocido(origin))
        return json({ error: 'Origen no autorizado.' }, 403, origin);
      const ip = req.headers.get('CF-Connecting-IP') || 'sin-ip';
      if (!frenoEn(VISTOS_STOCK, TOPE_STOCK_POR_MINUTO, ip))
        return json({ error: 'Demasiadas consultas seguidas. Espera un momento.' }, 429, origin);
      const { url: SB_URL, key: SB_KEY } = llaves(env);
      if (!SB_KEY) return json({ error: 'Falta la variable SUPABASE_KEY en este Worker.' }, 500, origin);
      const slug = String(url.searchParams.get('v') || '').slice(0, 60);
      try {
        const datos = await disponibilidadPortal(SB_URL, SB_KEY, slug);
        return json(datos, datos.error ? 404 : 200, origin);
      } catch (e) {
        return json({ error: 'No se pudo leer la disponibilidad.' }, 502, origin);
      }
    }

    // ── el stock de referencia, solo para la oficina (v65) ──
    if (url.pathname === '/disponible') {
      if (metodo !== 'GET') return json({ error: 'Método no permitido.' }, 405, origin);
      if (!esAdmin(req, env)) {
        const ip = req.headers.get('CF-Connecting-IP') || 'sin-ip';
        if (req.headers.get('X-Admin-Token')) {
          if (clavesMalas(ip) >= TOPE_CLAVES_MALAS)
            return json({ error: 'Demasiados intentos con la clave equivocada. ' +
              'Espera quince minutos antes de volver a probar.' }, 429, origin);
          anotarClaveMala(ip);
        }
        return json({ error: 'No autorizado.' }, 401, origin);
      }
      const { url: SB_URL, key: SB_KEY } = llaves(env);
      if (!SB_KEY) return json({ error: 'Falta la variable SUPABASE_KEY en este Worker.' }, 500, origin);
      const canal = url.searchParams.get('canal') === 'pichilemu' ? 'pichilemu' : 'general';
      try { return json(await stockBodega(SB_URL, SB_KEY, canal), 200, origin); }
      catch (e) { return json({ error: 'No se pudo leer el stock.' }, 502, origin); }
    }

    if (!url.pathname.startsWith('/supabase/'))
      return json({ error: 'Ruta no encontrada.' }, 404, origin);
    const { url: SB_URL, key: SB_KEY } = llaves(env);
    if (!SB_KEY)
      return json({ error: 'Falta la variable SUPABASE_KEY en este Worker. ' +
        'Revisa que esté escrita exactamente así, en mayúsculas, y que hayas apretado Deploy después de agregarla.' }, 500, origin);

    // ── tabla ──
    const resto = url.pathname.slice('/supabase/'.length);
    const tabla = resto.split('/')[0];
    if (!/^[a-z_]+$/.test(tabla) || !TABLAS.has(tabla) || resto.includes('/'))
      return json({ error: 'Recurso no permitido.' }, 403, origin);

    if (!METODOS.has(metodo))
      return json({ error: 'Método no permitido.' }, 405, origin);

    // ── ¿portal público o panel? ──
    // El portal escribe sin clave, así que esa puerta tiene que ser lo más
    // angosta posible: solo POST, solo a pedidos, y solo desde un origen
    // conocido. Sin lo último, cualquiera con la dirección del Worker puede
    // llenar la tabla de pedidos falsos con una línea de curl: CORS solo
    // restringe navegadores, no a quien llama al Worker directamente.
    const admin   = esAdmin(req, env);
    const bodega  = !admin && esBodega(req, env);
    const prod    = !admin && !bodega && esProduccion(req, env);
    const publica = (metodo === 'POST' && tabla === 'pedidos' && !admin && !bodega &&
                     !prod && origenConocido(origin));

    // Una clave correcta limpia el contador: el operador que se equivocó tres
    // veces y después entró bien no tiene por qué quedar penalizado.
    const ipQuien = req.headers.get('CF-Connecting-IP') || 'sin-ip';
    if (admin || bodega || prod) FALLIDOS.delete(ipQuien);

    if (!admin && !bodega && !prod && !publica) {
      if (metodo === 'POST' && tabla === 'pedidos' && !origenConocido(origin))
        return json({ error: 'Origen no autorizado' + (origin ? ': ' + origin : ' (la petición no declara de dónde viene).') +
          ' Si el portal cambió de dominio, agrégalo a ORIGENES en el Worker.' }, 403, origin);
      if (!env.ADMIN_TOKEN)
        return json({ error: 'Falta la variable ADMIN_TOKEN en este Worker. ' +
          'Agrégala en Settings → Variables y aprieta Deploy.' }, 500, origin);

      // Solo se cuenta si vino un token y estaba mal. Sin token no es alguien
      // probando la clave, y el mensaje distingue los dos casos para que un
      // operador que se equivocó entienda qué le pasa.
      if (req.headers.get('X-Admin-Token')) {
        if (clavesMalas(ipQuien) >= TOPE_CLAVES_MALAS)
          return json({ error: 'Demasiados intentos con la clave equivocada. ' +
            'Espera quince minutos antes de volver a probar.' }, 429, origin);
        anotarClaveMala(ipQuien);
      }
      return json({ error: 'No autorizado.' }, 401, origin);
    }

    // Un PATCH o DELETE sin filtro afecta la tabla completa
    if ((metodo === 'PATCH' || metodo === 'DELETE') && !/[?&][a-z_]+=(eq|in|is)\./.test(url.search))
      return json({ error: 'Falta el filtro. Se rechaza para no afectar toda la tabla.' }, 400, origin);

    // ── cuerpo ──
    let cuerpo = null;
    let notaPichilemu = '';   // por si hay que guardar el pedido sin las columnas nuevas
    if (metodo === 'POST' || metodo === 'PATCH') {
      const crudo = await req.text();
      if (crudo.length > MAX_BODY)
        return json({ error: 'El pedido es demasiado grande.' }, 413, origin);
      try { cuerpo = JSON.parse(crudo); }
      catch { return json({ error: 'JSON inválido.' }, 400, origin); }

      if (publica) {
        if (url.search) return json({ error: 'No se permiten parámetros aquí.' }, 400, origin);
        const r = limpiarPedido(cuerpo);
        if (r.error) return json({ error: r.error }, 400, origin);
        cuerpo = r.fila;

        // v65 · el link de una vendedora de Pichilemu. El código se cambia por
        // el canal y el nombre, que salen de la lista de la oficina; el código
        // mismo no se guarda.
        const slug = String(cuerpo.pichilemu || '').trim();
        delete cuerpo.pichilemu;
        if (slug) {
          let v = null;
          try { v = vendedoraPorSlug((await leerConfigPortal(ruta => leerSB(SB_URL, SB_KEY, ruta))).vendedoras_pichilemu, slug); }
          catch (_) { v = null; }
          if (v) {
            cuerpo.canal = 'pichilemu';
            cuerpo.vendedora = String(v.nombre || '').slice(0, 120);
            notaPichilemu = `[Pichilemu · vendedora ${cuerpo.vendedora}]`;
          } else {
            // El link dejó de existir mientras el cliente compraba. El pedido
            // se guarda igual —perderlo cuesta una venta— y la oficina ve por
            // qué llegó sin vendedora.
            cuerpo.mensaje = `${cuerpo.mensaje ? cuerpo.mensaje + ' ' : ''}[Llegó por un link de Pichilemu que ya no está activo]`;
          }
        }
      }
    }

    // Los permisos del bodeguero se revisan ACÁ y no más arriba, porque un
    // PATCH se juzga por lo que trae en el cuerpo y no solo por la tabla a la
    // que apunta. Cambiar el estado de un pedido está permitido; cambiarle el
    // número de factura, no, y las dos peticiones van a la misma dirección.
    if (bodega) {
      const no = puedeBodega(metodo, tabla, cuerpo, url.search);
      if (no) return json({ error: no }, 403, origin);
    }
    if (prod) {
      const no = puedeProduccion(metodo, tabla, cuerpo, url.search);
      if (no) return json({ error: no }, 403, origin);
    }

    // ── límite de velocidad ──
    if (publica) {
      const ip = ipQuien;
      let pasa = true;
      if (env.LIMITADOR) {
        const { success } = await env.LIMITADOR.limit({ key: ip });
        pasa = success;
      } else {
        pasa = frenoLocal(ip);
      }
      if (!pasa)
        return json({ error: 'Demasiados pedidos seguidos. Espera un momento.' }, 429, origin);
    }

    // ── reenvío a Supabase con headers propios, no los del cliente ──
    //
    //  Ojo con esto si alguna vez escribes una pantalla nueva: las cabeceras
    //  que mande el navegador NO llegan a Supabase, solo las tres de abajo.
    //  Nada de `Range` ni de `Prefer` del cliente. Para pedir por tandas,
    //  usa `limit` y `offset` en la dirección, que sí se reenvía completa
    //  (así lo hace bodega.html con el libro de movimientos).
    const destino = `${SB_URL.replace(/\/$/, '')}/rest/v1/${tabla}${url.search}`;
    const headers = {
      'apikey':        SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Accept':        'application/json'
    };
    if (cuerpo !== null) {
      headers['Content-Type'] = 'application/json';
      // Un POST devuelve lo que creó; el resto, nada.
      //
      // Hace falta para colgar filas de lo recién creado: las líneas de un
      // pedido necesitan su id, y sin la fila de vuelta habría que adivinarlo
      // releyendo la tabla y quedándose con el último, que es una carrera
      // perdida en cuanto dos personas guardan a la vez.
      //
      // Sigue siendo el Worker quien lo decide, no el cliente: la cabecera
      // `Prefer` que venga del navegador se ignora igual que antes.
      headers['Prefer'] = metodo === 'POST' ? 'return=representation' : 'return=minimal';
    }

    const enviar = c => fetch(destino, {
      method:  metodo,
      headers,
      body:    c !== null ? JSON.stringify(c) : undefined
    });

    let arriba;
    try {
      arriba = await enviar(cuerpo);
      // v65 · si el SQL de las columnas `canal` y `vendedora` todavía no se
      // corrió, la base rechaza el pedido de Pichilemu. Se guarda igual, sin
      // esas columnas y con la vendedora escrita en el mensaje, para no perder
      // la venta mientras se pone al día la base.
      if (publica && cuerpo && cuerpo.canal && arriba.status === 400) {
        const t = await arriba.clone().text();
        if (/canal|vendedora|PGRST204|42703/i.test(t)) {
          const sin = { ...cuerpo };
          delete sin.canal; delete sin.vendedora;
          sin.mensaje = `${sin.mensaje ? sin.mensaje + ' ' : ''}${notaPichilemu}`;
          arriba = await enviar(sin);
        }
      }
    } catch {
      return json({ error: 'No se pudo contactar la base de datos.' }, 502, origin);
    }

    // Si Supabase rechaza la llave DEL WORKER, no se puede devolver 401: el
    // panel lo leería como "tu clave de admin está mala" y te sacaría al login,
    // escondiendo el problema real durante una instalación.
    if (arriba.status === 401 || arriba.status === 403)
      return json({ error: 'La base de datos rechazó la llave del Worker. Revisa SUPABASE_KEY en las variables.' }, 502, origin);

    const vacio  = SIN_CUERPO.has(arriba.status);
    const texto  = vacio ? null : await arriba.text();
    const salida = { ...cors(origin) };
    if (!vacio) salida['Content-Type'] = arriba.headers.get('Content-Type') || 'application/json';
    return new Response(texto, { status: arriba.status, headers: salida });
  }
};
