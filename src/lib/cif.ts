/**
 * EL MOTOR DE CIF. Funciones PURAS: entran los conceptos del periodo y las
 * ordenes, sale la tasa y el importe que le toca a cada orden.
 *
 * ---------------------------------------------------------------------
 * LAS FORMULAS
 *
 *   tasa          = CIF asignables del periodo / nivel de actividad del periodo
 *   CIF de orden  = tasa x nivel de actividad de esa orden
 *
 * La BASE es configurable. Por defecto son las unidades producidas; quedan
 * enganchadas las horas de mano de obra, el costo de mano de obra, el costo de
 * material, el costo primo y las horas maquina.
 *
 * ---------------------------------------------------------------------
 * QUE ES CIF Y QUE NO
 *
 * Lo decide la NATURALEZA de la categoria, no el concepto. Solo
 * `naturaleza: 'cif'` se reparte entre las ordenes; administracion, ventas y
 * financieros se pueden registrar para tenerlos medidos pero son gasto del
 * periodo y no entran a ninguna hoja de costos. El arriendo de la planta es
 * CIF; el de la oficina, no.
 *
 * Tampoco se duplica con la nomina: la mano de obra indirecta llega aqui como
 * un concepto de CIF que el usuario registra (o leyendo
 * `moIndirectaPorPeriodo`), y nunca como horas imputadas a una orden. El muro
 * contra el doble conteo esta en `nomina.ts`.
 *
 * ---------------------------------------------------------------------
 * INCURRIDOS VS APLICADOS
 *
 * `cif_incurrido` es lo real causado. `cif_aplicado` es lo que de verdad se
 * repartio entre las ordenes. La variacion es la diferencia:
 *
 *   positiva -> SUBAPLICADOS   (se cargo al producto menos de lo que costo)
 *   negativa -> SOBREAPLICADOS (se cargo mas de lo que costo)
 *
 * MODELO SIMPLIFICADO: con la tasa calculada sobre los CIF reales del mismo
 * periodo, la variacion da cero por construccion. La variacion solo tiene
 * sentido cuando la tasa viene de un PRESUPUESTO, que es lo que hace el modo
 * `cif_tasa_desde: 'presupuestado'`.
 */

import { divSegura } from './calc'
import type {
  BaseTasaCIF,
  CategoriaCIF,
  CIF,
  CIFOrden,
  ID,
  MaterialesOrden,
  Mes,
  OrdenProduccion,
  ParametrosCalculo,
  Producto,
  Receta,
  TasaCIF,
} from './tipos'
import type { ManoObraOrden } from './tipos'

export const ETIQUETA_BASE: Record<BaseTasaCIF, string> = {
  unidades: 'Unidades producidas',
  horas_mo: 'Horas de mano de obra directa',
  costo_mo: 'Costo de mano de obra directa',
  horas_maquina: 'Horas máquina',
  costo_material: 'Costo de material directo',
  costo_primo: 'Costo primo',
}

/** La unidad en la que se mide cada base, para mostrarla al lado de la tasa. */
export const UNIDAD_BASE: Record<BaseTasaCIF, string> = {
  unidades: 'unidad',
  horas_mo: 'hora MOD',
  costo_mo: '$ de MOD',
  horas_maquina: 'hora máquina',
  costo_material: '$ de material',
  costo_primo: '$ de costo primo',
}

export const ETIQUETA_NATURALEZA: Record<CategoriaCIF['naturaleza'], string> = {
  cif: 'CIF (costo del producto)',
  administracion: 'Administración (gasto del período)',
  ventas: 'Ventas (gasto del período)',
  financiero: 'Financiero (gasto del período)',
}

/** Las bases que se calculan con datos REGISTRADOS, sin estimar nada. */
const BASES_EXACTAS: readonly BaseTasaCIF[] = [
  'unidades',
  'horas_mo',
  'costo_mo',
  'costo_material',
  'costo_primo',
]

/** Si la base se mide en pesos (cambia como se formatea la tasa). */
export function baseEnPesos(base: BaseTasaCIF): boolean {
  return base === 'costo_mo' || base === 'costo_material' || base === 'costo_primo'
}

// =====================================================================
// 1. A QUE PERIODO PERTENECE UNA ORDEN
// =====================================================================

/**
 * El periodo ('YYYY-MM') al que se le cargan los CIF de una orden.
 *
 * Se toma la fecha de CIERRE, y si la orden sigue abierta, la de inicio: los
 * CIF se aplican cuando el producto sale. Una orden que cruza dos meses cae
 * entera en el mes en que termino; es una simplificacion del modelo y se
 * documenta aqui para que nadie la descubra por accidente.
 */
