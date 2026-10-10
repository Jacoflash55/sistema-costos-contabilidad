/**
 * EL MOTOR DE NOMINA. Funciones PURAS: entran trabajadores, horas y
 * parametros; salen liquidaciones. Nada de React, nada de localStorage.
 *
 * MODELO ACADEMICO SIMPLIFICADO. Los recargos y el factor prestacional salen
 * de la configuracion y son editables. Esto resuelve un taller de costos; NO
 * es una implementacion de la ley laboral colombiana, no calcula seguridad
 * social por separado, no maneja IBC ni topes, y no garantiza cumplimiento de
 * nada. Verificalo con tu profe antes de usarlo para algo real.
 *
 * ---------------------------------------------------------------------
 * LAS FORMULAS
 *
 *   valor_hora (mensual)  = salario_mensual / horas_mes
 *   valor_hora (por hora) = tarifa_hora
 *
 *   valor de las horas    = Σ (horas_tipo × valor_hora × recargo_tipo)
 *   total_devengado       = salario_base_periodo + extras_y_recargos + bonificaciones
 *   neto                  = max(0, total_devengado − deducciones)
 *   costo_MO_empresa      = total_devengado × (1 + factor_prestacional)
 *   costo_MOD_orden       = Σ (horas_imputadas × valor_hora × recargo [× factor])
 *
 * ---------------------------------------------------------------------
 * EL ERROR QUE ESTE ARCHIVO EVITA A PROPOSITO
 *
 * Un trabajador MENSUAL no se paga multiplicando su salario por las horas. Su
 * salario del mes YA INCLUYE las horas ordinarias; el salario es el salario, y
 * las horas ordinarias solo se cuentan para saber cuanto tiempo se trabajo y
 * para poder imputarlo a las ordenes. Lo unico que se suma aparte son las
 * extras y los recargos. Ver `salarioBasePeriodo`.
 *
 * ---------------------------------------------------------------------
 * COMO SE LEEN LOS RECARGOS
 *
 * Dos clases, y la diferencia importa:
 *
 *   FACTOR COMPLETO (extra_diurna 1.25, extra_nocturna 1.75): la hora es
 *   adicional a la jornada y se paga entera por ese factor.
 *
 *   SOLO EL ADICIONAL (recargo_nocturno 0.35, dominical 0.75): la hora ya se
 *   pago como ordinaria y esto es el recargo que se le suma encima.
 *
 * La formula Σ (horas × valor_hora × recargo) sirve para las dos, siempre que
 * el numero de la configuracion se entienda asi. Para un trabajador POR HORA
 * eso significa que una hora dominical se anota DOS veces: como ordinaria
 * (para que se pague la hora) y como dominical (para que se pague el recargo).
 * La pantalla de horas lo dice.
 */

import type {
  AlertaNomina,
  AsignacionMO,
  ClasificacionMO,
  ConceptoRemuneracion,
  ID,
  LineaHoras,
  LineaLiquidacion,
  LineaMODOrden,
  Liquidacion,
  ManoObraOrden,
  Novedad,
  OrdenProduccion,
  ParametrosCalculo,
  PeriodoNomina,
  RegistroHoras,
  ResumenNomina,
  TipoHora,
  TipoHoraRegistro,
  Trabajador,
} from './tipos'

// =====================================================================
// 1. TIPOS DE HORA
// =====================================================================

/** Las cinco clases de hora que se pagan, mas las ausencias. En orden de tabla. */
export const TIPOS_HORA_REGISTRO: readonly TipoHoraRegistro[] = [
  'ordinaria',
  'extra_diurna',
  'extra_nocturna',
  'recargo_nocturno',
  'dominical',
  'ausencia',
]

/** Las que se pueden imputar a una orden de produccion. */
export const TIPOS_HORA: readonly TipoHora[] = [
  'ordinaria',
  'extra_diurna',
  'extra_nocturna',
  'recargo_nocturno',
  'dominical',
]

