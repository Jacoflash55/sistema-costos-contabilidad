/**
 * EL ESTADO DE RESULTADOS. Funciones PURAS que ARMAN el informe leyendo lo
 * que los otros modulos ya calcularon.
 *
 * ESTE ARCHIVO NO CALCULA NINGUN COSTO, igual que `hoja.ts`. Las ventas y el
 * costo de ventas salen de las hojas de costos; los gastos, de la naturaleza
 * de cada categoria y de la clasificacion de cada trabajador. Aqui solo se
 * agrupa y se resta.
 *
 * ---------------------------------------------------------------------
 * LA ESTRUCTURA
 *
 *   ventas
 *   - costo de ventas                 (material + MOD + CIF aplicado)
 *   = UTILIDAD BRUTA
 *   - gastos de administracion
 *   - gastos de ventas
 *   = UTILIDAD OPERACIONAL
 *   +/- resultado financiero
 *   = UTILIDAD ANTES DE IMPUESTOS
 *   - impuesto de renta
 *   = UTILIDAD NETA
 *
 * DE DONDE SALEN LAS VENTAS. Si hay ventas registradas, mandan esas. Si no,
 * se asume que lo producido se vendio al precio sugerido de la hoja, y el
 * informe lo dice en voz alta: es un SUPUESTO, no un dato, y confundirlo
 * seria presentar como hecho algo que nadie registro.
 *
 * ---------------------------------------------------------------------
 * AVISO ACADEMICO
 *
 * Es la estructura de un estado de resultados para resolver un taller, no un
 * juego completo bajo NIIF. No hay notas, ni comparativo con el periodo
 * anterior, ni conciliacion fiscal.
 */

import { divSegura } from './calc'
import type {
  CategoriaCIF,
  CIF,
  Config,
  Gasto,
  HojaCostos,
  Liquidacion,
  Mes,
  Producto,
  Venta,
} from './tipos'

// =====================================================================
// EL INFORME
// =====================================================================

export interface LineaVenta {
  producto: string
  unidades: number
  precio_unitario: number
  total: number
  /** De una venta registrada, o del precio sugerido de la hoja. */
  origen: 'venta' | 'hoja'
}

export interface EstadoResultados {
  empresa: string
  nit: string
  periodo: Mes

  lineas_ventas: LineaVenta[]
  ventas: number
  /** true cuando nadie registro ventas y se asumio que lo producido se vendio. */
  ventas_supuestas: boolean

  /** El costo de produccion de lo vendido, abierto por elemento. */
  costo_materiales: number
  costo_mano_obra: number
  costo_cif: number
  costo_otros: number
  costo_ventas: number

  utilidad_bruta: number
  margen_bruto: number

  gastos_administracion: number
  gastos_ventas: number
  total_gastos_operacionales: number

  utilidad_operacional: number
  margen_operacional: number

  ingresos_financieros: number
  gastos_financieros: number
  resultado_financiero: number

  utilidad_antes_impuestos: number
  margen_antes_impuestos: number

  tasa_impuesto: number
  impuesto: number

  utilidad_neta: number
  margen_neto: number

  /** Lo que falta para que el informe sea completo. */
  faltantes: string[]
  advertencias: string[]
}

export interface EntradaEstadoResultados {
  config: Config
  periodo: Mes
  /** Las hojas de las ordenes que cayeron en el periodo. */
  hojas: readonly HojaCostos[]
  ventas: readonly Venta[]
  productos: readonly Producto[]
  /** Conceptos de CIF del modulo de CIF: de aqui salen los gastos por naturaleza. */
  conceptos: readonly CIF[]
  categorias: readonly CategoriaCIF[]
  /** Gastos del modulo comercial. */
  gastos: readonly Gasto[]
  /** Liquidaciones del periodo: la nomina de administracion y ventas es gasto. */
  liquidaciones: readonly Liquidacion[]
  /** En porcentaje (35 = 35%). */
  tasa_impuesto_pct?: number
  ingresos_financieros?: number
  /** Los financieros escritos a mano se SUMAN a los que salgan de las categorias. */
  gastos_financieros_extra?: number
}

