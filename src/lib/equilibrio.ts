/**
 * EL PUNTO DE EQUILIBRIO Y EL PRECIO POR UTILIDAD OBJETIVO.
 *
 * Dos partes bien separadas, y conviene no confundirlas:
 *
 *   1. LAS FORMULAS (seccion 1). Funciones PURAS de numeros a numeros:
 *      entran costos fijos, precio y costo variable unitario, sale el punto
 *      de equilibrio. No saben que existe el Kardex ni la nomina.
 *
 *   2. DE DONDE SALEN ESOS NUMEROS (seccion 2). La clasificacion fijo /
 *      variable que lee lo que el sistema ya calculo —CIF del periodo,
 *      liquidaciones de nomina, costo de las recetas— y arma los tres datos
 *      que las formulas necesitan. Tambien pura: entra el estado, salen las
 *      bases.
 *
 * Y una tercera cosa que NO esta aqui: el precio. El precio sugerido ya vive
 * en `hoja.ts` (`precioSugerido`), con su redondeo y sus guardas, y esa sigue
 * siendo la unica implementacion. `precioParaUtilidad` devuelve el margen y
 * el markup que dejan ese precio, de modo que pasarlos por `precioSugerido`
 * da el mismo numero. Hay un test que lo fija.
 *
 * ---------------------------------------------------------------------
 * LAS FORMULAS
 *
 *   MC   = PV - CVu                      margen de contribucion unitario
 *   r    = MC / PV                       razon de contribucion
 *   Q*   = CF / MC                       equilibrio en unidades
 *   $*   = Q* x PV = CF / r              equilibrio en pesos
 *   Qu   = (CF + U) / MC                 unidades para una utilidad U
 *   PV   = CVu + (CF + U) / Q            precio para una utilidad U a volumen Q
 *
 * Y con varios productos, por canasta de ventas:
 *
 *   MC_canasta = Σ (unidades_i x MC_i)
 *   canastas*  = CF / MC_canasta
 *   unidades_i = canastas* x unidades_i_por_canasta
 *
 * ---------------------------------------------------------------------
 * LA GUARDA QUE IMPORTA
 *
 * Si el precio no alcanza a cubrir el costo variable unitario, el margen de
 * contribucion es cero o negativo y NO EXISTE punto de equilibrio: vender mas
 * agranda la perdida. Dividir igual daria un numero negativo o infinito, y
 * mostrarlo como «hay que vender X unidades» seria mentir. En ese caso
 * `valido` queda en false, las unidades en 0 y `problema` explica por que.
 *
 * ---------------------------------------------------------------------
 * AVISO ACADEMICO
 *
 * Es el modelo costo-volumen-utilidad de siempre, con sus supuestos: todo lo
 * que se produce se vende, el precio no cambia con el volumen, los costos
 * fijos son fijos en el rango relevante y los variables son estrictamente
 * proporcionales. Sirve para decidir y para el taller; no es una proyeccion
 * financiera.
 */

import { divSegura, redondearArriba } from './calc'
import { periodoDeOrden } from './cif'
import type {
  CategoriaCIF,
  CIF,
  CostoReceta,
  Gasto,
  HojaCostos,
  ID,
  Liquidacion,
  Mes,
  OrdenProduccion,
  PeriodoNomina,
  Producto,
  Receta,
  SupuestoEquilibrio,
  Trabajador,
  UnidadMedida,
} from './tipos'

// =====================================================================
// 1. LAS FORMULAS
// =====================================================================

export interface PuntoEquilibrio {
  costos_fijos: number
  precio: number
  costo_variable_unitario: number
  /** PV - CVu. Lo que cada unidad vendida aporta a cubrir los fijos. */
  margen_contribucion: number
  /** MC / PV, entre 0 y 1. Que parte de cada peso vendido queda. */
  razon_contribucion: number
  /** CF / MC, exacto (puede tener decimales). */
  unidades: number
  /** Las mismas unidades redondeadas ARRIBA: no se vende media unidad. */
  unidades_enteras: number
  /** unidades x PV. Lo que hay que facturar para no perder ni ganar. */
  pesos: number
  valido: boolean
  problema?: string
}

/**
 * Las unidades, redondeadas HACIA ARRIBA: no se vende media banca, y con
 * 500,1 unidades de equilibrio vender 500 todavia deja perdida.
 *
 * Con una excepcion: si el numero ya es entero salvo por el error de coma
 * flotante, se toma el entero. Sin esto, una division que da exactamente 200
 * pero se guarda como 200,00000000000003 se mostraria como 201 unidades, y el
 * usuario no tiene forma de saber que esa unidad extra no existe.
 */
function unidadesEnteras(n: number): number {
  const entero = Math.round(n)
  const tolerancia = Math.max(1e-9, Math.abs(n) * 1e-12)
  if (Math.abs(n - entero) <= tolerancia) return entero
  return redondearArriba(n, 1)
}

/** Lo que devuelven todas las formulas cuando no se puede calcular. */
function sinEquilibrio(
  costosFijos: number,
  precio: number,
  cvu: number,
  problema: string,
): PuntoEquilibrio {
  const mc = precio - cvu
  return {
    costos_fijos: costosFijos,
    precio,
    costo_variable_unitario: cvu,
    margen_contribucion: Number.isFinite(mc) ? mc : 0,
    razon_contribucion: precio > 0 && Number.isFinite(mc) ? mc / precio : 0,
    unidades: 0,
    unidades_enteras: 0,
    pesos: 0,
    valido: false,
    problema,
  }
}

/**
 * El punto de equilibrio de un producto.
 *
 * Con costos fijos en cero el equilibrio es cero unidades, y eso es correcto:
 * si no hay nada fijo que cubrir, la primera unidad ya deja utilidad.
 */