export const ETIQUETA_HORA: Record<TipoHoraRegistro, string> = {
  ordinaria: 'Ordinarias',
  extra_diurna: 'Extra diurnas',
  extra_nocturna: 'Extra nocturnas',
  recargo_nocturno: 'Recargo nocturno',
  dominical: 'Dominicales y festivas',
  ausencia: 'Ausencias',
}

export const ETIQUETA_CLASIFICACION: Record<ClasificacionMO, string> = {
  directa: 'Mano de obra directa',
  indirecta: 'Mano de obra indirecta',
  administracion: 'Administración',
  ventas: 'Ventas',
}

/**
 * El factor con el que se paga cada clase de hora.
 *
 * 'ordinaria' es 1: la hora vale lo que vale. 'ausencia' es 0: no se paga.
 * El resto sale de la configuracion, editable.
 */
export function recargoDe(tipo: TipoHoraRegistro, parametros: ParametrosCalculo): number {
  switch (tipo) {
    case 'ordinaria':
      return 1
    case 'ausencia':
      return 0
    case 'extra_diurna':
      return parametros.recargos.extra_diurna
    case 'extra_nocturna':
      return parametros.recargos.extra_nocturna
    case 'recargo_nocturno':
      return parametros.recargos.recargo_nocturno
    case 'dominical':
      return parametros.recargos.dominical
  }
}

/** Si la mano de obra directa se costea al costo-empresa. Por defecto, si. */
export function usaFactorEnMOD(parametros: ParametrosCalculo): boolean {
  return parametros.mod_con_factor_prestacional !== false
}

// =====================================================================
// 2. VALOR DE LA HORA
// =====================================================================

/**
 * Cuanto vale una hora de esta persona, SIN prestaciones.
 *
 *   mensual  -> salario_mensual / horas_mes
 *   por hora -> la tarifa, tal cual
 *
 * Con `horas_mes` en cero o negativo devuelve 0 en vez de Infinity: la UI lo
 * reporta como configuracion invalida.
 */
export function valorHora(trabajador: Trabajador, parametros: ParametrosCalculo): number {
  if (trabajador.modalidad === 'por_hora') return Math.max(0, trabajador.tarifa_hora)
  if (parametros.horas_mes <= 0) return 0
  return trabajador.salario_basico / parametros.horas_mes
}

/** El valor de la hora ya cargado con el factor prestacional. */
export function costoHoraCargado(trabajador: Trabajador, parametros: ParametrosCalculo): number {
  return valorHora(trabajador, parametros) * (1 + parametros.factor_prestacional)
}

// =====================================================================
// 3. LIQUIDACION DE UNA PERSONA EN UN PERIODO
// =====================================================================

export interface EntradaLiquidacion {
  trabajador: Trabajador
  periodo: PeriodoNomina
  /** Solo los registros de ESTE trabajador en ESTE periodo. */
  horas: readonly RegistroHoras[]
  /** Solo las novedades de ESTE trabajador en ESTE periodo. */
  novedades: readonly Novedad[]
  /** El catalogo completo; el motor filtra los activos. */
  conceptos: readonly ConceptoRemuneracion[]
  parametros: ParametrosCalculo
}

/** Suma las horas de cada clase. Las clases sin registros quedan en cero. */
export function horasPorTipo(horas: readonly RegistroHoras[]): Record<TipoHoraRegistro, number> {
  const out = {
    ordinaria: 0,
    extra_diurna: 0,
    extra_nocturna: 0,
    recargo_nocturno: 0,
    dominical: 0,
    ausencia: 0,
  } as Record<TipoHoraRegistro, number>

  for (const h of horas) {
    if (!Number.isFinite(h.horas) || h.horas <= 0) continue
    out[h.tipo_hora] = (out[h.tipo_hora] ?? 0) + h.horas
  }
  return out
}