export function periodoDeOrden(orden: OrdenProduccion): Mes {
  const fecha = orden.fecha_fin ?? orden.fecha_inicio
  return fecha.slice(0, 7)
}

/** Las ordenes que cuentan para el reparto: ni anuladas ni sin fecha. */
export function ordenesDelPeriodo(
  ordenes: readonly OrdenProduccion[],
  periodo: Mes,
): OrdenProduccion[] {
  return ordenes.filter((o) => o.estado !== 'anulada' && periodoDeOrden(o) === periodo)
}

// =====================================================================
// 2. EL NIVEL DE ACTIVIDAD
// =====================================================================

/** Lo que el motor necesita saber de cada orden para medir la base. */
export interface ContextoBase {
  materialesPorOrden: Record<ID, MaterialesOrden>
  manoObraPorOrden: Record<ID, ManoObraOrden>
  productos: readonly Producto[]
  recetas: readonly Receta[]
}

/**
 * Cuanto suma una orden a la base elegida.
 *
 * Devuelve tambien si el numero es una ESTIMACION: las horas maquina no se
 * registran en ninguna parte, asi que salen de la receta (horas estandar por
 * lote, escaladas a lo que se produjo). Las demas bases son datos reales.
 */
export function nivelActividadDeOrden(
  orden: OrdenProduccion,
  base: BaseTasaCIF,
  ctx: ContextoBase,
): { valor: number; estimado: boolean } {
  const unidades = orden.cantidad_terminada ?? 0
  const material = ctx.materialesPorOrden[orden.id]?.total ?? 0
  const mo = ctx.manoObraPorOrden[orden.id]

  switch (base) {
    case 'unidades':
      return { valor: unidades, estimado: false }
    case 'horas_mo':
      return { valor: mo?.horas ?? 0, estimado: false }
    case 'costo_mo':
      return { valor: mo?.total ?? 0, estimado: false }
    case 'costo_material':
      return { valor: material, estimado: false }
    case 'costo_primo':
      return { valor: material + (mo?.total ?? 0), estimado: false }
    case 'horas_maquina': {
      // no hay registro de horas maquina: se estima con la receta vigente
      const receta = ctx.recetas.find((r) => r.producto_id === orden.producto_id && r.vigente)
      if (!receta || receta.rendimiento <= 0) return { valor: 0, estimado: true }
      const porUnidad = receta.horas_maquina_estandar / receta.rendimiento
      return { valor: porUnidad * unidades, estimado: true }
    }
  }
}

// =====================================================================
// 3. EL POZO DE CIF DEL PERIODO
// =====================================================================

export interface PozoCIF {
  /** Lo asignable: solo las categorias con naturaleza 'cif'. */
  asignable_real: number
  asignable_presupuestado: number
  /** Lo que se registro pero es gasto del periodo, por naturaleza de la categoria. */
  gastos_del_periodo: number
  /** Las categorias que no existen o estan inactivas y por eso no se pudieron clasificar. */
  sin_categoria: number
}

/**
 * Reparte lo registrado en un periodo entre lo que es CIF de verdad y lo que
 * es gasto.
 *
 * Un concepto cuya categoria no existe o esta inactiva NO se asigna: no se
 * puede saber si es costo o gasto, y adivinarlo seria meter plata al producto
 * sin razon. Queda contado aparte para que se vea.
 */
export function pozoDelPeriodo(
  conceptos: readonly CIF[],
  categorias: readonly CategoriaCIF[],
  periodo: Mes,
): PozoCIF {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const out: PozoCIF = {
    asignable_real: 0,
    asignable_presupuestado: 0,
    gastos_del_periodo: 0,
    sin_categoria: 0,
  }

  for (const c of conceptos) {
    if (c.periodo !== periodo) continue
    if (!Number.isFinite(c.monto) || c.monto === 0) continue

    const categoria = porId.get(c.categoria_id)
    if (!categoria || !categoria.activa) {
      out.sin_categoria += c.monto
      continue
    }
    if (categoria.naturaleza !== 'cif') {
      // solo lo real cuenta como gasto; un presupuesto de gasto no es plata gastada
      if (!c.presupuestado) out.gastos_del_periodo += c.monto
      continue
    }
    if (c.presupuestado) out.asignable_presupuestado += c.monto
    else out.asignable_real += c.monto
  }

  return out
}

// =====================================================================
// 4. LA TASA Y EL REPARTO
// =====================================================================

