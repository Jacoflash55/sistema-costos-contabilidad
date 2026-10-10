/**
 * LA HOJA DE COSTOS. Funciones PURAS que ARMAN la hoja leyendo lo que los
 * otros modulos ya calcularon.
 *
 * ESTE ARCHIVO NO CALCULA NINGUN COSTO. Los materiales salen del Kardex
 * (`materialesDeOrdenes`), la mano de obra de la nomina (`manoObraPorOrden`),
 * los CIF de la tasa del periodo (`calcularCIF`) y los otros directos de su
 * propio registro. Aqui solo se integran, se suma y se saca el costo unitario,
 * el precio y la utilidad. Nada se escribe a mano y nada se cuenta dos veces.
 *
 * ---------------------------------------------------------------------
 * LAS FORMULAS
 *
 *   costo_total    = MPD + MOD + CIF + otros directos
 *   costo_unitario = costo_total / cantidad producida      (exige cantidad > 0)
 *
 *   recargo sobre costo:  PV = costo_unitario x (1 + r)
 *   margen sobre venta:   PV = costo_unitario / (1 - m)    (exige m < 1)
 *
 *   utilidad = PV - costo_unitario
 *
 * ---------------------------------------------------------------------
 * BORRADOR Y FINALIZADA
 *
 * Una hoja en BORRADOR se recalcula sola cada vez que cambia algo de origen:
 * un consumo, una hora imputada, un CIF del periodo, la cantidad producida.
 * Una hoja FINALIZADA muestra la foto que se congelo al finalizarla, y no se
 * mueve aunque despues cambie un costo. Corregirla sube la version y deja
 * registrado que cambio.
 *
 * Y nunca se muestra como completa una hoja a la que le falta lo esencial:
 * `faltantes` dice que falta y `completa` queda en false.
 */

import { divSegura, redondearArriba } from './calc'
import { ETIQUETA_BASE, UNIDAD_BASE, baseEnPesos } from './cif'
import { ETIQUETA_HORA } from './nomina'
import type {
  CambioHoja,
  Cliente,
  Config,
  HojaCostos,
  HojaRegistro,
  ID,
  ManoObraOrden,
  MaterialesOrden,
  MetodoMargen,
  OrdenProduccion,
  OtroCostoDirecto,
  Producto,
  RenglonHoja,
  CIFOrden,
} from './tipos'
import { unidadCorta } from './unidades'

// =====================================================================
// 1. MARGEN Y PRECIO
// =====================================================================

export interface PrecioSugerido {
  metodo: MetodoMargen
  /** El porcentaje que se aplico. */
  pct: number
  /** null cuando no se puede calcular. */
  precio: number | null
  utilidad: number | null
  /** El por que, cuando no se pudo. */
  problema?: string
}

/**
 * El precio de venta sugerido a partir del costo unitario.
 *
 *   'sobre_costo':  PV = costo x (1 + r)     — recargo sobre el costo (markup)
 *   'sobre_precio': PV = costo / (1 - m)     — margen sobre la venta
 *
 * LA GUARDA QUE IMPORTA: con margen sobre la venta y m >= 100%, el divisor es
 * cero o negativo. No hay precio que deje ese margen —ni infinito alcanza—, asi
 * que NO se calcula nada: se devuelve `precio: null` con el motivo. Devolver
 * Infinity, o un numero negativo, seria peor que no responder.
 *
 * El redondeo del precio sale de la configuracion y es hacia ARRIBA: un precio
 * redondeado hacia abajo se come parte del margen.
 */
export function precioSugerido(
  costoUnitario: number,
  metodo: MetodoMargen,
  pct: number,
  redondeoMultiplo = 1,
): PrecioSugerido {
  const base = { metodo, pct }

  if (!Number.isFinite(pct) || pct < 0) {
    return { ...base, precio: null, utilidad: null, problema: 'El porcentaje no es válido.' }
  }
  if (costoUnitario <= 0) {
    return {
      ...base,
      precio: null,
      utilidad: null,
      problema: 'Sin costo unitario no hay precio que sugerir.',
    }
  }

  let precio: number

  if (metodo === 'sobre_costo') {
    precio = costoUnitario * (1 + pct / 100)
  } else {
    if (pct >= 100) {
      return {
        ...base,
        precio: null,
        utilidad: null,
        problema:
          `Un margen sobre la venta del ${pct}% es imposible: el margen tiene que ser menor que 100%. ` +
          'Con 100% el precio tendría que ser infinito para que el costo fuera cero.',
      }
    }
    precio = costoUnitario / (1 - pct / 100)
  }

  const redondeado = redondeoMultiplo > 1 ? redondearArriba(precio, redondeoMultiplo) : precio
  return { ...base, precio: redondeado, utilidad: redondeado - costoUnitario }
}