/**
 * El salario del periodo antes de extras y recargos.
 *
 * AQUI ESTA LA DIFERENCIA ENTRE LAS DOS MODALIDADES:
 *
 *   mensual  -> el salario del mes, menos las horas de ausencia valoradas a
 *               valor_hora. Las horas ordinarias NO se multiplican por nada:
 *               ya estan dentro del salario.
 *   por hora -> las horas ordinarias x la tarifa. Una ausencia no se descuenta
 *               porque esa hora simplemente no se registro como trabajada.
 */
export function salarioBasePeriodo(
  trabajador: Trabajador,
  horas: Record<TipoHoraRegistro, number>,
  parametros: ParametrosCalculo,
): number {
  const vh = valorHora(trabajador, parametros)

  if (trabajador.modalidad === 'por_hora') {
    return horas.ordinaria * vh
  }

  const descuento = horas.ausencia * vh
  return Math.max(0, trabajador.salario_basico - descuento)
}

/**
 * Liquida a una persona en un periodo.
 *
 * El recorrido: horas -> salario base -> extras -> bonificaciones ->
 * devengado -> deducciones -> neto, y aparte el costo-empresa.
 */
export function liquidar(e: EntradaLiquidacion): Liquidacion {
  const { trabajador, periodo, parametros } = e
  const alertas: string[] = []

  if (trabajador.modalidad === 'mensual' && parametros.horas_mes <= 0) {
    alertas.push('Las horas al mes de la configuración tienen que ser mayores que cero.')
  }
  if (trabajador.modalidad === 'por_hora' && trabajador.tarifa_hora <= 0) {
    alertas.push('Este trabajador se paga por hora pero no tiene tarifa.')
  }

  const vh = valorHora(trabajador, parametros)
  const horas = horasPorTipo(e.horas)
  const base = salarioBasePeriodo(trabajador, horas, parametros)

  /*
    EL DETALLE DE LAS HORAS.

    Las ordinarias de un trabajador mensual y las ausencias salen con
    `se_paga: false` y monto 0: se ven en la tabla, porque hacen falta para
    entender el periodo y para imputar tiempo a las ordenes, pero no suman
    plata aparte.
  */
  const lineas_horas: LineaHoras[] = []
  let extras_y_recargos = 0

  for (const tipo of TIPOS_HORA_REGISTRO) {
    const cantidad = horas[tipo]
    if (cantidad === 0) continue

    const recargo = recargoDe(tipo, parametros)
    const ordinariaDeMensual = tipo === 'ordinaria' && trabajador.modalidad === 'mensual'
    const ordinariaDePorHora = tipo === 'ordinaria' && trabajador.modalidad === 'por_hora'
    const se_paga = tipo !== 'ausencia' && !ordinariaDeMensual

    // Las ordinarias de un trabajador por hora ya estan dentro de
    // `salario_base_periodo`: se marcan como pagadas pero no se vuelven a sumar.
    const monto = se_paga && !ordinariaDePorHora ? cantidad * vh * recargo : 0
    extras_y_recargos += monto

    lineas_horas.push({
      tipo_hora: tipo,
      horas: cantidad,
      valor_hora: vh,
      recargo,
      monto: ordinariaDePorHora ? cantidad * vh : monto,
      se_paga,
    })
  }

  // ------------------------------------------------------------------
  // Conceptos: los automaticos del catalogo + los que invoca una novedad
  // ------------------------------------------------------------------
  const porId = new Map(e.conceptos.map((c) => [c.id, c]))
  const activos = e.conceptos.filter((c) => c.activo)

  /** Lo devengado por horas, que es la base de todo lo demas. */
  const devengadoHoras = base + extras_y_recargos

  const lineas: LineaLiquidacion[] = []
  let bonificaciones = 0
  let total_deducciones = 0
  /** Lo que entra a la base prestacional: horas + los devengados que la afectan. */
  let extraPrestacional = 0

  /** Resuelve el monto de un concepto sobre la base que le toque. */
  const montoDe = (c: ConceptoRemuneracion, basePrestacional: number): { base: number; monto: number } => {
    if (c.base === 'fijo') return { base: 0, monto: c.monto_fijo ?? 0 }
    const sobre =
      c.base === 'salario_basico'
        ? base
        : c.base === 'total_devengado'
          ? devengadoHoras
          : basePrestacional
    return { base: sobre, monto: (sobre * (c.porcentaje ?? 0)) / 100 }
  }

  /*
    PRIMERA PASADA: los devengados. Hay que resolverlos antes de las
    deducciones porque algunos (el auxilio de transporte) cambian el total
    devengado, y porque de aqui sale la base prestacional.
  */
  const devengadosAutomaticos = activos.filter((c) => c.tipo === 'devengado' && c.automatico)
  const novedadesDevengado = e.novedades.filter((n) => porId.get(n.concepto_id)?.tipo === 'devengado')

  for (const c of devengadosAutomaticos) {
    if (c.requiere_auxilio_transporte && !trabajador.tiene_auxilio_transporte) continue
    const { base: b, monto } = montoDe(c, devengadoHoras)
    if (monto === 0) continue
    bonificaciones += monto
    if (c.afecta_base_prestacional) extraPrestacional += monto
    lineas.push({ concepto_id: c.id, nombre: c.nombre, tipo: 'devengado', base: b, monto })
  }

  for (const n of novedadesDevengado) {
    const c = porId.get(n.concepto_id)
    if (!c || !c.activo) continue
    const resuelto = montoDe(c, devengadoHoras)
    const monto = n.monto ?? resuelto.monto
    if (monto === 0) continue
    bonificaciones += monto
    if (c.afecta_base_prestacional) extraPrestacional += monto
    lineas.push({
      concepto_id: c.id,
      nombre: n.nota ? `${c.nombre} — ${n.nota}` : c.nombre,
      tipo: 'devengado',
      base: n.monto != null ? 0 : resuelto.base,
      monto,
    })
  }

  const total_devengado = devengadoHoras + bonificaciones
  const base_prestacional = devengadoHoras + extraPrestacional

  /*
    SEGUNDA PASADA: las deducciones, ya con la base prestacional firme.
  */
  const deduccionesAutomaticas = activos.filter((c) => c.tipo === 'deduccion' && c.automatico)
  const novedadesDeduccion = e.novedades.filter((n) => porId.get(n.concepto_id)?.tipo === 'deduccion')

  for (const c of deduccionesAutomaticas) {
    if (c.requiere_auxilio_transporte && !trabajador.tiene_auxilio_transporte) continue
    const { base: b, monto } = montoDe(c, base_prestacional)
    if (monto === 0) continue
    total_deducciones += monto
    lineas.push({ concepto_id: c.id, nombre: c.nombre, tipo: 'deduccion', base: b, monto })
  }

  for (const n of novedadesDeduccion) {
    const c = porId.get(n.concepto_id)
    if (!c || !c.activo) continue
    const resuelto = montoDe(c, base_prestacional)
    const monto = n.monto ?? resuelto.monto
    if (monto === 0) continue
    total_deducciones += monto
    lineas.push({
      concepto_id: c.id,
      nombre: n.nota ? `${c.nombre} — ${n.nota}` : c.nombre,
      tipo: 'deduccion',
      base: n.monto != null ? 0 : resuelto.base,
      monto,
    })
  }

  /*
    LAS DOS CIFRAS. El neto nunca baja de cero: si las deducciones se comen el
    devengado, el sobrante es un problema de nomina, no un pago negativo.
  */
  const neto_pagar = Math.max(0, total_devengado - total_deducciones)
  if (total_deducciones > total_devengado) {
    alertas.push('Las deducciones superan el devengado: el neto quedó en cero.')
  }

  const costo_empresa = total_devengado * (1 + parametros.factor_prestacional)

  const horas_pagadas = TIPOS_HORA.reduce((s, t) => s + horas[t], 0)

  return {
    trabajador_id: trabajador.id,
    periodo_id: periodo.id,
    clasificacion: trabajador.clasificacion,
    modalidad: trabajador.modalidad,
    valor_hora: vh,
    horas_por_tipo: horas,
    lineas_horas,
    salario_base_periodo: base,
    extras_y_recargos,
    bonificaciones,
    total_devengado,
    base_prestacional,
    lineas,
    total_deducciones,
    neto_pagar,
    costo_empresa,
    carga_prestacional: costo_empresa - total_devengado,
    costo_hora_cargado: vh * (1 + parametros.factor_prestacional),
    horas_pagadas,
    alertas,
  }
}