export function puntoEquilibrio(
  costosFijos: number,
  precio: number,
  costoVariableUnitario: number,
): PuntoEquilibrio {
  const cf = costosFijos
  const cvu = costoVariableUnitario

  if (!Number.isFinite(cf) || !Number.isFinite(precio) || !Number.isFinite(cvu)) {
    return sinEquilibrio(cf, precio, cvu, 'Alguno de los tres datos no es un número.')
  }
  if (precio <= 0) {
    return sinEquilibrio(cf, precio, cvu, 'Sin precio de venta no hay punto de equilibrio.')
  }
  if (cvu < 0) {
    return sinEquilibrio(cf, precio, cvu, 'El costo variable unitario no puede ser negativo.')
  }
  if (cf < 0) {
    return sinEquilibrio(cf, precio, cvu, 'Los costos fijos no pueden ser negativos.')
  }

  const mc = precio - cvu

  if (mc <= 0) {
    return sinEquilibrio(
      cf,
      precio,
      cvu,
      'El precio no alcanza a cubrir el costo variable unitario: no hay punto de equilibrio. ' +
        'Cada unidad que se venda agranda la pérdida.',
    )
  }

  const unidades = cf / mc

  return {
    costos_fijos: cf,
    precio,
    costo_variable_unitario: cvu,
    margen_contribucion: mc,
    razon_contribucion: mc / precio,
    unidades,
    unidades_enteras: unidadesEnteras(unidades),
    pesos: unidades * precio,
    valido: true,
  }
}

export interface UnidadesObjetivo {
  utilidad: number
  margen_contribucion: number
  /** (CF + U) / MC, exacto. */
  unidades: number
  unidades_enteras: number
  pesos: number
  valido: boolean
  problema?: string
}

/**
 * Cuantas unidades hay que vender para que quede una utilidad U.
 *
 * Es el mismo punto de equilibrio con la utilidad sumada a los fijos: la
 * utilidad objetivo se comporta como un costo fijo mas que hay que cubrir.
 */
export function unidadesParaUtilidad(
  costosFijos: number,
  precio: number,
  costoVariableUnitario: number,
  utilidad: number,
): UnidadesObjetivo {
  const base = puntoEquilibrio(costosFijos, precio, costoVariableUnitario)
  const vacio = {
    utilidad,
    margen_contribucion: base.margen_contribucion,
    unidades: 0,
    unidades_enteras: 0,
    pesos: 0,
    valido: false,
  }

  if (!base.valido) return { ...vacio, problema: base.problema }
  if (!Number.isFinite(utilidad)) return { ...vacio, problema: 'La utilidad objetivo no es un número.' }
  if (utilidad < 0) {
    return { ...vacio, problema: 'La utilidad objetivo no puede ser negativa: eso ya es una pérdida.' }
  }

  const unidades = (costosFijos + utilidad) / base.margen_contribucion

  return {
    utilidad,
    margen_contribucion: base.margen_contribucion,
    unidades,
    unidades_enteras: unidadesEnteras(unidades),
    pesos: unidades * precio,
    valido: true,
  }
}

export interface PrecioObjetivo {
  costos_fijos: number
  costo_variable_unitario: number
  /** El volumen esperado Q. Es el dato que lo cambia todo. */
  volumen: number
  utilidad: number
  /** CVu + CF/Q: lo que cuesta de verdad cada unidad A ESE VOLUMEN. */
  costo_unitario_total: number
  /** U / Q: la utilidad que tiene que dejar cada unidad. */
  utilidad_unitaria: number
  /** CVu + (CF + U)/Q. Sin redondear: el redondeo lo pone `precioSugerido`. */
  precio: number
  /**
   * El margen SOBRE LA VENTA que deja ese precio, en porcentaje.
   * `precioSugerido(costo_unitario_total, 'sobre_precio', este pct)` devuelve
   * el mismo precio.
   */
  margen_sobre_venta_pct: number
  /**
   * El recargo SOBRE EL COSTO que deja ese precio, en porcentaje.
   * `precioSugerido(costo_unitario_total, 'sobre_costo', este pct)` devuelve
   * el mismo precio.
   */
  markup_sobre_costo_pct: number
  valido: boolean
  problema?: string
}

/**
 * El precio que hay que cobrar para que, vendiendo Q unidades, quede una
 * utilidad U.
 *
 * El volumen es la parte que la gente olvida: el mismo producto con la misma
 * utilidad objetivo necesita precios muy distintos segun cuantas unidades se
 * esperen, porque los costos fijos se reparten entre esas unidades. Por eso Q
 * es obligatorio y tiene que ser mayor que cero.
 *
 * NO redondea el precio: devuelve el exacto y los dos porcentajes que lo
 * generan, para que la UI lo pase por `precioSugerido` —la unica funcion que
 * redondea precios en este sistema— y los dos caminos den lo mismo.
 */