/**
 * De donde sale el porcentaje de margen, en orden de prioridad:
 * lo que diga la hoja, si no lo del producto, si no el de la configuracion.
 */
export function margenDe(
  registro: Pick<HojaRegistro, 'margen_metodo' | 'margen_pct'>,
  producto: Producto | undefined,
  config: Config,
): { metodo: MetodoMargen; pct: number; origen: HojaCostos['margen_origen'] } {
  const metodo = registro.margen_metodo ?? config.parametros.metodo_margen

  if (registro.margen_pct != null) return { metodo, pct: registro.margen_pct, origen: 'hoja' }
  if (producto?.margen_objetivo_pct != null) {
    return { metodo, pct: producto.margen_objetivo_pct, origen: 'producto' }
  }
  return { metodo, pct: config.parametros.margen_por_defecto_pct, origen: 'configuracion' }
}

// =====================================================================
// 2. ARMAR LA HOJA
// =====================================================================

export interface EntradaHoja {
  registro: HojaRegistro
  orden: OrdenProduccion
  producto: Producto | undefined
  cliente: Cliente | undefined
  materiales: MaterialesOrden | undefined
  manoObra: ManoObraOrden | undefined
  cif: CIFOrden | undefined
  otros: readonly OtroCostoDirecto[]
  config: Config
}

/** Como se muestra la tasa de CIF al lado del importe. */
function detalleTasa(cif: CIFOrden): string {
  const unidad = UNIDAD_BASE[cif.base]
  const tasa = baseEnPesos(cif.base)
    ? `${(cif.tasa * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })}% del ${unidad.replace('$ de ', '')}`
    : `$${cif.tasa.toLocaleString('es-CO', { maximumFractionDigits: 2 })} por ${unidad}`
  return `Tasa del período: ${tasa}`
}

/**
 * Arma la hoja completa de una orden.
 *
 * Si el registro esta FINALIZADO y tiene foto congelada, devuelve la foto: esa
 * hoja ya se firmo y no se recalcula. Para todo lo demas integra lo que los
 * otros modulos calcularon hoy.
 */