/**
 * Liquida a todo el mundo en un periodo.
 *
 * Entran solo los trabajadores ACTIVOS, o los inactivos que tengan horas o
 * novedades anotadas en el periodo: a alguien que se retiro a mitad de mes
 * igual hay que pagarle lo que trabajo.
 */
export function liquidarPeriodo(
  trabajadores: readonly Trabajador[],
  periodo: PeriodoNomina,
  registros: readonly RegistroHoras[],
  novedades: readonly Novedad[],
  conceptos: readonly ConceptoRemuneracion[],
  parametros: ParametrosCalculo,
): Liquidacion[] {
  const delPeriodo = registros.filter((r) => r.periodo_id === periodo.id)
  const novDelPeriodo = novedades.filter((n) => n.periodo_id === periodo.id)

  const conMovimiento = new Set<ID>([
    ...delPeriodo.map((r) => r.trabajador_id),
    ...novDelPeriodo.map((n) => n.trabajador_id),
  ])

  return trabajadores
    .filter((t) => t.activo || conMovimiento.has(t.id))
    .map((trabajador) =>
      liquidar({
        trabajador,
        periodo,
        horas: delPeriodo.filter((r) => r.trabajador_id === trabajador.id),
        novedades: novDelPeriodo.filter((n) => n.trabajador_id === trabajador.id),
        conceptos,
        parametros,
      }),
    )
}

