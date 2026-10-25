/**
 * LOS DOS ESTADOS FINANCIEROS. Funciones PURAS que ARMAN los informes leyendo
 * lo que los otros modulos ya calcularon.
 *
 * ESTE ARCHIVO NO CALCULA NINGUN COSTO, igual que `hoja.ts`. Las ventas y el
 * costo de ventas salen de las hojas de costos; el inventario, del Kardex; los
 * gastos, de la naturaleza de cada categoria y de la clasificacion de cada
 * trabajador. Aqui solo se agrupa y se resta.
 *
 * ---------------------------------------------------------------------
 * EL ESTADO DE RESULTADOS
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
 * informe lo dice en voz alta: es un SUPUESTO, no un dato, y confundirlo seria
 * presentar como hecho algo que nadie registro.
 *
 * ---------------------------------------------------------------------
 * EL ESTADO DE SITUACION FINANCIERA
 *
 * Es MIXTO y no puede ser otra cosa: este sistema es de costos, no de
 * contabilidad completa. Sabe cuanto vale el inventario y cuanta utilidad dio
 * el periodo, porque eso lo calculo el. No sabe cuanta plata hay en el banco
 * ni cuanto se debe, porque nadie se lo dijo nunca.
 *
 * Entonces: lo que el sistema sabe se autollena y se marca como DERIVADO; lo
 * demas son campos que la persona escribe, marcados MANUAL. Y al final se
 * verifica la ecuacion contable:
 *
 *   ACTIVO = PASIVO + PATRIMONIO
 *
 * Si no cuadra, se muestra el descuadre. NUNCA se ajusta solo para que cierre:
 * un balance que cuadra a la fuerza esconde justamente el error que habia que
 * encontrar.
 *
 * ---------------------------------------------------------------------
 * AVISO ACADEMICO
 *
 * Es la estructura de un estado financiero para resolver un taller, no un
 * juego completo bajo NIIF. No hay notas, ni comparativo con el periodo
 * anterior, ni estado de flujos de efectivo, ni conciliacion fiscal.
 */

import { divSegura } from './calc'
import type {
  CategoriaCIF,
  CIF,
  Config,
  Gasto,
  HojaCostos,
  ID,
  Liquidacion,
  Mes,
  Producto,
  Venta,
} from './tipos'

// =====================================================================
// 1. ESTADO DE RESULTADOS
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

// =====================================================================
// 2. ESTADO DE SITUACION FINANCIERA
// =====================================================================

export type GrupoBalance =
  | 'activo_corriente'
  | 'activo_no_corriente'
  | 'pasivo_corriente'
  | 'pasivo_no_corriente'
  | 'patrimonio'

export const ETIQUETA_GRUPO_BALANCE: Record<GrupoBalance, string> = {
  activo_corriente: 'Activo corriente',
  activo_no_corriente: 'Activo no corriente',
  pasivo_corriente: 'Pasivo corriente',
  pasivo_no_corriente: 'Pasivo no corriente',
  patrimonio: 'Patrimonio',
}

export interface DefinicionCuenta {
  id: string
  nombre: string
  grupo: GrupoBalance
  /** true cuando el sistema la calcula y no se puede escribir encima. */
  derivada: boolean
  /** true cuando RESTA dentro de su grupo (depreciación acumulada). */
  resta?: boolean
  ayuda?: string
}

/**
 * EL CATALOGO DE CUENTAS, fijo a proposito.
 *
 * Es el minimo que un taller pide y nada mas. Dejarlo cerrado tiene una
 * ventaja concreta: el informe siempre se ve igual y se puede comparar entre
 * periodos. Si hiciera falta una cuenta mas, se agrega aca y aparece sola en
 * la pantalla.
 */