export function armarHoja(e: EntradaHoja): HojaCostos {
  const { registro, orden, producto, cliente, config } = e

  if (registro.estado === 'finalizada' && registro.congelada) {
    return registro.congelada
  }

  const faltantes: string[] = []
  const advertencias: string[] = []

  // ---------- (A) materia prima directa, del Kardex ----------
  const materiales: RenglonHoja[] = (e.materiales?.lineas ?? [])
    .filter((l) => l.aplicado)
    .map((l) => ({
      concepto: l.nombre,
      detalle: l.codigo,
      cantidad: l.cantidad,
      unidad: unidadCorta(l.unidad),
      costo_unitario: l.costo_unitario,
      total: l.costo_total,
    }))

  const sinAplicar = (e.materiales?.lineas ?? []).filter((l) => !l.aplicado).length
  if (sinAplicar > 0) {
    advertencias.push(
      `${sinAplicar} consumo(s) de material no se aplicaron por falta de saldo y no están en el costo.`,
    )
  }

  const total_materiales = materiales.reduce((s, r) => s + r.total, 0)

  // ---------- (B) mano de obra directa, de la nomina ----------
  const mano_obra: RenglonHoja[] = (e.manoObra?.lineas ?? []).map((l) => ({
    concepto: l.nombre,
    detalle: `${l.codigo} · ${ETIQUETA_HORA[l.tipo_hora]}${l.recargo !== 1 ? ` ×${l.recargo.toLocaleString('es-CO')}` : ''}`,
    cantidad: l.horas,
    unidad: 'h',
    // la tarifa que se muestra es la que de verdad se cargo: total / horas
    costo_unitario: divSegura(l.total, l.horas),
    total: l.total,
  }))

  const total_mano_obra = mano_obra.reduce((s, r) => s + r.total, 0)

  // ---------- (C) CIF, de la tasa del periodo ----------
  const cif: RenglonHoja[] = []
  const cifDetalle = e.cif ?? null

  if (cifDetalle && cifDetalle.valido && cifDetalle.importe !== 0) {
    cif.push({
      concepto: `CIF aplicados — base: ${ETIQUETA_BASE[cifDetalle.base].toLowerCase()}`,
      detalle: detalleTasa(cifDetalle),
      cantidad: cifDetalle.nivel_actividad,
      unidad: UNIDAD_BASE[cifDetalle.base],
      costo_unitario: cifDetalle.tasa,
      total: cifDetalle.importe,
    })
    if (cifDetalle.estimado) {
      advertencias.push(
        'El nivel de actividad de los CIF es una estimación de la receta, no un dato registrado.',
      )
    }
  } else if (cifDetalle && !cifDetalle.valido) {
    advertencias.push(cifDetalle.nota ?? 'No se pudo calcular la tasa de CIF del período.')
  } else {
    advertencias.push('Esta orden no tiene CIF aplicados: revisá que el período tenga CIF registrados.')
  }

  const total_cif = cif.reduce((s, r) => s + r.total, 0)

  // ---------- (D) otros costos directos ----------
  const otros: RenglonHoja[] = e.otros.map((o) => ({
    concepto: o.concepto,
    detalle: o.nota,
    cantidad: 1,
    unidad: '—',
    costo_unitario: o.monto,
    total: o.monto,
  }))

  const total_otros = otros.reduce((s, r) => s + r.total, 0)

  // ---------- resumen ----------
  const costo_total = total_materiales + total_mano_obra + total_cif + total_otros
  const cantidad_producida = orden.cantidad_terminada ?? 0
  const costo_unitario = divSegura(costo_total, cantidad_producida)

  /*
    QUE FALTA PARA PODER FINALIZAR.

    Lo esencial es poder dividir: sin cantidad producida no hay costo unitario,
    y sin ningun costo cargado la hoja no dice nada. Lo demas son advertencias:
    una orden puede no tener CIF si el periodo no tuvo, y puede no tener mano
    de obra imputada todavia.
  */
  if (orden.cantidad_terminada == null) {
    faltantes.push('La orden no tiene cantidad producida: sin eso no hay costo unitario.')
  } else if (cantidad_producida <= 0) {
    faltantes.push('La cantidad producida es cero: no hay entre qué repartir el costo.')
  }
  if (costo_total === 0) {
    faltantes.push('No hay ningún costo cargado a la orden: ni material, ni mano de obra, ni CIF.')
  }

  if (total_materiales === 0) advertencias.push('Sin material directo consumido.')
  if (total_mano_obra === 0) advertencias.push('Sin mano de obra directa imputada.')
  if (orden.estado !== 'terminada') {
    advertencias.push(`La orden está en estado «${orden.estado}»: los costos pueden seguir cambiando.`)
  }
  if (
    orden.cantidad_terminada != null &&
    orden.cantidad_terminada !== orden.cantidad_programada
  ) {
    advertencias.push(
      `Se produjeron ${orden.cantidad_terminada} de ${orden.cantidad_programada} unidades programadas.`,
    )
  }

  // ---------- margen y precio ----------
  const margen = margenDe(registro, producto, config)
  const precio = precioSugerido(
    costo_unitario,
    margen.metodo,
    margen.pct,
    config.parametros.redondeo_precio_multiplo,
  )
  if (precio.problema && costo_unitario > 0) advertencias.push(precio.problema)

  return {
    hoja_id: registro.id,
    numero: registro.numero,
    orden_id: orden.id,
    orden_numero: orden.numero,
    empresa: config.empresa.razon_social || config.empresa.nombre,
    empresa_nit: config.empresa.nit,
    cliente: cliente?.nombre ?? 'Sin cliente',
    fecha_elaboracion: registro.fecha_elaboracion,
    fecha_inicio: orden.fecha_inicio,
    fecha_fin: orden.fecha_fin,
    producto: producto?.nombre ?? 'Producto borrado',
    producto_codigo: producto?.codigo ?? '—',
    unidad: producto ? unidadCorta(producto.unidad) : 'un',
    cantidad_solicitada: orden.cantidad_programada,
    cantidad_producida,
    estado_orden: orden.estado,
    estado: registro.estado,
    observaciones: registro.observaciones,
    version: registro.version,

    materiales,
    mano_obra,
    cif,
    otros,

    total_materiales,
    total_mano_obra,
    total_cif,
    total_otros,
    costo_primo: total_materiales + total_mano_obra,
    costo_conversion: total_mano_obra + total_cif,
    costo_total,
    costo_unitario,

    margen_metodo: margen.metodo,
    margen_pct: margen.pct,
    margen_origen: margen.origen,
    precio_sugerido: precio.precio,
    utilidad_unitaria: precio.utilidad,

    completa: faltantes.length === 0,
    faltantes,
    advertencias,
    cif_detalle: cifDetalle,
  }
}

// =====================================================================
// 3. FINALIZAR Y CORREGIR
// =====================================================================

/**
 * Compara dos fotos de la hoja y describe que se movio.
 *
 * Es lo que hace util la trazabilidad: no basta saber que la hoja cambio de
 * version, hay que poder decir en una linea por que el costo es otro.
 */
