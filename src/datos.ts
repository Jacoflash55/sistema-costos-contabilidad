/*
  LOS DATOS. Semillas, persistencia y el calculo completo.

  Mismo reparto en tres archivos que `sistema-jacobo`, y por la misma razon
  (React Fast Refresh no puede refrescar un modulo que exporta un componente Y
  otras cosas):

    datos.ts     semillas + `calcularTodo`   <- este archivo, sin React
    contexto.ts  createContext + useEstado
    estado.tsx   UN solo componente: <ProveedorEstado>

  Los JSON de `data/` se IMPORTAN, no se piden con fetch: Vite los mete dentro
  del bundle, asi que la app no hace ninguna peticion en tiempo de ejecucion y
  funciona sin servidor.
*/

import cifJson from '../data/cif.json'
import comercialJson from '../data/comercial.json'
import configJson from '../data/config.json'
import inventarioJson from '../data/inventario.json'
import nominaJson from '../data/nomina.json'
import produccionJson from '../data/produccion.json'

import { calcularCIF, periodoDeOrden } from './lib/cif'
import { armarHoja } from './lib/hoja'
import { construirTarjetas, costoReceta, materialesDeOrdenes, metodoEfectivo } from './lib/kardex'
import {
  cuadreHorasDirectas,
  gastosDeNominaDelPeriodo,
  liquidarPeriodo,
  manoObraIndirectaDelPeriodo,
  manoObraPorOrden,
  resumenNomina,
} from './lib/nomina'
import type {
  AlertaKardex,
  AlertaNomina,
  CIFOrden,
  Config,
  CostoReceta,
  DatosCIF,
  DatosComercial,
  DatosCrudos,
  DatosInventario,
  DatosNomina,
  DatosProduccion,
  HojaCostos,
  ID,
  Liquidacion,
  Mes,
  Receta,
  Respaldo,
  ResumenNomina,
} from './lib/tipos'

// ---------------------------------------------------------------------
// Semillas
// ---------------------------------------------------------------------

export const CONFIG_BASE = configJson as unknown as Config
export const NOMINA_BASE = nominaJson as unknown as DatosNomina
export const INVENTARIO_BASE = inventarioJson as unknown as DatosInventario
export const PRODUCCION_BASE = produccionJson as unknown as DatosProduccion
export const CIF_BASE = cifJson as unknown as DatosCIF
export const COMERCIAL_BASE = comercialJson as unknown as DatosComercial

/**
 * Version del formato de los datos. Sube cuando un cambio rompe los respaldos
 * viejos, para poder rechazarlos o migrarlos en vez de cargar basura.
 */
export const VERSION_DATOS = CONFIG_BASE.version

/** Los valores de fabrica: para el boton de Reiniciar y para comparar. */
export const DATOS_DE_FABRICA: DatosCrudos = {
  config: CONFIG_BASE,
  nomina: NOMINA_BASE,
  inventario: INVENTARIO_BASE,
  produccion: PRODUCCION_BASE,
  cif: CIF_BASE,
  comercial: COMERCIAL_BASE,
}

/*
  La persistencia vive en `lib/almacenamiento.ts` (claves `costos:*`). Se
  re-exporta desde aqui para que el resto de la app tenga un solo sitio de
  donde importar los datos, igual que en la referencia.
*/
export { CLAVES, borrar, guardar, hayDatosGuardados, leer } from './lib/almacenamiento'

// ---------------------------------------------------------------------
// Respaldo: exportar e importar TODO el estado
// ---------------------------------------------------------------------

/** Arma el objeto que se baja como archivo JSON. */
export function armarRespaldo(datos: DatosCrudos, ahora: string = new Date().toISOString()): Respaldo {
  return {
    app: 'sistema-costos',
    version: VERSION_DATOS,
    exportado: ahora,
    ...datos,
  }
}

export type ResultadoImportar =
  | { ok: true; datos: DatosCrudos; avisos: string[] }
  | { ok: false; error: string }

/** Una rebanada que llega del archivo, antes de validarla. */
type Crudo = Record<string, unknown>