export const CUENTAS_BALANCE: readonly DefinicionCuenta[] = [
  {
    id: 'efectivo',
    nombre: 'Efectivo y equivalentes',
    grupo: 'activo_corriente',
    derivada: false,
    ayuda: 'Caja y bancos.',
  },
  {
    id: 'cuentas_por_cobrar',
    nombre: 'Cuentas por cobrar',
    grupo: 'activo_corriente',
    derivada: false,
    ayuda: 'Lo que los clientes deben.',
  },
  {
    id: 'inv_materias_primas',
    nombre: 'Inventario de materias primas',
    grupo: 'activo_corriente',
    derivada: true,
    ayuda: 'Saldo valorizado del Kardex.',
  },
  {
    id: 'inv_producto_proceso',
    nombre: 'Inventario de producto en proceso',
    grupo: 'activo_corriente',
    derivada: true,
    ayuda: 'Costo acumulado de las órdenes que no han terminado.',
  },
  {
    id: 'inv_producto_terminado',
    nombre: 'Inventario de producto terminado',
    grupo: 'activo_corriente',
    derivada: true,
    ayuda: 'Lo producido que todavía no se vendió.',
  },

  {
    id: 'ppe',
    nombre: 'Propiedad, planta y equipo',
    grupo: 'activo_no_corriente',
    derivada: false,
    ayuda: 'Maquinaria, muebles, edificios: al costo.',
  },
  {
    id: 'depreciacion_acumulada',
    nombre: 'Depreciación acumulada',
    grupo: 'activo_no_corriente',
    derivada: false,
    resta: true,
    ayuda: 'Escribila en positivo: el informe la resta sola.',
  },

  {
    id: 'cuentas_por_pagar',
    nombre: 'Cuentas por pagar',
    grupo: 'pasivo_corriente',
    derivada: false,
    ayuda: 'Lo que se le debe a proveedores.',
  },
  {
    id: 'obligaciones_laborales',
    nombre: 'Obligaciones laborales',
    grupo: 'pasivo_corriente',
    derivada: false,
    ayuda: 'Salarios, prestaciones y aportes por pagar.',
  },
  {
    id: 'impuestos_por_pagar',
    nombre: 'Impuestos por pagar',
    grupo: 'pasivo_corriente',
    derivada: false,
    ayuda: 'El impuesto del estado de resultados, si no se ha pagado.',
  },

  {
    id: 'obligaciones_financieras',
    nombre: 'Obligaciones financieras',
    grupo: 'pasivo_no_corriente',
    derivada: false,
    ayuda: 'Créditos a más de un año.',
  },

  {
    id: 'capital',
    nombre: 'Capital social',
    grupo: 'patrimonio',
    derivada: false,
    ayuda: 'Lo que pusieron los socios.',
  },
  {
    id: 'utilidades_retenidas',
    nombre: 'Utilidades retenidas',
    grupo: 'patrimonio',
    derivada: false,
    ayuda: 'Las utilidades de períodos anteriores que no se repartieron.',
  },
  {
    id: 'utilidad_ejercicio',
    nombre: 'Utilidad del ejercicio',
    grupo: 'patrimonio',
    derivada: true,
    ayuda: 'La utilidad neta del estado de resultados.',
  },
]

export interface CuentaBalance extends DefinicionCuenta {
  monto: number
  origen: 'derivado' | 'manual'
}

export interface EstadoSituacion {
  empresa: string
  nit: string
  periodo: Mes

  cuentas: CuentaBalance[]

  activo_corriente: number
  activo_no_corriente: number
  total_activo: number

  pasivo_corriente: number
  pasivo_no_corriente: number
  total_pasivo: number

  patrimonio: number
  total_pasivo_patrimonio: number

  /** Activo - (Pasivo + Patrimonio). En cero, cuadra. */
  descuadre: number
  cuadra: boolean

  advertencias: string[]
}

export interface EntradaEstadoSituacion {
  config: Config
  periodo: Mes
  /** Saldo valorizado del Kardex. */
  valor_inventario: number
  /** Costo acumulado de las ordenes que siguen abiertas. */
  producto_en_proceso: number
  /** Costo de lo producido que todavia no se vendio. */
  producto_terminado: number
  /** La utilidad neta del estado de resultados del mismo periodo. */
  utilidad_ejercicio: number
  /** Lo que la persona escribio, por id de cuenta. */
  manuales: Readonly<Record<string, number>>
}

/** Medio centavo: por debajo de eso, el descuadre es ruido de coma flotante. */
const TOLERANCIA = 0.005

/**
 * Arma el balance y verifica la ecuacion contable.
 *
 * NO FUERZA EL CUADRE. Si el activo no coincide con pasivo mas patrimonio, el
 * informe lo dice y muestra por cuanto. Un balance que cuadra solo porque el
 * sistema metio la diferencia en alguna cuenta es peor que uno que no cuadra:
 * el segundo avisa que hay algo mal, el primero lo esconde.
 */