/** El consolidado del periodo, con el costo-empresa repartido por clasificacion. */
export function resumenNomina(periodoId: ID, liquidaciones: readonly Liquidacion[]): ResumenNomina {
  const por_clasificacion: Record<ClasificacionMO, number> = {
    directa: 0,
    indirecta: 0,
    administracion: 0,
    ventas: 0,
  }

  let total_devengado = 0
  let total_deducciones = 0
  let total_neto = 0
  let total_costo_empresa = 0

  for (const l of liquidaciones) {
    total_devengado += l.total_devengado
    total_deducciones += l.total_deducciones
    total_neto += l.neto_pagar
    total_costo_empresa += l.costo_empresa
    por_clasificacion[l.clasificacion] += l.costo_empresa
  }

  return {
    periodo_id: periodoId,
    liquidaciones: liquidaciones.length,
    total_devengado,
    total_deducciones,
    total_neto,
    total_costo_empresa,
    por_clasificacion,
  }
}

/**
 * La mano de obra INDIRECTA del periodo: el insumo que el modulo de CIF va a
 * repartir entre las ordenes.
 *
 * Es costo-empresa, no neto: lo que entra al pozo de CIF es lo que la empresa
 * paga. Y solo la clasificacion 'indirecta': lo directo ya se cargo orden por
 * orden y administracion y ventas no son costo del producto.
 */
export function manoObraIndirectaDelPeriodo(liquidaciones: readonly Liquidacion[]): number {
  return liquidaciones
    .filter((l) => l.clasificacion === 'indirecta')
    .reduce((s, l) => s + l.costo_empresa, 0)
}

/** Lo que es gasto del periodo y no toca ni la hoja de costos ni los CIF. */
export function gastosDeNominaDelPeriodo(liquidaciones: readonly Liquidacion[]): {
  administracion: number
  ventas: number
} {
  const de = (c: ClasificacionMO) =>
    liquidaciones.filter((l) => l.clasificacion === c).reduce((s, l) => s + l.costo_empresa, 0)
  return { administracion: de('administracion'), ventas: de('ventas') }
}