export function precioParaUtilidad(
  costosFijos: number,
  costoVariableUnitario: number,
  volumen: number,
  utilidad: number,
): PrecioObjetivo {
  const cf = costosFijos
  const cvu = costoVariableUnitario
  const q = volumen

  const vacio: PrecioObjetivo = {
    costos_fijos: cf,
    costo_variable_unitario: cvu,
    volumen: q,
    utilidad,
    costo_unitario_total: 0,
    utilidad_unitaria: 0,
    precio: 0,
    margen_sobre_venta_pct: 0,
    markup_sobre_costo_pct: 0,
    valido: false,
  }

  if (![cf, cvu, q, utilidad].every((n) => Number.isFinite(n))) {
    return { ...vacio, problema: 'Alguno de los datos no es un número.' }
  }
  if (q <= 0) {
    return { ...vacio, problema: 'Sin volumen esperado no hay precio que calcular: ¿entre cuántas unidades se reparten los costos fijos?' }
  }
  if (cf < 0 || cvu < 0) {
    return { ...vacio, problema: 'Ni los costos fijos ni el costo variable pueden ser negativos.' }
  }
  if (utilidad < 0) {
    return { ...vacio, problema: 'La utilidad objetivo no puede ser negativa.' }
  }

  const costo_unitario_total = cvu + cf / q

  if (costo_unitario_total <= 0) {
    return {
      ...vacio,
      problema: 'Sin ningún costo no hay precio que derivar del costo: cargá los costos fijos o el variable unitario.',
    }
  }

  const utilidad_unitaria = utilidad / q
  const precio = costo_unitario_total + utilidad_unitaria

  return {
    costos_fijos: cf,
    costo_variable_unitario: cvu,
    volumen: q,
    utilidad,
    costo_unitario_total,
    utilidad_unitaria,
    precio,
    margen_sobre_venta_pct: (utilidad_unitaria / precio) * 100,
    markup_sobre_costo_pct: (utilidad_unitaria / costo_unitario_total) * 100,
    valido: true,
  }
}

export interface LineaMezcla {
  producto_id: ID
  nombre: string
  /** Cuantas unidades de este producto hay en una canasta de ventas. */
  unidades_canasta: number
  precio: number
  costo_variable_unitario: number
}

export interface LineaMezclaResuelta extends LineaMezcla {
  margen_contribucion: number
  /** MC x unidades en la canasta: lo que este producto aporta por canasta. */
  aporte_canasta: number
  /** Las unidades de este producto en el equilibrio de la empresa. */
  unidades: number
  unidades_enteras: number
  pesos: number
  /** Que parte del margen de la canasta pone este producto. */
  participacion: number
}

export interface EquilibrioMezcla {
  costos_fijos: number
  /** Lo que aporta una canasta completa. */
  margen_contribucion_canasta: number
  /** Lo que se factura por una canasta completa. */
  precio_canasta: number
  razon_contribucion: number
  /** CF / MC_canasta. */
  canastas: number
  lineas: LineaMezclaResuelta[]
  unidades_totales: number
  pesos: number
  valido: boolean
  problema?: string
}

/**
 * El punto de equilibrio de una empresa que vende varios productos.
 *
 * No se puede sumar el equilibrio de cada producto por separado: los costos
 * fijos son de la empresa, no de un producto, y repartirlos ya seria una
 * decision. Lo que se hace es fijar la MEZCLA —cuantas unidades de cada
 * producto se venden juntas, la «canasta»— y buscar cuantas canastas se
 * necesitan. La mezcla es un supuesto: si cambia, el equilibrio cambia aunque
 * no se mueva ningun costo.
 *
 * Una linea con MC negativo NO se excluye: se deja ver, porque arrastra el
 * margen de la canasta hacia abajo y eso es justamente lo que hay que notar.
 */
export function equilibrioMezcla(
  lineas: readonly LineaMezcla[],
  costosFijos: number,
): EquilibrioMezcla {
  const resueltas: LineaMezclaResuelta[] = lineas.map((l) => {
    const mc = l.precio - l.costo_variable_unitario
    return {
      ...l,
      margen_contribucion: mc,
      aporte_canasta: mc * l.unidades_canasta,
      unidades: 0,
      unidades_enteras: 0,
      pesos: 0,
      participacion: 0,
    }
  })

  const mcCanasta = resueltas.reduce((s, l) => s + l.aporte_canasta, 0)
  const precioCanasta = resueltas.reduce((s, l) => s + l.precio * l.unidades_canasta, 0)

  const base: EquilibrioMezcla = {
    costos_fijos: costosFijos,
    margen_contribucion_canasta: mcCanasta,
    precio_canasta: precioCanasta,
    razon_contribucion: precioCanasta > 0 ? mcCanasta / precioCanasta : 0,
    canastas: 0,
    lineas: resueltas,
    unidades_totales: 0,
    pesos: 0,
    valido: false,
  }

  if (resueltas.length === 0) {
    return { ...base, problema: 'No hay productos en la mezcla.' }
  }
  if (!Number.isFinite(costosFijos) || costosFijos < 0) {
    return { ...base, problema: 'Los costos fijos no son un número válido.' }
  }
  if (resueltas.every((l) => l.unidades_canasta <= 0)) {
    return { ...base, problema: 'La canasta está vacía: definí cuántas unidades de cada producto se venden juntas.' }
  }
  if (mcCanasta <= 0) {
    return {
      ...base,
      problema:
        'La canasta no deja margen de contribución: con esta mezcla de precios y costos variables no hay punto de equilibrio.',
    }
  }

  const canastas = costosFijos / mcCanasta

  const conUnidades = resueltas.map((l) => {
    const unidades = canastas * l.unidades_canasta
    return {
      ...l,
      unidades,
      unidades_enteras: unidadesEnteras(unidades),
      pesos: unidades * l.precio,
      participacion: divSegura(l.aporte_canasta, mcCanasta),
    }
  })

  return {
    ...base,
    canastas,
    lineas: conUnidades,
    unidades_totales: conUnidades.reduce((s, l) => s + l.unidades, 0),
    pesos: conUnidades.reduce((s, l) => s + l.pesos, 0),
    valido: true,
  }
}


// =====================================================================
// 2. ESCENARIOS DE GANANCIA
// =====================================================================