/**
 * Arma el estado de resultados del periodo.
 *
 * SOLO ENTRAN LAS HOJAS QUE YA TIENEN COSTO. Una hoja incompleta —sin cantidad
 * producida, o sin ningun costo cargado— no se cuenta como venta ni como
 * costo, y se reporta en `faltantes`. Meterla a medias descuadraria el margen
 * sin que se vea por que.
 */
export function estadoResultados(e: EntradaEstadoResultados): EstadoResultados {
  const faltantes: string[] = []
  const advertencias: string[] = []

  const empresa = e.config.empresa.razon_social || e.config.empresa.nombre
  const nit = e.config.empresa.nit

  // ---------- las hojas que sirven ----------
  const utiles = e.hojas.filter((h) => h.completa && h.cantidad_producida > 0)
  const descartadas = e.hojas.length - utiles.length

  if (descartadas > 0) {
    faltantes.push(
      `${descartadas} hoja(s) de costos sin terminar no entraron al informe: les falta cantidad producida o algún costo.`,
    )
  }

  // ---------- (A) ventas ----------
  const nombrePorProducto = new Map(e.productos.map((p) => [p.id, p.nombre]))
  const lineas_ventas: LineaVenta[] = []

  /** Las ventas registradas del periodo, si las hay. */
  const ventasDelPeriodo = e.ventas.filter((v) => v.fecha.slice(0, 7) === e.periodo)
  const hayVentasRegistradas = ventasDelPeriodo.some((v) => v.items.length > 0)

  if (hayVentasRegistradas) {
    for (const v of ventasDelPeriodo) {
      for (const it of v.items) {
        const total = it.cantidad * it.precio_unitario
        if (total === 0) continue
        lineas_ventas.push({
          producto: nombrePorProducto.get(it.producto_id) ?? 'Producto borrado',
          unidades: it.cantidad,
          precio_unitario: it.precio_unitario,
          total,
          origen: 'venta',
        })
      }
      if (v.descuento > 0) {
        lineas_ventas.push({
          producto: `Descuento — ${v.documento || 'sin documento'}`,
          unidades: 0,
          precio_unitario: 0,
          total: -v.descuento,
          origen: 'venta',
        })
      }
    }
  } else {
    for (const h of utiles) {
      const precio = h.precio_sugerido
      if (precio == null || precio <= 0) {
        faltantes.push(
          `${h.producto} (${h.orden_numero}) no tiene precio de venta: esas unidades no se pudieron facturar en el informe.`,
        )
        continue
      }
      lineas_ventas.push({
        producto: h.producto,
        unidades: h.cantidad_producida,
        precio_unitario: precio,
        total: precio * h.cantidad_producida,
        origen: 'hoja',
      })
    }
  }

  const ventas = lineas_ventas.reduce((s, l) => s + l.total, 0)
  const ventas_supuestas = !hayVentasRegistradas && lineas_ventas.length > 0

  if (ventas_supuestas) {
    advertencias.push(
      'No hay ventas registradas. El informe SUPONE que todo lo producido se vendió, al precio sugerido de cada hoja de costos.',
    )
  }

  // ---------- (B) costo de ventas ----------
  /*
    El costo de ventas es el costo de produccion de las ordenes del periodo,
    abierto por elemento. Con el supuesto de que todo lo producido se vende,
    producir y vender son lo mismo y no queda inventario de terminados. Si
    algun dia se registran ventas parciales, la diferencia es inventario y la
    calcula `estadoSituacion`.
  */
  const costo_materiales = utiles.reduce((s, h) => s + h.total_materiales, 0)
  const costo_mano_obra = utiles.reduce((s, h) => s + h.total_mano_obra, 0)
  const costo_cif = utiles.reduce((s, h) => s + h.total_cif, 0)
  const costo_otros = utiles.reduce((s, h) => s + h.total_otros, 0)
  const costo_ventas = costo_materiales + costo_mano_obra + costo_cif + costo_otros

  const utilidad_bruta = ventas - costo_ventas

  // ---------- (C) gastos operacionales ----------
  /*
    Tres fuentes distintas, sin solaparse:
      1. conceptos de CIF cuya CATEGORIA es de administracion o ventas
      2. gastos del modulo comercial
      3. la nomina de los trabajadores clasificados administracion o ventas
    Cada peso sale por una sola via, igual que en el resto del sistema.
  */
  const categoriaPorId = new Map(e.categorias.map((c) => [c.id, c]))

  let gastos_administracion = 0
  let gastos_ventas = 0
  let financierosDeCategorias = 0

  for (const c of e.conceptos) {
    if (c.periodo !== e.periodo || c.presupuestado) continue
    const cat = categoriaPorId.get(c.categoria_id)
    if (!cat || !cat.activa) continue

    if (cat.naturaleza === 'administracion') gastos_administracion += c.monto
    else if (cat.naturaleza === 'ventas') gastos_ventas += c.monto
    else if (cat.naturaleza === 'financiero') financierosDeCategorias += c.monto
  }

  for (const g of e.gastos) {
    if (g.fecha.slice(0, 7) !== e.periodo) continue
    if (g.clasificacion === 'administracion') gastos_administracion += g.monto
    else if (g.clasificacion === 'ventas') gastos_ventas += g.monto
    else if (g.clasificacion === 'financiero') financierosDeCategorias += g.monto
  }

  for (const l of e.liquidaciones) {
    if (l.clasificacion === 'administracion') gastos_administracion += l.costo_empresa
    else if (l.clasificacion === 'ventas') gastos_ventas += l.costo_empresa
  }

  const total_gastos_operacionales = gastos_administracion + gastos_ventas
  const utilidad_operacional = utilidad_bruta - total_gastos_operacionales

  // ---------- (D) resultado financiero e impuesto ----------
  const ingresos_financieros = Math.max(0, e.ingresos_financieros ?? 0)
  const gastos_financieros = financierosDeCategorias + Math.max(0, e.gastos_financieros_extra ?? 0)
  const resultado_financiero = ingresos_financieros - gastos_financieros

  const utilidad_antes_impuestos = utilidad_operacional + resultado_financiero

  const tasa = e.tasa_impuesto_pct ?? 0
  const tasaValida = Number.isFinite(tasa) && tasa >= 0 && tasa < 100
  if (!tasaValida) {
    advertencias.push('La tasa de impuesto tiene que estar entre 0% y 100%: se tomó como 0.')
  }
  const tasa_impuesto = tasaValida ? tasa : 0

  // solo se tributa sobre ganancia
  const impuesto = utilidad_antes_impuestos > 0 ? (utilidad_antes_impuestos * tasa_impuesto) / 100 : 0
  const utilidad_neta = utilidad_antes_impuestos - impuesto

  if (utiles.length === 0) {
    faltantes.push('No hay ninguna hoja de costos terminada en este período: el informe está vacío.')
  }

  return {
    empresa,
    nit,
    periodo: e.periodo,

    lineas_ventas,
    ventas,
    ventas_supuestas,

    costo_materiales,
    costo_mano_obra,
    costo_cif,
    costo_otros,
    costo_ventas,

    utilidad_bruta,
    margen_bruto: divSegura(utilidad_bruta, ventas),

    gastos_administracion,
    gastos_ventas,
    total_gastos_operacionales,

    utilidad_operacional,
    margen_operacional: divSegura(utilidad_operacional, ventas),

    ingresos_financieros,
    gastos_financieros,
    resultado_financiero,

    utilidad_antes_impuestos,
    margen_antes_impuestos: divSegura(utilidad_antes_impuestos, ventas),

    tasa_impuesto,
    impuesto,

    utilidad_neta,
    margen_neto: divSegura(utilidad_neta, ventas),

    faltantes,
    advertencias,
  }
}