export function estadoSituacion(e: EntradaEstadoSituacion): EstadoSituacion {
  const advertencias: string[] = []

  const derivados: Record<string, number> = {
    inv_materias_primas: e.valor_inventario,
    inv_producto_proceso: e.producto_en_proceso,
    inv_producto_terminado: e.producto_terminado,
    utilidad_ejercicio: e.utilidad_ejercicio,
  }

  const cuentas: CuentaBalance[] = CUENTAS_BALANCE.map((d) => {
    const valor = d.derivada ? (derivados[d.id] ?? 0) : (e.manuales[d.id] ?? 0)
    const monto = Number.isFinite(valor) ? valor : 0
    return { ...d, monto, origen: d.derivada ? 'derivado' : 'manual' }
  })

  /** Suma un grupo respetando las cuentas que restan. */
  const suma = (g: GrupoBalance) =>
    cuentas
      .filter((c) => c.grupo === g)
      .reduce((s, c) => s + (c.resta ? -c.monto : c.monto), 0)

  const activo_corriente = suma('activo_corriente')
  const activo_no_corriente = suma('activo_no_corriente')
  const total_activo = activo_corriente + activo_no_corriente

  const pasivo_corriente = suma('pasivo_corriente')
  const pasivo_no_corriente = suma('pasivo_no_corriente')
  const total_pasivo = pasivo_corriente + pasivo_no_corriente

  const patrimonio = suma('patrimonio')
  const total_pasivo_patrimonio = total_pasivo + patrimonio

  const descuadre = total_activo - total_pasivo_patrimonio
  const cuadra = Math.abs(descuadre) < TOLERANCIA

  const sinLlenar = cuentas.filter((c) => !c.derivada && c.monto === 0).length
  if (sinLlenar === cuentas.filter((c) => !c.derivada).length) {
    advertencias.push(
      'Todavía no escribiste ninguna cuenta: el balance solo muestra lo que el sistema deriva del Kardex y de la utilidad del período.',
    )
  }

  if (!cuadra) {
    advertencias.push(
      descuadre > 0
        ? 'El activo es mayor que pasivo más patrimonio: falta registrar una deuda o aporte.'
        : 'Pasivo más patrimonio es mayor que el activo: falta registrar un bien o sobra una deuda.',
    )
  }

  return {
    empresa: e.config.empresa.razon_social || e.config.empresa.nombre,
    nit: e.config.empresa.nit,
    periodo: e.periodo,

    cuentas,

    activo_corriente,
    activo_no_corriente,
    total_activo,

    pasivo_corriente,
    pasivo_no_corriente,
    total_pasivo,

    patrimonio,
    total_pasivo_patrimonio,

    descuadre,
    cuadra,

    advertencias,
  }
}

// =====================================================================
// 3. LO QUE EL BALANCE NECESITA DE PRODUCCION
// =====================================================================

/**
 * Parte el costo de las ordenes en inventario de PROCESO y de TERMINADO.
 *
 *   en proceso  = ordenes que todavia no terminaron
 *   terminado   = lo producido que no se vendio
 *
 * Con el supuesto de que todo lo producido se vende, el terminado da cero y
 * eso es correcto, no un error: si se vendio todo, no queda nada en bodega.
 */
export function inventariosDeProduccion(
  hojas: readonly HojaCostos[],
  unidadesVendidasPorProducto: Readonly<Record<ID, number>> = {},
  hayVentasRegistradas = false,
): { en_proceso: number; terminado: number } {
  let en_proceso = 0
  let terminado = 0

  /** Cuantas unidades de cada producto quedan por vender, mientras se recorre. */
  const porVender: Record<string, number> = {}
  for (const h of hojas) {
    if (h.estado_orden === 'terminada') {
      porVender[h.producto_codigo] = (porVender[h.producto_codigo] ?? 0) + h.cantidad_producida
    }
  }

  for (const h of hojas) {
    if (h.estado_orden === 'anulada') continue

    if (h.estado_orden !== 'terminada') {
      en_proceso += h.costo_total
      continue
    }

    if (!hayVentasRegistradas) continue // se vendio todo: no queda terminado

    const vendidas = unidadesVendidasPorProducto[h.producto_codigo] ?? 0
    const disponibles = porVender[h.producto_codigo] ?? 0
    const sinVender = Math.max(0, disponibles - vendidas)
    // se valora al costo unitario de esta hoja
    terminado += Math.min(sinVender, h.cantidad_producida) * h.costo_unitario
  }

  return { en_proceso, terminado }
}