/*
  El punto de equilibrio contesta UNA pregunta: cuanto hay que vender para no
  perder. Los escenarios contestan la siguiente, que es la que de verdad sirve
  para decidir: y si vendo mas, cuanto gano.

  Es el mismo estado de resultados por costeo variable, repetido a varios
  volumenes:

      ventas               = Q x PV
      - costos variables   = Q x CVu
      = margen contribucion
      - costos fijos       (no cambian con Q: esa es toda la gracia)
      = utilidad operativa

  Lo que se ve al ponerlos en fila es que la utilidad NO crece proporcional a
  las ventas: crece mas rapido, porque los fijos ya estan cubiertos. Duplicar
  el volumen sobre el equilibrio no duplica la utilidad, la multiplica mucho
  mas. Ese salto es el apalancamiento operativo, y es la razon de ser de esta
  tabla.
*/

export interface FilaEscenario {
  /** Como se llama este escenario: «Equilibrio», «×1,5», «Volumen esperado». */
  etiqueta: string
  unidades: number
  ventas: number
  costos_variables: number
  margen_contribucion: number
  costos_fijos: number
  /** margen de contribucion - costos fijos. Puede ser negativa. */
  utilidad_operativa: number
  /** utilidad / ventas, entre 0 y 1. En 0 ventas da 0. */
  margen_operativo: number
  /** Para que la pantalla marque la fila del equilibrio. */
  es_equilibrio: boolean
}

/**
 * Un escenario: que pasa si se venden Q unidades.
 *
 * FUNCION PURA y sin guardas que corten: un volumen de 0 o una utilidad
 * negativa son escenarios validos y se calculan igual. Perder plata a volumen
 * cero es exactamente lo que hay que poder mostrar —ahi se ve que los costos
 * fijos existen aunque no se produzca nada—. Las guardas viven en
 * `puntoEquilibrio`, que es quien decide si hay equilibrio o no.
 */
export function escenario(
  costosFijos: number,
  precio: number,
  costoVariableUnitario: number,
  unidades: number,
  etiqueta = '',
  esEquilibrio = false,
): FilaEscenario {
  const q = Number.isFinite(unidades) ? Math.max(0, unidades) : 0
  const ventas = q * precio
  const costos_variables = q * costoVariableUnitario
  const margen_contribucion = ventas - costos_variables
  /*
    En el equilibrio la utilidad es cero por definicion, pero la division que
    saco las unidades deja un resto de coma flotante y el resultado queda en
    -0,0000000001. Mostrado da «−$0» y «-0%», que parece un error de calculo y
    no lo es. Todo lo que no llega a medio centavo se trata como cero, el mismo
    umbral que usa `diferenciasEntre` en hoja.ts.
  */
  const bruta = margen_contribucion - costosFijos
  const utilidad_operativa = Math.abs(bruta) < 0.005 ? 0 : bruta

  return {
    etiqueta,
    unidades: q,
    ventas,
    costos_variables,
    margen_contribucion,
    costos_fijos: costosFijos,
    utilidad_operativa,
    margen_operativo: divSegura(utilidad_operativa, ventas),
    es_equilibrio: esEquilibrio,
  }
}

export interface OpcionesEscenarios {
  /** El volumen que la empresa espera vender. Se agrega como su propia fila. */
  volumenEsperado?: number
  /** Multiplos del equilibrio. Por defecto 1,25 · 1,5 · 2. */
  multiplos?: readonly number[]
}

/**
 * La tabla completa: cero, el equilibrio, unos multiplos del equilibrio y el
 * volumen que la empresa espera.
 *
 * Las filas salen ORDENADAS por unidades y SIN REPETIR: si el volumen
 * esperado cae justo en el equilibrio o en un multiplo, no aparece dos veces
 * —se queda la etiqueta mas informativa—. Repetir una fila en un cuadro
 * comparativo es peor que omitirla: invita a leer dos veces el mismo dato.
 *
 * Si no hay punto de equilibrio (el precio no cubre el costo variable), la
 * tabla NO se inventa multiplos de un numero que no existe: devuelve solo el
 * cero y el volumen esperado, que siguen siendo escenarios reales aunque den
 * perdida.
 */
export function tablaEscenarios(
  costosFijos: number,
  precio: number,
  costoVariableUnitario: number,
  opciones: OpcionesEscenarios = {},
): FilaEscenario[] {
  const pe = puntoEquilibrio(costosFijos, precio, costoVariableUnitario)
  const multiplos = opciones.multiplos ?? [1.25, 1.5, 2]

  /** Candidatos: unidades + etiqueta + si es la fila del equilibrio. */
  const candidatos: Array<{ q: number; etiqueta: string; equilibrio: boolean }> = [
    { q: 0, etiqueta: 'Sin vender nada', equilibrio: false },
  ]

  if (pe.valido) {
    candidatos.push({ q: pe.unidades, etiqueta: 'Equilibrio', equilibrio: true })
    for (const m of multiplos) {
      if (!Number.isFinite(m) || m <= 0) continue
      candidatos.push({
        q: pe.unidades * m,
        etiqueta: `×${m.toLocaleString('es-CO')} el equilibrio`,
        equilibrio: false,
      })
    }
  }

  const esperado = opciones.volumenEsperado
  if (esperado != null && Number.isFinite(esperado) && esperado > 0) {
    candidatos.push({ q: esperado, etiqueta: 'Volumen esperado', equilibrio: false })
  }

  /*
    Deduplicar por unidades. Se comparan redondeadas a 6 decimales para que
    1.000,0000001 y 1.000 no cuenten como dos escenarios distintos, que es lo
    que pasaria con el volumen esperado cayendo sobre un multiplo.
  */
  const vistos = new Map<number, { q: number; etiqueta: string; equilibrio: boolean }>()
  for (const c of candidatos) {
    const clave = Math.round(c.q * 1e6) / 1e6
    const previo = vistos.get(clave)
    if (!previo) {
      vistos.set(clave, c)
      continue
    }
    // el equilibrio manda sobre cualquier otra etiqueta; despues, el volumen esperado
    if (c.equilibrio) vistos.set(clave, c)
    else if (!previo.equilibrio && c.etiqueta === 'Volumen esperado') {
      vistos.set(clave, { ...c, etiqueta: `${previo.etiqueta} · volumen esperado` })
    }
  }

  return [...vistos.values()]
    .sort((a, b) => a.q - b.q)
    .map((c) => escenario(costosFijos, precio, costoVariableUnitario, c.q, c.etiqueta, c.equilibrio))
}