// =====================================================================
// 4. IMPUTACION A LAS ORDENES
// =====================================================================

/**
 * Reparte las horas imputadas entre las ordenes y las valora.
 *
 *   costo_MOD = horas × valor_hora × recargo × (1 + factor)
 *
 * El factor va o no segun `mod_con_factor_prestacional` (por defecto SI: la
 * hoja de costos se lleva el costo-empresa de la hora). Las dos cifras quedan
 * en cada linea, asi que se puede comparar sin recalcular nada.
 *
 * NO HAY DOBLE CONTEO. Aqui solo entra la clasificacion 'directa'. Si alguien
 * imputa horas de un trabajador indirecto a una orden, esas horas NO se suman
 * y se devuelve una alerta: ese costo tiene que llegar al producto por la via
 * de los CIF, no por la hoja, y jamas por las dos.
 */
export function manoObraPorOrden(
  ordenes: readonly OrdenProduccion[],
  asignaciones: readonly AsignacionMO[],
  trabajadores: readonly Trabajador[],
  parametros: ParametrosCalculo,
): { porOrden: Record<ID, ManoObraOrden>; alertas: AlertaNomina[] } {
  const porId = new Map(trabajadores.map((t) => [t.id, t]))
  const conFactor = usaFactorEnMOD(parametros)
  const alertas: AlertaNomina[] = []

  const porOrden: Record<ID, ManoObraOrden> = {}
  for (const o of ordenes) {
    porOrden[o.id] = {
      orden_id: o.id,
      lineas: [],
      horas: 0,
      total_salario: 0,
      total_con_factor: 0,
      total: 0,
    }
  }

  // un id por asignacion, una vez: el mismo criterio del Kardex
  const vistos = new Set<ID>()

  for (const a of asignaciones) {
    const destino = porOrden[a.orden_id]
    if (!destino) continue // asignacion de una orden que ya no existe
    if (vistos.has(a.id)) continue
    vistos.add(a.id)

    const trabajador = porId.get(a.trabajador_id)
    if (!trabajador) {
      alertas.push({
        clase: 'trabajador_inexistente',
        orden_id: a.orden_id,
        mensaje: 'Hay horas imputadas a un trabajador que ya no existe: no se costearon.',
      })
      continue
    }

    if (trabajador.clasificacion !== 'directa') {
      alertas.push({
        clase: 'mo_indirecta_en_orden',
        orden_id: a.orden_id,
        trabajador_id: trabajador.id,
        mensaje:
          `${trabajador.nombre} está clasificado como ${ETIQUETA_CLASIFICACION[trabajador.clasificacion].toLowerCase()}, ` +
          'así que sus horas NO entran como mano de obra directa. ' +
          (trabajador.clasificacion === 'indirecta'
            ? 'Su costo llega al producto por los CIF.'
            : 'Su costo es gasto del período.'),
      })
      continue
    }

    if (!Number.isFinite(a.horas) || a.horas <= 0) {
      alertas.push({
        clase: 'horas_invalidas',
        orden_id: a.orden_id,
        trabajador_id: trabajador.id,
        mensaje: `Las horas imputadas a ${trabajador.nombre} no son un número mayor que cero: no se costearon.`,
      })
      continue
    }

    const vh = a.tarifa_hora ?? valorHora(trabajador, parametros)
    if (vh <= 0) {
      alertas.push({
        clase: 'sin_tarifa',
        orden_id: a.orden_id,
        trabajador_id: trabajador.id,
        mensaje: `No se pudo resolver el valor hora de ${trabajador.nombre}: su costo quedó en cero.`,
      })
    }

    const recargo = recargoDe(a.tipo_hora, parametros)
    const costo_salario = a.horas * vh * recargo
    const costo_empresa = costo_salario * (1 + parametros.factor_prestacional)

    const linea: LineaMODOrden = {
      asignacion_id: a.id,
      trabajador_id: trabajador.id,
      codigo: trabajador.codigo,
      nombre: trabajador.nombre,
      tipo_hora: a.tipo_hora,
      horas: a.horas,
      valor_hora: vh,
      recargo,
      costo_salario,
      costo_empresa,
      total: conFactor ? costo_empresa : costo_salario,
    }

    destino.lineas.push(linea)
    destino.horas += a.horas
    destino.total_salario += costo_salario
    destino.total_con_factor += costo_empresa
    destino.total += linea.total
  }

  return { porOrden, alertas }
}