export function diferenciasEntre(antes: HojaCostos, despues: HojaCostos): string[] {
  const out: string[] = []
  const compara = (etiqueta: string, a: number, b: number) => {
    if (Math.abs(a - b) < 0.005) return
    const signo = b > a ? 'subió' : 'bajó'
    out.push(
      `${etiqueta} ${signo} de $${Math.round(a).toLocaleString('es-CO')} a $${Math.round(b).toLocaleString('es-CO')}.`,
    )
  }

  compara('Material directo', antes.total_materiales, despues.total_materiales)
  compara('Mano de obra directa', antes.total_mano_obra, despues.total_mano_obra)
  compara('CIF aplicados', antes.total_cif, despues.total_cif)
  compara('Otros costos directos', antes.total_otros, despues.total_otros)
  compara('Costo total', antes.costo_total, despues.costo_total)
  compara('Costo unitario', antes.costo_unitario, despues.costo_unitario)

  if (antes.cantidad_producida !== despues.cantidad_producida) {
    out.push(
      `La cantidad producida pasó de ${antes.cantidad_producida} a ${despues.cantidad_producida} ${despues.unidad}.`,
    )
  }
  if (antes.materiales.length !== despues.materiales.length) {
    out.push(`Las líneas de material pasaron de ${antes.materiales.length} a ${despues.materiales.length}.`)
  }
  if (antes.mano_obra.length !== despues.mano_obra.length) {
    out.push(`Las líneas de mano de obra pasaron de ${antes.mano_obra.length} a ${despues.mano_obra.length}.`)
  }
  if (antes.margen_pct !== despues.margen_pct || antes.margen_metodo !== despues.margen_metodo) {
    out.push(`El margen pasó de ${antes.margen_pct}% a ${despues.margen_pct}%.`)
  }

  if (out.length === 0) out.push('Ninguna cifra cambió: solo se volvió a firmar la hoja.')
  return out
}

export type ResultadoFinalizar =
  | { ok: true; registro: HojaRegistro }
  | { ok: false; error: string; faltantes: string[] }

/**
 * Finaliza una hoja: congela la foto de hoy.
 *
 * Si la hoja ya tenia una foto (o sea, se esta re-finalizando despues de una
 * correccion), sube la version y deja en el historial que cambio respecto a la
 * anterior. Y no deja finalizar una hoja incompleta: mostrar «definitivo» con
 * datos faltantes seria mentir.
 *
 * FUNCION PURA: devuelve el registro nuevo, no muta el que entra.
 */
export function finalizarHoja(
  registro: HojaRegistro,
  hoja: HojaCostos,
  motivo: string,
  ahora: string = new Date().toISOString(),
): ResultadoFinalizar {
  if (!hoja.completa) {
    return {
      ok: false,
      error: 'La hoja no se puede finalizar: le falta información esencial.',
      faltantes: hoja.faltantes,
    }
  }

  const anterior = registro.congelada
  const version = anterior ? registro.version + 1 : registro.version

  const congelada: HojaCostos = { ...hoja, estado: 'finalizada', version }

  const historial: CambioHoja[] = anterior
    ? [
        ...registro.historial,
        {
          version,
          fecha: ahora,
          motivo: motivo.trim() || 'Corrección sin motivo registrado.',
          costo_total_antes: anterior.costo_total,
          costo_total_despues: congelada.costo_total,
          costo_unitario_antes: anterior.costo_unitario,
          costo_unitario_despues: congelada.costo_unitario,
          diferencias: diferenciasEntre(anterior, congelada),
        },
      ]
    : registro.historial

  return { ok: true, registro: { ...registro, estado: 'finalizada', version, congelada, historial } }
}

/**
 * Reabre una hoja finalizada para corregirla.
 *
 * La foto congelada NO se borra: se guarda para poder comparar contra ella
 * cuando se vuelva a finalizar y decir exactamente que cambió.
 */
export function reabrirHoja(registro: HojaRegistro): HojaRegistro {
  return { ...registro, estado: 'borrador' }
}

/** El siguiente numero de hoja: HC-001, HC-002... */
export function siguienteNumeroHoja(hojas: readonly HojaRegistro[]): string {
  let maximo = 0
  for (const h of hojas) {
    const m = /^HC-(\d+)$/.exec(h.numero.trim())
    if (m) maximo = Math.max(maximo, Number(m[1]))
  }
  return `HC-${String(maximo + 1).padStart(3, '0')}`
}

/** Las hojas de una orden. Normalmente es una, pero el tipo no lo impide. */
export function hojaDeOrden(hojas: readonly HojaRegistro[], ordenId: ID): HojaRegistro | undefined {
  return hojas.find((h) => h.orden_id === ordenId)
}