// =====================================================================
// 3. LOS TRES TIPOS DE UTILIDAD
// =====================================================================

/*
  «Utilidad» a secas no quiere decir nada: hay tres, y cada una resta cosas
  distintas. Confundirlas es como confundir el neto a pagar con el costo del
  empleado.

      ventas
      - costo de ventas        (lo variable de produccion + los fijos DE FABRICA)
      = UTILIDAD BRUTA
      - gastos del periodo     (administracion y ventas)
      = UTILIDAD OPERATIVA
      - impuesto
      = UTILIDAD NETA

  Fijate donde cae la raya: el arriendo de la planta esta ARRIBA, dentro del
  costo de ventas, porque es costo del producto. El arriendo de la oficina
  esta ABAJO, porque es gasto del periodo. Es la misma distincion por
  naturaleza de categoria que ya decide quien entra a la hoja de costos, y por
  eso los dos modulos no pueden contradecirse.
*/

export interface TiposDeUtilidad {
  unidades: number
  ventas: number
  /** Variable de produccion x Q, mas los fijos de fabrica. */
  costo_ventas: number
  utilidad_bruta: number
  margen_bruto: number
  /** Administracion y ventas: no son costo del producto. */
  gastos_periodo: number
  utilidad_operativa: number
  margen_operativo: number
  tasa_impuesto: number
  impuesto: number
  utilidad_neta: number
  margen_neto: number
  valido: boolean
  problema?: string
}

export interface EntradaTiposUtilidad {
  unidades: number
  precio: number
  costo_variable_unitario: number
  /** Los fijos que SI son costo del producto: CIF de fábrica y mano de obra. */
  costos_fijos_produccion: number
  /** Administración y ventas. */
  gastos_del_periodo: number
  /** En porcentaje (35 = 35%). En 0 no hay impuesto. */
  tasa_impuesto_pct?: number
}

/**
 * Las tres utilidades de un escenario.
 *
 * EL IMPUESTO SOLO SE COBRA SOBRE GANANCIA. Si la utilidad operativa es
 * negativa, el impuesto queda en cero y la neta es igual a la operativa: una
 * empresa que pierde no paga renta, y aplicarle la tasa a un numero negativo
 * daria un "ahorro" fiscal que este modelo no tiene por que inventar.
 */
export function tiposDeUtilidad(e: EntradaTiposUtilidad): TiposDeUtilidad {
  const { unidades: q, precio, costo_variable_unitario: cvu } = e
  const fijosProduccion = e.costos_fijos_produccion
  const gastos = e.gastos_del_periodo
  const tasa = e.tasa_impuesto_pct ?? 0

  const vacio: TiposDeUtilidad = {
    unidades: q,
    ventas: 0,
    costo_ventas: 0,
    utilidad_bruta: 0,
    margen_bruto: 0,
    gastos_periodo: gastos,
    utilidad_operativa: 0,
    margen_operativo: 0,
    tasa_impuesto: tasa,
    impuesto: 0,
    utilidad_neta: 0,
    margen_neto: 0,
    valido: false,
  }

  if (![q, precio, cvu, fijosProduccion, gastos, tasa].every((n) => Number.isFinite(n))) {
    return { ...vacio, problema: 'Alguno de los datos no es un número.' }
  }
  if (q <= 0) {
    return { ...vacio, problema: 'Sin unidades vendidas no hay estado de resultados que armar.' }
  }
  if (precio <= 0) {
    return { ...vacio, problema: 'Sin precio de venta no hay ventas que registrar.' }
  }
  if (tasa < 0 || tasa >= 100) {
    return { ...vacio, problema: 'La tasa de impuesto tiene que estar entre 0% y 100%.' }
  }

  const ventas = q * precio
  const costo_ventas = q * cvu + fijosProduccion
  const utilidad_bruta = ventas - costo_ventas
  const utilidad_operativa = utilidad_bruta - gastos
  // solo se tributa sobre ganancia
  const impuesto = utilidad_operativa > 0 ? (utilidad_operativa * tasa) / 100 : 0
  const utilidad_neta = utilidad_operativa - impuesto

  return {
    unidades: q,
    ventas,
    costo_ventas,
    utilidad_bruta,
    margen_bruto: divSegura(utilidad_bruta, ventas),
    gastos_periodo: gastos,
    utilidad_operativa,
    margen_operativo: divSegura(utilidad_operativa, ventas),
    tasa_impuesto: tasa,
    impuesto,
    utilidad_neta,
    margen_neto: divSegura(utilidad_neta, ventas),
    valido: true,
  }
}

/**
 * Parte los costos fijos en los dos grupos que los tres tipos de utilidad
 * necesitan: los que son COSTO DEL PRODUCTO y los que son GASTO DEL PERIODO.
 *
 * El criterio ya lo decidio el usuario cuando le puso naturaleza a cada
 * categoria de CIF: lo que `basesEquilibrio` marco como 'cif' o 'nomina' es
 * costo de fabrica, y lo marcado 'gasto' es administracion y ventas. Aqui solo
 * se suma, para que la pantalla no tenga que hacerlo.
 */