function esObjeto(v: unknown): v is Crudo {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Toma una rebanada del archivo y devuelve una buena: las listas que vengan
 * bien se respetan, las que falten o vengan rotas se reemplazan por la de
 * fabrica y se deja un aviso.
 *
 * Se prefiere esto a rechazar el archivo entero: un respaldo al que le falta
 * un modulo nuevo sigue siendo util.
 */
function rebanada<T extends object>(valor: unknown, fabrica: T, nombre: string, avisos: string[]): T {
  if (!esObjeto(valor)) {
    avisos.push(`Falta el módulo «${nombre}»: quedó en los datos de fábrica.`)
    return fabrica
  }
  const out = { ...fabrica } as Record<string, unknown>
  for (const clave of Object.keys(fabrica)) {
    const v = valor[clave]
    if (Array.isArray(v)) out[clave] = v
    else avisos.push(`«${nombre}.${clave}» no es una lista: quedó vacío.`)
  }
  return out as T
}

/**
 * Lee el texto de un archivo de respaldo. FUNCION PURA: no toca el navegador,
 * asi que se puede probar sin montar nada.
 */
export function leerRespaldo(texto: string): ResultadoImportar {
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' }
  }

  if (!esObjeto(json)) return { ok: false, error: 'El archivo no tiene la forma de un respaldo.' }

  // La marca de agua evita importar cualquier JSON que ande por ahi, por
  // ejemplo un respaldo de `sistema-jacobo`.
  if (json.app !== 'sistema-costos') {
    return { ok: false, error: 'Ese archivo no es un respaldo de este sistema.' }
  }

  const version = typeof json.version === 'number' ? json.version : 0
  if (version > VERSION_DATOS) {
    return {
      ok: false,
      error: `El respaldo es de una versión más nueva (${version}) que esta app (${VERSION_DATOS}).`,
    }
  }

  const avisos: string[] = []

  const config = esObjeto(json.config)
    ? ({
        version: VERSION_DATOS,
        empresa: { ...CONFIG_BASE.empresa, ...(esObjeto(json.config.empresa) ? json.config.empresa : {}) },
        parametros: {
          ...CONFIG_BASE.parametros,
          ...(esObjeto(json.config.parametros) ? json.config.parametros : {}),
          recargos: {
            ...CONFIG_BASE.parametros.recargos,
            ...(esObjeto(json.config.parametros) && esObjeto(json.config.parametros.recargos)
              ? json.config.parametros.recargos
              : {}),
          },
        },
      } as Config)
    : CONFIG_BASE

  if (!esObjeto(json.config)) avisos.push('Falta la configuración: quedó la de fábrica.')

  return {
    ok: true,
    avisos,
    datos: {
      config,
      nomina: rebanada(json.nomina, NOMINA_BASE, 'nómina', avisos),
      inventario: rebanada(json.inventario, INVENTARIO_BASE, 'inventario', avisos),
      produccion: rebanada(json.produccion, PRODUCCION_BASE, 'producción', avisos),
      cif: rebanada(json.cif, CIF_BASE, 'CIF', avisos),
      comercial: rebanada(json.comercial, COMERCIAL_BASE, 'comercial', avisos),
    },
  }
}

// ---------------------------------------------------------------------
// El calculo completo
// ---------------------------------------------------------------------

/**
 * UNA SOLA funcion pura: entran todos los datos crudos, sale todo lo que las
 * paginas necesitan mostrar. La UI nunca calcula nada por su cuenta.
 *
 * Lo que ya esta: materiales e inventario (Kardex por promedio ponderado,
 * costo de las recetas y material directo por orden) y nomina (liquidacion
 * por periodo y mano de obra directa por orden). Lo que falta:
 *
 *   tasasCIF       tasa de CIF por base de actividad
 *   hojas          hojas de costos por orden
 *
 * `fechaHoy` se inyecta en vez de leer el reloj adentro, para que el dia en
 * que se corran los tests no cambie el resultado.
 */