/**
 * Cuadra las horas PAGADAS contra las horas IMPUTADAS a ordenes, por
 * trabajador directo y periodo.
 *
 * Las dos no tienen por que coincidir, y la diferencia significa algo:
 *
 *   pagadas > imputadas  -> tiempo ocioso. Se pago pero no se cargo a ninguna
 *                           orden. En contabilidad de costos ese tiempo se
 *                           trata aparte (CIF o perdida del periodo), y esta
 *                           decision es del modulo de CIF: aqui solo se mide y
 *                           se avisa, para que no desaparezca sin que nadie lo
 *                           vea.
 *   imputadas > pagadas  -> error de registro. Se le cargo a las ordenes mas
 *                           tiempo del que se le pago.
 */
export function cuadreHorasDirectas(
  liquidaciones: readonly Liquidacion[],
  asignaciones: readonly AsignacionMO[],
  trabajadores: readonly Trabajador[],
): {
  filas: Array<{
    trabajador_id: ID
    nombre: string
    periodo_id: ID
    horas_pagadas: number
    horas_imputadas: number
    diferencia: number
    costo_ocioso: number
  }>
  alertas: AlertaNomina[]
} {
  const porId = new Map(trabajadores.map((t) => [t.id, t]))
  const alertas: AlertaNomina[] = []
  const filas: ReturnType<typeof cuadreHorasDirectas>['filas'] = []

  for (const l of liquidaciones) {
    if (l.clasificacion !== 'directa') continue
    const trabajador = porId.get(l.trabajador_id)
    if (!trabajador) continue

    /*
      Si la asignacion dice a que periodo pertenece, se respeta. Las que no lo
      dicen (registradas antes de que existiera el campo) se cuentan en todos
      los periodos del trabajador, que es lo unico honesto sin inventarse una
      fecha: por eso la UI pide el periodo al imputar.
    */
    const horas_imputadas = asignaciones
      .filter(
        (a) =>
          a.trabajador_id === l.trabajador_id &&
          (a.periodo_id == null || a.periodo_id === l.periodo_id) &&
          Number.isFinite(a.horas) &&
          a.horas > 0,
      )
      .reduce((s, a) => s + a.horas, 0)

    const diferencia = l.horas_pagadas - horas_imputadas

    filas.push({
      trabajador_id: l.trabajador_id,
      nombre: trabajador.nombre,
      periodo_id: l.periodo_id,
      horas_pagadas: l.horas_pagadas,
      horas_imputadas,
      diferencia,
      costo_ocioso: Math.max(0, diferencia) * l.costo_hora_cargado,
    })

    if (diferencia < 0) {
      alertas.push({
        clase: 'imputa_mas_de_lo_pagado',
        trabajador_id: l.trabajador_id,
        periodo_id: l.periodo_id,
        mensaje: `A ${trabajador.nombre} se le imputaron ${horas_imputadas} h a órdenes pero solo se le pagaron ${l.horas_pagadas} h.`,
      })
    } else if (diferencia > 0 && horas_imputadas > 0) {
      alertas.push({
        clase: 'horas_sin_imputar',
        trabajador_id: l.trabajador_id,
        periodo_id: l.periodo_id,
        mensaje: `${trabajador.nombre} tiene ${diferencia} h pagadas sin imputar a ninguna orden (tiempo ocioso).`,
      })
    }
  }

  return { filas, alertas }
}