export function repartoFijos(bases: Pick<BasesEquilibrio, 'lineas_fijas'>): {
  produccion: number
  gastos: number
} {
  let produccion = 0
  let gastos = 0

  for (const l of bases.lineas_fijas) {
    if (l.origen === 'gasto') gastos += l.monto
    else produccion += l.monto
  }

  return { produccion, gastos }
}
// =====================================================================
// 4. DE DONDE SALEN LOS NUMEROS: LA CLASIFICACION FIJO / VARIABLE
// =====================================================================

/*
  EL CRITERIO, en una linea: un costo es FIJO si no cambia cuando cambia el
  volumen, y VARIABLE si cambia en proporcion.

  Quien lo decide, dato por dato:

    CIF            el campo `comportamiento` de su CATEGORIA. El arriendo de
                   la planta es fijo, la energia es variable. Se edita en la
                   pantalla de CIF, categoria por categoria.
    Gastos del
    periodo        los conceptos de CIF cuya categoria NO es de naturaleza
                   'cif' (administracion, ventas, financieros) mas los gastos
                   del modulo comercial. Siguen el mismo `comportamiento` de
                   su categoria; los del modulo comercial no tienen ese campo
                   y se toman como fijos.
    Mano de obra   `mano_obra_fija` del trabajador, y si no esta, su
                   modalidad: mensual = fijo, por hora = variable.

  LO QUE ESTE MODULO NO HACE: no decide si un costo es de produccion o de
  periodo. Eso ya lo decidio la NATURALEZA de la categoria en `cif.ts`, y aqui
  se respeta. Fijo/variable y costo/gasto son dos preguntas distintas: el
  arriendo de la oficina es fijo Y gasto; la energia de la planta es variable
  Y costo del producto. Para el punto de equilibrio los dos entran, porque la
  pregunta es cuanto hay que vender para cubrir TODO.
*/

/** Si el costo de esta persona es fijo. El campo manda; si no esta, la modalidad. */
export function esManoObraFija(trabajador: Pick<Trabajador, 'modalidad' | 'mano_obra_fija'>): boolean {
  return trabajador.mano_obra_fija ?? trabajador.modalidad === 'mensual'
}

export type OrigenFijo = 'cif' | 'gasto' | 'nomina'

export interface LineaCostoFijo {
  concepto: string
  monto: number
  origen: OrigenFijo
  detalle?: string
}

export interface ProductoEquilibrio {
  producto_id: ID
  codigo: string
  nombre: string
  unidad: UnidadMedida
  /** Unidades del periodo: lo terminado, y si la orden sigue abierta, lo programado. */
  unidades: number
  /** Material directo por unidad, de la receta vigente al promedio del Kardex. */
  material_unitario: number
  /** CIF variable del periodo repartido por unidad. */
  cif_variable_unitario: number
  /** Gasto variable del periodo repartido por unidad. */
  gasto_variable_unitario: number
  /** Mano de obra variable del periodo repartida por unidad. */
  mano_obra_variable_unitaria: number
  /** La suma de los cuatro. Es el CVu que entra a las formulas. */
  costo_variable_unitario: number
  /** Precio de referencia del producto, o el sugerido de su hoja de costos. */
  precio: number
  origen_precio: 'referencia' | 'hoja' | 'ninguno'
  /** Lo que no se pudo costear, con el por que. */
  faltantes: string[]
}

export interface BasesEquilibrio {
  periodo: Mes
  /** Unidades de TODOS los productos del periodo. Es el divisor de los pozos variables. */
  unidades_totales: number
  /** La suma de `lineas_fijas`. */
  costos_fijos: number
  lineas_fijas: LineaCostoFijo[]
  /** Los pozos variables del periodo, antes de repartirse por unidad. */
  cif_variable: number
  gasto_variable: number
  mano_obra_variable: number
  productos: ProductoEquilibrio[]
  /** Lo que el usuario tiene que saber antes de creerle a estos numeros. */
  avisos: string[]
}

export interface EntradaEquilibrio {
  periodo: Mes
  conceptos: readonly CIF[]
  categorias: readonly CategoriaCIF[]
  gastos: readonly Gasto[]
  trabajadores: readonly Trabajador[]
  periodosNomina: readonly PeriodoNomina[]
  liquidaciones: readonly Liquidacion[]
  ordenes: readonly OrdenProduccion[]
  productos: readonly Producto[]
  /** La receta vigente de cada producto. */
  recetaPorProducto: Record<ID, Receta>
  /** El costo de cada receta, ya calculado con los promedios de hoy. */
  costosReceta: Record<ID, CostoReceta>
  /** Para sacar un precio cuando el producto no tiene precio de referencia. */
  hojasPorOrden: Record<ID, HojaCostos>
}

/** Las unidades de una orden: lo terminado, y si no cerro, lo programado. */
function unidadesDeOrden(orden: OrdenProduccion): number {
  return orden.cantidad_terminada ?? orden.cantidad_programada
}

/**
 * Arma los tres datos que las formulas necesitan, leyendo lo que el sistema
 * ya calculo. FUNCION PURA.
 *
 * Como se reparten los pozos variables del periodo: por unidad, parejo entre
 * todas las unidades producidas. Es una simplificacion y hay que decirlo: el
 * CIF variable de verdad no se reparte parejo entre productos que consumen
 * distinta energia o distinto tiempo de maquina. Para eso existe la tasa de
 * CIF por base de actividad, que es la que usa la hoja de costos. Aqui el
 * reparto parejo alcanza para la decision, y todos los numeros son editables
 * a mano en la pantalla.
 */