export function calcularTodo(datos: DatosCrudos, fechaHoy: string = hoy()) {
  const { config, nomina, inventario, produccion, cif, comercial } = datos

  /*
    INVENTARIO. Un solo recorrido del Kardex alimenta todo lo demas: las
    existencias que se ven en las tablas, el costo de las recetas y el
    material directo de cada orden. El metodo sale de la configuracion.
  */
  const metodoPedido = config.parametros.metodo_inventario
  const metodoInventario = metodoEfectivo(metodoPedido)

  const { tarjetas, alertas: alertasKardex } = construirTarjetas(
    inventario.materias_primas,
    inventario.movimientos,
    produccion.consumos,
    { metodo: metodoInventario },
  )

  /** Valor total del inventario de materias primas: suma de cantidad x promedio. */
  const valorInventario = Object.values(tarjetas).reduce((s, t) => s + t.saldo_total, 0)

  /** Materiales activos por debajo de su stock minimo. */
  const bajoMinimo = inventario.materias_primas.filter(
    (m) => m.activo && m.stock_minimo > 0 && (tarjetas[m.id]?.saldo_cantidad ?? 0) < m.stock_minimo,
  )

  /*
    PRODUCCION. El costo de material directo de cada orden sale de las filas
    del Kardex, no de un calculo aparte: es el promedio vigente en el momento
    de cada salida.
  */
  const materialesPorOrden = materialesDeOrdenes(
    produccion.ordenes,
    produccion.consumos,
    inventario.materias_primas,
    tarjetas,
  )

  /** La receta vigente de cada producto, indexada para no filtrar en cada pagina. */
  const recetaPorProducto: Record<ID, Receta> = {}
  for (const r of produccion.recetas) {
    if (r.vigente) recetaPorProducto[r.producto_id] = r
  }

  /** El costo estimado de cada receta, con los costos de hoy. */
  const costosReceta: Record<ID, CostoReceta> = {}
  for (const r of produccion.recetas) {
    costosReceta[r.id] = costoReceta(r, inventario.materias_primas, tarjetas)
  }

  /*
    NOMINA. Se liquida cada periodo completo: con el volumen de una pequena
    empresa es barato y asi la pantalla puede saltar de periodo a periodo sin
    recalcular nada.
  */
  const liquidacionesPorPeriodo: Record<ID, Liquidacion[]> = {}
  const resumenesNomina: Record<ID, ResumenNomina> = {}
  const moIndirectaPorPeriodo: Record<ID, number> = {}
  const gastosNominaPorPeriodo: Record<ID, { administracion: number; ventas: number }> = {}

  for (const periodo of nomina.periodos) {
    const liqs = liquidarPeriodo(
      nomina.trabajadores,
      periodo,
      nomina.registros_horas,
      nomina.novedades,
      nomina.conceptos,
      config.parametros,
    )
    liquidacionesPorPeriodo[periodo.id] = liqs
    resumenesNomina[periodo.id] = resumenNomina(periodo.id, liqs)
    moIndirectaPorPeriodo[periodo.id] = manoObraIndirectaDelPeriodo(liqs)
    gastosNominaPorPeriodo[periodo.id] = gastosDeNominaDelPeriodo(liqs)
  }

  const liquidaciones = Object.values(liquidacionesPorPeriodo).flat()

  /*
    LA MANO DE OBRA DIRECTA DE CADA ORDEN. Solo la clasificacion 'directa'
    entra aqui; si alguien imputa horas de un indirecto, el motor lo deja por
    fuera y lo reporta. Es la mitad del muro contra el doble conteo: la otra
    mitad es que lo indirecto sale por `moIndirectaPorPeriodo`, que es el
    insumo del modulo de CIF.
  */
  const { porOrden: manoObraPorOrdenCalc, alertas: alertasMO } = manoObraPorOrden(
    produccion.ordenes,
    produccion.asignaciones_mo,
    nomina.trabajadores,
    config.parametros,
  )

  /** Horas pagadas vs. horas imputadas de los directos: el tiempo ocioso, medido. */
  const cuadreMO = cuadreHorasDirectas(
    liquidaciones,
    produccion.asignaciones_mo,
    nomina.trabajadores,
  )

  const alertasNomina: AlertaNomina[] = [...alertasMO, ...cuadreMO.alertas]

  /*
    CIF. La tasa de cada periodo y el importe que le toca a cada orden.

    El contexto que recibe el motor son los derivados que ya estan calculados
    arriba: por eso la base puede ser unidades, horas de MOD, costo de MOD,
    costo de material o costo primo sin recalcular nada.
  */
  const contextoBase = {
    materialesPorOrden,
    manoObraPorOrden: manoObraPorOrdenCalc,
    productos: produccion.productos,
    recetas: produccion.recetas,
  }

  const {
    tasas: tasasCIF,
    porOrden: cifPorOrden,
    periodos: periodosCIF,
  } = calcularCIF(cif.cif, cif.categorias, produccion.ordenes, config.parametros, contextoBase)

  /** La tasa de cada periodo, indexada. */
  const tasaPorPeriodo: Record<Mes, (typeof tasasCIF)[number]> = {}
  for (const t of tasasCIF) tasaPorPeriodo[t.periodo] = t

  /*
    LAS HOJAS DE COSTOS. Aqui se cierra el circuito: cada hoja integra el
    material del Kardex, la mano de obra de la nomina, los CIF de la tasa del
    periodo y los otros directos. Nada se escribe a mano.

    Una hoja finalizada devuelve su foto congelada; una en borrador se vuelve a
    armar con los datos de hoy.
  */
  const clientePorId = new Map(comercial.clientes.map((c) => [c.id, c]))
  const productoPorId = new Map(produccion.productos.map((p) => [p.id, p]))
  const ordenPorId = new Map(produccion.ordenes.map((o) => [o.id, o]))

  const hojasPorOrden: Record<ID, HojaCostos> = {}
  const hojas: HojaCostos[] = []

  for (const registro of produccion.hojas) {
    const orden = ordenPorId.get(registro.orden_id)
    if (!orden) continue // hoja de una orden borrada

    const hoja = armarHoja({
      registro,
      orden,
      producto: productoPorId.get(orden.producto_id),
      cliente: orden.cliente_id ? clientePorId.get(orden.cliente_id) : undefined,
      materiales: materialesPorOrden[orden.id],
      manoObra: manoObraPorOrdenCalc[orden.id],
      cif: cifPorOrden[orden.id],
      otros: produccion.otros_directos.filter((o) => o.orden_id === orden.id),
      config,
    })

    hojasPorOrden[orden.id] = hoja
    hojas.push(hoja)
  }

  /** Otros costos directos por orden, para la pantalla de la orden. */
  const otrosPorOrden: Record<ID, number> = {}
  for (const o of produccion.otros_directos) {
    otrosPorOrden[o.orden_id] = (otrosPorOrden[o.orden_id] ?? 0) + o.monto
  }

  /** En que periodo de CIF cae cada orden. Se deriva de su fecha de cierre. */
  const periodoPorOrden: Record<ID, Mes> = {}
  for (const o of produccion.ordenes) periodoPorOrden[o.id] = periodoDeOrden(o)

  /** Cuantas filas hay de cada cosa. Para los encabezados y el estado del sistema. */
  const conteos = {
    trabajadores: nomina.trabajadores.length,
    trabajadoresActivos: nomina.trabajadores.filter((t) => t.activo).length,
    periodosNomina: nomina.periodos.length,
    registrosHoras: nomina.registros_horas.length,
    novedades: nomina.novedades.length,
    conceptos: nomina.conceptos.length,
    trabajadoresDirectos: nomina.trabajadores.filter((t) => t.activo && t.clasificacion === 'directa')
      .length,
    materiasPrimas: inventario.materias_primas.length,
    compras: inventario.compras.length,
    movimientos: inventario.movimientos.length,
    productos: produccion.productos.length,
    recetas: produccion.recetas.length,
    ordenes: produccion.ordenes.length,
    ordenesAbiertas: produccion.ordenes.filter((o) => o.estado !== 'terminada' && o.estado !== 'anulada')
      .length,
    consumos: produccion.consumos.length,
    asignacionesMO: produccion.asignaciones_mo.length,
    cif: cif.cif.length,
    categoriasCIF: cif.categorias.length,
    otrosDirectos: produccion.otros_directos.length,
    hojas: produccion.hojas.length,
    hojasFinalizadas: produccion.hojas.filter((h) => h.estado === 'finalizada').length,
    clientes: comercial.clientes.length,
    ventas: comercial.ventas.length,
    gastos: comercial.gastos.length,
  }

  return {
    // los crudos, para que la UI no tenga que pedirlos por separado
    config,
    fechaHoy,
    conteos,

    // --- inventario ---
    /** La tarjeta de Kardex valorada, por materia prima. */
    tarjetas,
    /** Todo lo que el Kardex quiere que el usuario vea: faltantes, duplicados, unidades. */
    alertasKardex: alertasKardex as AlertaKardex[],
    valorInventario,
    bajoMinimo,
    /** El metodo con el que se valoro de verdad. */
    metodoInventario,
    /** El que pidio la configuracion. Distinto del anterior si todavia no esta implementado. */
    metodoPedido,

    // --- produccion ---
    /** Material directo por orden: total y detalle por linea. Lo que leera la hoja de costos. */
    materialesPorOrden,
    recetaPorProducto,
    costosReceta,

    // --- nomina ---
    /** Todas las liquidaciones, de todos los periodos. */
    liquidaciones,
    liquidacionesPorPeriodo,
    resumenesNomina,
    /**
     * El costo-empresa de la mano de obra INDIRECTA de cada periodo. Es el
     * insumo del modulo de CIF, y la unica via por la que ese costo puede
     * llegar al producto.
     */
    moIndirectaPorPeriodo,
    /** Administracion y ventas: gasto del periodo, nunca costo del producto. */
    gastosNominaPorPeriodo,
    /** Mano de obra directa por orden: total y detalle. Lo que leera la hoja de costos. */
    manoObraPorOrden: manoObraPorOrdenCalc,
    /** Horas pagadas vs. imputadas de los directos, con el costo del tiempo ocioso. */
    cuadreMO: cuadreMO.filas,
    alertasNomina,

    // --- CIF ---
    /** La tasa de cada periodo, con el cuadre entre aplicados e incurridos. */
    tasasCIF,
    tasaPorPeriodo,
    /** El CIF que le toca a cada orden: base, tasa, nivel de actividad e importe. */
    cifPorOrden: cifPorOrden as Record<ID, CIFOrden>,
    /** Los periodos que tienen CIF registrados o ordenes. */
    periodosCIF,
    /** En que periodo de CIF cae cada orden. */
    periodoPorOrden,

    // --- hojas de costos ---
    /** La hoja completa de cada orden que ya tiene hoja. */
    hojas,
    hojasPorOrden,
    otrosPorOrden,
  }
}

export type Calculado = ReturnType<typeof calcularTodo>

/** Hoy, en 'YYYY-MM-DD' y en hora local. */
export function hoy(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}