/**
 * Calcula la tasa de un periodo y reparte los CIF entre sus ordenes.
 *
 * Guarda importante: si el nivel de actividad del periodo es 0, no hay tasa
 * posible. En vez de dividir por cero y propagar Infinity, la tasa queda en 0
 * con `valida: false`, nada se reparte y las hojas de esas ordenes se quedan
 * en borrador diciendo por que.
 */
export function tasaDelPeriodo(
  periodo: Mes,
  conceptos: readonly CIF[],
  categorias: readonly CategoriaCIF[],
  ordenes: readonly OrdenProduccion[],
  parametros: ParametrosCalculo,
  ctx: ContextoBase,
): { tasa: TasaCIF; porOrden: Record<ID, CIFOrden> } {
  const base = parametros.base_cif
  const desde = parametros.cif_tasa_desde ?? 'real'
  const pozo = pozoDelPeriodo(conceptos, categorias, periodo)

  const total_cif = desde === 'presupuestado' ? pozo.asignable_presupuestado : pozo.asignable_real
  const delPeriodo = ordenesDelPeriodo(ordenes, periodo)

  // el nivel de actividad del periodo es la suma del de sus ordenes: asi lo
  // que se reparte y lo que se divide hablan de lo mismo
  let nivel_actividad = 0
  const niveles = new Map<ID, { valor: number; estimado: boolean }>()

  for (const orden of delPeriodo) {
    const n = nivelActividadDeOrden(orden, base, ctx)
    niveles.set(orden.id, n)
    nivel_actividad += n.valor
  }

  const valida = nivel_actividad > 0
  const tasaValor = valida ? divSegura(total_cif, nivel_actividad) : 0

  const porOrden: Record<ID, CIFOrden> = {}
  let cif_aplicado = 0

  for (const orden of delPeriodo) {
    const n = niveles.get(orden.id) ?? { valor: 0, estimado: false }
    const importe = valida ? tasaValor * n.valor : 0
    cif_aplicado += importe

    porOrden[orden.id] = {
      orden_id: orden.id,
      periodo,
      base,
      tasa: tasaValor,
      nivel_actividad: n.valor,
      importe,
      valido: valida,
      estimado: n.estimado,
      nota: !valida
        ? `El período ${periodo} no tiene nivel de actividad en la base «${ETIQUETA_BASE[base].toLowerCase()}»: no hay tasa que repartir.`
        : n.estimado
          ? 'Las horas máquina son una estimación de la receta, no un dato registrado.'
          : undefined,
    }
  }

  const tasa: TasaCIF = {
    periodo,
    base,
    total_cif,
    desde,
    nivel_actividad,
    tasa: tasaValor,
    valida,
    cif_incurrido: pozo.asignable_real,
    cif_aplicado,
    variacion: pozo.asignable_real - cif_aplicado,
    ordenes: delPeriodo.map((o) => o.id),
    gastos_del_periodo: pozo.gastos_del_periodo,
  }

  return { tasa, porOrden }
}

/**
 * Todas las tasas y todo el reparto, de una sola pasada.
 *
 * Los periodos salen de la union de los que tienen conceptos de CIF y los que
 * tienen ordenes: asi una orden de un mes sin CIF registrados igual aparece,
 * con su tasa en cero, y se ve que falta registrar los CIF de ese mes.
 */
export function calcularCIF(
  conceptos: readonly CIF[],
  categorias: readonly CategoriaCIF[],
  ordenes: readonly OrdenProduccion[],
  parametros: ParametrosCalculo,
  ctx: ContextoBase,
): { tasas: TasaCIF[]; porOrden: Record<ID, CIFOrden>; periodos: Mes[] } {
  const periodos = [
    ...new Set([
      ...conceptos.map((c) => c.periodo),
      ...ordenes.filter((o) => o.estado !== 'anulada').map(periodoDeOrden),
    ]),
  ]
    .filter((p) => /^\d{4}-\d{2}$/.test(p))
    .sort()

  const tasas: TasaCIF[] = []
  const porOrden: Record<ID, CIFOrden> = {}

  for (const periodo of periodos) {
    const r = tasaDelPeriodo(periodo, conceptos, categorias, ordenes, parametros, ctx)
    tasas.push(r.tasa)
    Object.assign(porOrden, r.porOrden)
  }

  return { tasas, porOrden, periodos }
}

/** Si la base elegida se mide con datos reales o hay que estimarla. */
export function baseEsExacta(base: BaseTasaCIF): boolean {
  return BASES_EXACTAS.includes(base)
}