export function basesEquilibrio(e: EntradaEquilibrio): BasesEquilibrio {
  const { periodo } = e
  const avisos: string[] = []
  const lineas_fijas: LineaCostoFijo[] = []

  const categoriaPorId = new Map(e.categorias.map((c) => [c.id, c]))

  // ---------- (A) CIF y gastos registrados en el modulo de CIF ----------
  let cif_variable = 0
  let gasto_variable = 0
  let sin_categoria = 0

  /** Acumula por categoria para no sacar una linea por factura. */
  const fijosPorCategoria = new Map<string, number>()

  for (const c of e.conceptos) {
    if (c.periodo !== periodo) continue
    if (!Number.isFinite(c.monto) || c.monto === 0) continue
    // un presupuesto no es plata causada: el equilibrio se corre sobre lo real
    if (c.presupuestado) continue

    const categoria = categoriaPorId.get(c.categoria_id)
    if (!categoria || !categoria.activa) {
      sin_categoria += c.monto
      continue
    }

    if (categoria.comportamiento === 'variable') {
      if (categoria.naturaleza === 'cif') cif_variable += c.monto
      else gasto_variable += c.monto
      continue
    }

    const clave = `${categoria.naturaleza === 'cif' ? 'cif' : 'gasto'}|${categoria.nombre}`
    fijosPorCategoria.set(clave, (fijosPorCategoria.get(clave) ?? 0) + c.monto)
  }

  for (const [clave, monto] of fijosPorCategoria) {
    const [origen, nombre] = clave.split('|')
    lineas_fijas.push({
      concepto: nombre,
      monto,
      origen: origen === 'cif' ? 'cif' : 'gasto',
      detalle: origen === 'cif' ? 'CIF de categoría fija' : 'Gasto del período, categoría fija',
    })
  }

  if (sin_categoria !== 0) {
    avisos.push(
      `Hay ${sin_categoria.toLocaleString('es-CO')} pesos del período en conceptos cuya categoría no existe o está inactiva: no se pudo saber si son fijos o variables y quedaron por fuera.`,
    )
  }

  // ---------- (B) gastos del modulo comercial ----------
  const gastosDelPeriodo = e.gastos.filter(
    (g) => g.fecha.slice(0, 7) === periodo && g.clasificacion !== 'otro',
  )
  const totalGastos = gastosDelPeriodo.reduce((s, g) => s + g.monto, 0)

  if (totalGastos !== 0) {
    lineas_fijas.push({
      concepto: 'Gastos de administración y ventas',
      monto: totalGastos,
      origen: 'gasto',
      detalle: `${gastosDelPeriodo.length} gasto(s) del módulo comercial, tomados como fijos`,
    })
  }

  // ---------- (C) mano de obra ----------
  const periodosDelMes = new Set(
    e.periodosNomina.filter((p) => p.mes === periodo).map((p) => p.id),
  )
  const trabajadorPorId = new Map(e.trabajadores.map((t) => [t.id, t]))

  let mano_obra_fija = 0
  let mano_obra_variable = 0
  let personasFijas = 0
  let personasVariables = 0

  for (const l of e.liquidaciones) {
    if (!periodosDelMes.has(l.periodo_id)) continue
    const t = trabajadorPorId.get(l.trabajador_id)
    if (!t) continue

    if (esManoObraFija(t)) {
      mano_obra_fija += l.costo_empresa
      personasFijas += 1
    } else {
      mano_obra_variable += l.costo_empresa
      personasVariables += 1
    }
  }

  if (mano_obra_fija !== 0) {
    lineas_fijas.push({
      concepto: 'Mano de obra de costo fijo',
      monto: mano_obra_fija,
      origen: 'nomina',
      detalle: `${personasFijas} persona(s), al costo-empresa de la liquidación`,
    })
  }

  if (mano_obra_fija !== 0 || mano_obra_variable !== 0) {
    avisos.push(
      'La mano de obra entra acá desde la liquidación de nómina. Si además registraste la mano de obra indirecta o la nómina de oficina como un concepto de CIF o como un gasto, ese costo está contado dos veces: bajá la línea a mano.',
    )
  }

  if (personasVariables > 0 && mano_obra_variable > 0) {
    avisos.push(
      `La mano de obra variable (${personasVariables} persona(s) por hora) se reparte pareja entre todas las unidades del período, no por producto.`,
    )
  }

  // ---------- (D) unidades del periodo, por producto ----------
  const ordenesDelMes = e.ordenes.filter(
    (o) => o.estado !== 'anulada' && periodoDeOrden(o) === periodo,
  )

  const unidadesPorProducto = new Map<ID, number>()
  for (const o of ordenesDelMes) {
    unidadesPorProducto.set(o.producto_id, (unidadesPorProducto.get(o.producto_id) ?? 0) + unidadesDeOrden(o))
  }

  const unidades_totales = [...unidadesPorProducto.values()].reduce((s, u) => s + u, 0)

  if (unidades_totales <= 0) {
    avisos.push(
      `El período ${periodo} no tiene unidades producidas: los costos variables del período no se pueden repartir por unidad. Escribí el costo variable unitario a mano.`,
    )
  }

  const cifVariableUnitario = divSegura(cif_variable, unidades_totales)
  const gastoVariableUnitario = divSegura(gasto_variable, unidades_totales)
  const moVariableUnitaria = divSegura(mano_obra_variable, unidades_totales)

  // ---------- (E) el precio y el material de cada producto ----------
  /** El precio sugerido de la hoja de una orden de este producto, si hay. */
  const precioDeHoja = new Map<ID, number>()
  for (const o of ordenesDelMes) {
    const hoja = e.hojasPorOrden[o.id]
    if (hoja?.precio_sugerido != null && hoja.precio_sugerido > 0 && !precioDeHoja.has(o.producto_id)) {
      precioDeHoja.set(o.producto_id, hoja.precio_sugerido)
    }
  }

  const productos: ProductoEquilibrio[] = [...unidadesPorProducto.keys()]
    .map((id) => e.productos.find((p) => p.id === id))
    .filter((p): p is Producto => p != null)
    .map((p) => {
      const faltantes: string[] = []

      const receta = e.recetaPorProducto[p.id]
      const costo = receta ? e.costosReceta[receta.id] : undefined
      const material_unitario = costo?.por_unidad ?? 0

      if (!receta) faltantes.push('No tiene receta vigente: el material por unidad quedó en cero.')
      else if (costo && costo.faltantes.length > 0) {
        faltantes.push(`La receta tiene ${costo.faltantes.length} material(es) sin costear.`)
      }

      const precioRef = p.precio_referencia
      const precioH = precioDeHoja.get(p.id)
      const precio = precioRef != null && precioRef > 0 ? precioRef : (precioH ?? 0)
      const origen_precio: ProductoEquilibrio['origen_precio'] =
        precioRef != null && precioRef > 0 ? 'referencia' : precioH != null ? 'hoja' : 'ninguno'

      if (origen_precio === 'ninguno') {
        faltantes.push('No tiene precio: ponelo a mano o cargalo como precio de referencia del producto.')
      }

      const costo_variable_unitario =
        material_unitario + cifVariableUnitario + gastoVariableUnitario + moVariableUnitaria

      return {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        unidad: p.unidad,
        unidades: unidadesPorProducto.get(p.id) ?? 0,
        material_unitario,
        cif_variable_unitario: cifVariableUnitario,
        gasto_variable_unitario: gastoVariableUnitario,
        mano_obra_variable_unitaria: moVariableUnitaria,
        costo_variable_unitario,
        precio,
        origen_precio,
        faltantes,
      }
    })
    .sort((a, b) => b.unidades - a.unidades)

  return {
    periodo,
    unidades_totales,
    costos_fijos: lineas_fijas.reduce((s, l) => s + l.monto, 0),
    lineas_fijas,
    cif_variable,
    gasto_variable,
    mano_obra_variable,
    productos,
    avisos,
  }
}

// =====================================================================
// 5. LOS SUPUESTOS A MANO
// =====================================================================

export type OrigenDato = 'derivado' | 'manual'

export interface ProductoEscenario extends ProductoEquilibrio {
  /** El CVu que se va a usar: el derivado, o el que escribio la empresa. */
  cvu_usado: number
  origen_cvu: OrigenDato
  precio_usado: number
  origen_precio_usado: OrigenDato
  /** Unidades de este producto en la canasta de la mezcla. */
  mezcla_unidades: number
  origen_mezcla: OrigenDato
}

export interface EscenarioEquilibrio {
  periodo: Mes
  bases: BasesEquilibrio
  /** Los costos fijos que se van a usar. */
  costos_fijos: number
  origen_costos_fijos: OrigenDato
  productos: ProductoEscenario[]
  /** Si algun numero esta puesto a mano. */
  hay_supuestos: boolean
}

/** La fila de supuestos de un producto (o la del periodo con `null`). */
export function supuestoDe(
  supuestos: readonly SupuestoEquilibrio[],
  periodo: Mes,
  productoId: ID | null,
): SupuestoEquilibrio | undefined {
  return supuestos.find((s) => s.periodo === periodo && s.producto_id === productoId)
}

/**
 * Pone los supuestos a mano encima de lo derivado.
 *
 * La regla es una sola: un campo en null se deriva, un campo con numero
 * manda. Nada se mezcla a medias, y cada dato queda marcado con su origen
 * para que la pantalla pueda decirlo.
 */
export function aplicarSupuestos(
  bases: BasesEquilibrio,
  supuestos: readonly SupuestoEquilibrio[],
): EscenarioEquilibrio {
  const delPeriodo = supuestoDe(supuestos, bases.periodo, null)
  const cfManual = delPeriodo?.costos_fijos

  const productos: ProductoEscenario[] = bases.productos.map((p) => {
    const s = supuestoDe(supuestos, bases.periodo, p.producto_id)

    const cvuManual = s?.costo_variable_unitario
    const precioManual = s?.precio_venta
    const mezclaManual = s?.mezcla_unidades

    return {
      ...p,
      cvu_usado: cvuManual != null ? cvuManual : p.costo_variable_unitario,
      origen_cvu: cvuManual != null ? 'manual' : 'derivado',
      precio_usado: precioManual != null ? precioManual : p.precio,
      origen_precio_usado: precioManual != null ? 'manual' : 'derivado',
      mezcla_unidades: mezclaManual != null ? mezclaManual : p.unidades,
      origen_mezcla: mezclaManual != null ? 'manual' : 'derivado',
    }
  })

  return {
    periodo: bases.periodo,
    bases,
    costos_fijos: cfManual != null ? cfManual : bases.costos_fijos,
    origen_costos_fijos: cfManual != null ? 'manual' : 'derivado',
    productos,
    hay_supuestos:
      cfManual != null ||
      productos.some(
        (p) => p.origen_cvu === 'manual' || p.origen_precio_usado === 'manual' || p.origen_mezcla === 'manual',
      ),
  }
}

/** El escenario completo, de los datos crudos a los numeros listos para las formulas. */
export function escenarioEquilibrio(
  e: EntradaEquilibrio,
  supuestos: readonly SupuestoEquilibrio[],
): EscenarioEquilibrio {
  return aplicarSupuestos(basesEquilibrio(e), supuestos)
}
