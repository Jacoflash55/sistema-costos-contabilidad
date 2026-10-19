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
 *
 *   IBC                   = devengado SALARIAL (salario + extras + recargos y
 *                           los devengados marcados como prestacionales). El
 *                           auxilio de transporte NO entra.
 *   carga_prestacional    = Σ (IBC × pct de cada línea activa del trabajador)
 *   costo_MO_empresa      = total_devengado + carga_prestacional
 *
 *   factor_prestacional   = Σ pct de las líneas activas / 100   ← DERIVADO
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
  AporteEmpleador,
  AsignacionMO,
  ClaseRiesgoARL,
  ClasificacionMO,
  LineaAporte,
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

/** Las ocho clases de hora que se pagan, mas las ausencias. En orden de tabla. */
export const TIPOS_HORA_REGISTRO: readonly TipoHoraRegistro[] = [
  'ordinaria',
  'extra_diurna',
  'extra_nocturna',
  'recargo_nocturno',
  'dominical',
  'recargo_nocturno_dominical',
  'extra_diurna_dominical',
  'extra_nocturna_dominical',
  'ausencia',
]

/** Las que se pueden imputar a una orden de produccion. */
export const TIPOS_HORA: readonly TipoHora[] = [
  'ordinaria',
  'extra_diurna',
  'extra_nocturna',
  'recargo_nocturno',
  'dominical',
  'recargo_nocturno_dominical',
  'extra_diurna_dominical',
  'extra_nocturna_dominical',
]

export const ETIQUETA_HORA: Record<TipoHoraRegistro, string> = {
  ordinaria: 'Ordinarias',
  extra_diurna: 'Extra diurnas',
  extra_nocturna: 'Extra nocturnas',
  recargo_nocturno: 'Recargo nocturno',
  dominical: 'Dominicales y festivas',
  recargo_nocturno_dominical: 'Recargo nocturno dominical',
  extra_diurna_dominical: 'Extra diurna dominical',
  extra_nocturna_dominical: 'Extra nocturna dominical',
  ausencia: 'Ausencias',
}

/**
 * Si el factor de ese tipo paga la hora ENTERA o solo el recargo encima de la
 * ordinaria. Lo usa la pantalla para explicarlo; el motor multiplica igual.
 */
export const CLASE_RECARGO: Record<TipoHoraRegistro, 'completo' | 'adicional' | 'base'> = {
  ordinaria: 'base',
  extra_diurna: 'completo',
  extra_nocturna: 'completo',
  recargo_nocturno: 'adicional',
  dominical: 'adicional',
  recargo_nocturno_dominical: 'adicional',
  extra_diurna_dominical: 'completo',
  extra_nocturna_dominical: 'completo',
  ausencia: 'base',
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
    case 'recargo_nocturno_dominical':
      return parametros.recargos.recargo_nocturno_dominical
    case 'extra_diurna_dominical':
      return parametros.recargos.extra_diurna_dominical
    case 'extra_nocturna_dominical':
      return parametros.recargos.extra_nocturna_dominical
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

/** El valor de la hora ya cargado con el factor prestacional de esa persona. */
export function costoHoraCargado(trabajador: Trabajador, parametros: ParametrosCalculo): number {
  return valorHora(trabajador, parametros) * (1 + factorPrestacionalDe(trabajador, parametros))
}

// =====================================================================
// 2b. LAS PRESTACIONES, LINEA POR LINEA
// =====================================================================

/**
 * Una linea de aporte ya resuelta para un trabajador: con el porcentaje que
 * de verdad se le aplica y de donde salio.
 */
export interface LineaEfectiva {
  id: string
  grupo: AporteEmpleador['grupo']
  nombre: string
  pct: number
  activo: boolean
  cuando_corresponda: boolean
  /** Si se calcula sobre el IBC mas el auxilio de transporte. */
  base_con_auxilio: boolean
  origen: 'global' | 'trabajador'
}

export const ETIQUETA_GRUPO: Record<AporteEmpleador['grupo'], string> = {
  prestaciones: 'Prestaciones sociales',
  seguridad_social: 'Seguridad social (empleador)',
  parafiscales: 'Parafiscales',
}

/** El id de la linea sintetica de ARL, que no vive en la lista editable. */
export const ID_ARL = 'arl'

/**
 * Las lineas de aporte que de verdad se le aplican a una persona.
 *
 * Cada linea global se mezcla con el override de ese trabajador, si lo tiene:
 * lo que el override no diga se hereda. Por eso cambiar un porcentaje en
 * Configuracion recalcula a todos los que heredan y deja quietos a los que
 * tienen override.
 *
 * Al final se agrega la linea de ARL, que no se edita en la lista sino que
 * sale de la clase de riesgo de la persona.
 */
export function lineasAporteDe(
  trabajador: Trabajador,
  parametros: ParametrosCalculo,
): LineaEfectiva[] {
  const out: LineaEfectiva[] = []

  for (const linea of parametros.aportes_empleador ?? []) {
    const override = trabajador.aportes_override?.[linea.id]
    out.push({
      id: linea.id,
      grupo: linea.grupo,
      nombre: linea.nombre,
      pct: override?.pct ?? linea.pct,
      activo: override?.activo ?? linea.activo,
      cuando_corresponda: linea.cuando_corresponda,
      base_con_auxilio: linea.base_con_auxilio === true,
      origen: override ? 'trabajador' : 'global',
    })
  }

  // ARL: sale de la clase de riesgo, no de la lista
  const arl = parametros.arl_clases?.[trabajador.clase_riesgo]
  if (arl != null) {
    const override = trabajador.aportes_override?.[ID_ARL]
    out.push({
      id: ID_ARL,
      grupo: 'seguridad_social',
      nombre: `ARL clase ${trabajador.clase_riesgo}`,
      pct: override?.pct ?? arl,
      activo: override?.activo ?? true,
      cuando_corresponda: false,
      // la ARL va sobre el salario, nunca sobre el auxilio
      base_con_auxilio: false,
      origen: override ? 'trabajador' : 'global',
    })
  }

  return out
}

/**
 * EL FACTOR PRESTACIONAL, DERIVADO.
 *
 *   factor = (suma de los pct de las lineas activas de esa persona) / 100
 *
 * Ya no es un numero que alguien escribe: sale de las lineas, asi que se
 * puede ver de donde viene cada punto y cambiarlo uno por uno. Con todas las
 * lineas de la semilla y ARL clase III da 0.53766, o sea que la hora cuesta
 * un 53,766% mas que el salario puro.
 *
 * COMPATIBILIDAD: si `aportes_empleador` viene vacio (una configuracion vieja
 * guardada en el navegador), se cae al `factor_prestacional` de un solo numero
 * que se usaba antes. Asi nada deja de calcular de un dia para otro.
 */
export function factorPrestacionalDe(
  trabajador: Trabajador,
  parametros: ParametrosCalculo,
): number {
  if (usaFactorLegado(parametros)) return parametros.factor_prestacional ?? 0
  return lineasAporteDe(trabajador, parametros)
    .filter((l) => l.activo)
    .reduce((s, l) => s + l.pct, 0) / 100
}

/**
 * Si hay que calcular con el factor viejo de un solo numero.
 *
 * Solo cuando no hay NINGUNA linea configurada y si existe el factor legado.
 * Se mira `aportes_empleador` y no el resultado de `lineasAporteDe`, porque
 * esa funcion siempre agrega la linea de ARL y entonces el legado nunca se
 * activaria.
 */
export function usaFactorLegado(parametros: ParametrosCalculo): boolean {
  return (parametros.aportes_empleador ?? []).length === 0 && parametros.factor_prestacional != null
}

/**
 * El factor de una persona «promedio»: el que se ve en Configuracion.
 *
 * Usa la clase de ARL que se le pase (por defecto la II) porque el factor
 * global no es de nadie en concreto: es el que heredan los que no tienen
 * override, y cada quien lo mueve con su propia clase de riesgo.
 */
export function factorGlobal(
  parametros: ParametrosCalculo,
  clase: ClaseRiesgoARL = 'II',
): number {
  return factorPrestacionalDe(
    { clase_riesgo: clase, aportes_override: undefined } as Trabajador,
    parametros,
  )
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
  // se arma desde la lista de tipos para que agregar uno nuevo no deje un
  // `undefined` suelto en el registro
  const out = Object.fromEntries(TIPOS_HORA_REGISTRO.map((t) => [t, 0])) as Record<
    TipoHoraRegistro,
    number
  >

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
  return prorrateoDe(trabajador, horas, parametros).salario
}

/**
 * El salario del periodo y el detalle de por que bajo, si bajo.
 *
 * Con `prorratear_ordinarias` encendido, las horas que falten para completar
 * la jornada se tratan igual que una ausencia. Solo prorratea si hay alguna
 * hora registrada: a quien no tenga tarjeta de tiempo no se le deja el sueldo
 * en cero por un descuido.
 */
export function prorrateoDe(
  trabajador: Trabajador,
  horas: Record<TipoHoraRegistro, number>,
  parametros: ParametrosCalculo,
): { salario: number; esperadas: number; descontadas: number; descuento: number } {
  const vh = valorHora(trabajador, parametros)
  const esperadas = Math.max(0, parametros.horas_mes)

  if (trabajador.modalidad === 'por_hora') {
    // aqui no hay nada que prorratear: se paga lo que se trabajo
    return { salario: horas.ordinaria * vh, esperadas, descontadas: 0, descuento: 0 }
  }

  const hayRegistro = horas.ordinaria > 0 || horas.ausencia > 0
  const faltantes =
    parametros.prorratear_ordinarias === true && hayRegistro
      ? Math.max(0, esperadas - horas.ordinaria - horas.ausencia)
      : 0

  const descontadas = horas.ausencia + faltantes
  const descuento = Math.min(trabajador.salario_basico, descontadas * vh)

  return {
    salario: Math.max(0, trabajador.salario_basico - descuento),
    esperadas,
    descontadas,
    descuento,
  }
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
  const prorrateo = prorrateoDe(trabajador, horas, parametros)
  const base = prorrateo.salario

  if (prorrateo.descuento > 0) {
    alertas.push(
      `Se le descontaron ${prorrateo.descontadas} h del salario del mes (${Math.round(prorrateo.descuento).toLocaleString('es-CO')} pesos).`,
    )
  }

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
  /**
   * El auxilio de transporte del periodo.
   *
   * Se guarda aparte porque es la SEGUNDA BASE de la nomina: no causa
   * pension, salud, ARL ni parafiscales, pero si entra a cesantias, prima e
   * intereses. Las lineas marcadas con `base_con_auxilio` se calculan sobre
   * IBC + esto.
   */
  let auxilio_transporte = 0

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
    else if (c.requiere_auxilio_transporte) auxilio_transporte += monto
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

  /*
    LO QUE PAGA EL EMPLEADOR POR ENCIMA DEL SALARIO.

    Se calcula linea por linea sobre el IBC, que es el DEVENGADO SALARIAL
    (`base_prestacional`), no el total devengado: el auxilio de transporte y
    las bonificaciones no salariales no causan aportes. Por eso el costo
    empresa es `devengado + suma de las lineas`, y el desglose cuadra exacto.
  */
  const aportes: LineaAporte[] = []
  let carga_prestacional = 0

  if (usaFactorLegado(parametros)) {
    // configuracion vieja: un solo numero, aplicado sobre el IBC igual
    carga_prestacional = base_prestacional * (parametros.factor_prestacional ?? 0)
    aportes.push({
      id: 'factor_legado',
      grupo: 'prestaciones',
      nombre: 'Factor prestacional (configuración antigua)',
      pct: (parametros.factor_prestacional ?? 0) * 100,
      base: base_prestacional,
      monto: carga_prestacional,
      origen: 'global',
    })
  } else {
    /*
      LAS DOS BASES. Casi todo va sobre el IBC salarial; cesantias, prima e
      intereses sobre cesantias van sobre el IBC MAS el auxilio de transporte.
      Cada linea dice cual le toca y `LineaAporte.base` deja registrado con
      cual se calculo, para que el desglose se pueda auditar renglon por
      renglon.
    */
    const baseAmpliada = base_prestacional + auxilio_transporte

    for (const l of lineasAporteDe(trabajador, parametros)) {
      if (!l.activo || l.pct === 0) continue
      const baseLinea = l.base_con_auxilio ? baseAmpliada : base_prestacional
      const monto = (baseLinea * l.pct) / 100
      carga_prestacional += monto
      aportes.push({
        id: l.id,
        grupo: l.grupo,
        nombre: l.nombre,
        pct: l.pct,
        base: baseLinea,
        monto,
        origen: l.origen,
      })
    }
  }

  const costo_empresa = total_devengado + carga_prestacional

  /*
    EL FACTOR QUE SE REPORTA ES EL EFECTIVO: carga / IBC.

    Mientras todas las lineas vayan sobre el IBC salarial, el efectivo es
    identico a la suma de los porcentajes. Pero si alguna va sobre el IBC mas
    el auxilio, la carga real es mayor que esa suma, y reportar la suma seria
    mentir sobre lo que cuesta la hora. Con IBC en cero no hay division
    posible y se cae al nominal.
  */
  const factorNominal = factorPrestacionalDe(trabajador, parametros)
  const factor = base_prestacional > 0 ? carga_prestacional / base_prestacional : factorNominal

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
    auxilio_transporte,
    lineas,
    total_deducciones,
    neto_pagar,
    aportes,
    carga_prestacional,
    costo_empresa,
    factor_prestacional: factor,
    costo_hora_cargado: vh * (1 + factor),
    horas_pagadas,
    horas_esperadas: prorrateo.esperadas,
    horas_descontadas: prorrateo.descontadas,
    descuento_por_horas: prorrateo.descuento,
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
 * LA TARIFA REAL DE UNA HORA, sacada de la liquidacion del periodo.
 *
 *   tarifa = costo_empresa / horas de la jornada del periodo
 *
 * Es lo que de verdad costo una hora de esa persona ese mes: salario,
 * auxilio, extras, prestaciones y aportes, todo adentro. Se divide entre las
 * horas de la JORNADA (`horas_esperadas`), no entre las que se imputaron a
 * ordenes, y eso es a proposito: el costo de una hora no sube porque la
 * persona haya estado quieta media jornada. Lo que pasa es que esas horas
 * quietas no las absorbe ninguna orden, y esa diferencia es el tiempo ocioso
 * —que `cuadreHorasDirectas` mide y reporta aparte—.
 *
 * Cuando la persona tiene varias liquidaciones en el mapa (varios periodos),
 * se suman costos y horas: la tarifa es la del conjunto.
 *
 * Devuelve un mapa trabajador -> tarifa. Una persona sin liquidacion no
 * aparece, y quien la use tiene que caer a `valorHora`.
 */
export function tarifaPorLiquidacion(
  liquidaciones: readonly Liquidacion[],
): Record<ID, number> {
  const acumulado: Record<ID, { costo: number; horas: number }> = {}

  for (const l of liquidaciones) {
    const a = (acumulado[l.trabajador_id] ??= { costo: 0, horas: 0 })
    a.costo += l.costo_empresa
    a.horas += l.horas_esperadas
  }

  const out: Record<ID, number> = {}
  for (const [id, a] of Object.entries(acumulado)) {
    if (a.horas > 0) out[id] = a.costo / a.horas
  }
  return out
}

/** Si la MOD se costea con la tarifa real del periodo en vez del valor hora. */
export function usaTarifaDeLiquidacion(parametros: ParametrosCalculo): boolean {
  return parametros.tarifa_mod_desde === 'liquidacion'
}

/**
 * Reparte las horas imputadas entre las ordenes y las valora.
 *
 * DOS MANERAS DE PONERLE PRECIO A LA HORA, segun `tarifa_mod_desde`:
 *
 *   'valor_hora' (por defecto)
 *       costo_MOD = horas × valor_hora × recargo × (1 + factor)
 *     El factor va o no segun `mod_con_factor_prestacional` (por defecto SI:
 *     la hoja se lleva el costo-empresa de la hora). Las dos cifras quedan en
 *     cada linea, asi que se puede comparar sin recalcular nada.
 *
 *   'liquidacion'
 *       costo_MOD = horas × (costo_empresa del periodo / horas de la jornada) × recargo
 *     La tarifa sale de `tarifas` y YA trae prestaciones y auxilio, asi que el
 *     factor no se vuelve a aplicar. Es el metodo de los talleres. Si una
 *     persona no tiene liquidacion en el mapa, se cae al valor hora y se avisa.
 *
 * Una `tarifa_hora` escrita en la asignacion manda sobre las dos: es la
 * valvula de escape para forzar una tarifa en un ejercicio.
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
  /** Tarifa real por trabajador, de `tarifaPorLiquidacion`. Solo se mira en modo 'liquidacion'. */
  tarifas: Record<ID, number> = {},
): { porOrden: Record<ID, ManoObraOrden>; alertas: AlertaNomina[] } {
  const porId = new Map(trabajadores.map((t) => [t.id, t]))
  const desdeLiquidacion = usaTarifaDeLiquidacion(parametros)
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
  /** Para no repetir el aviso de «sin liquidación» una vez por asignación. */
  const avisadosSinLiquidacion = new Set<ID>()

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

    /*
      DE DONDE SALE LA TARIFA, en orden de prioridad:

        1. la que diga la asignacion (forzar una tarifa en un ejercicio)
        2. la real del periodo, si se pidio el modo 'liquidacion'
        3. el valor hora del trabajador

      `tarifaTraePrestaciones` recuerda si el numero que quedo ya incluye
      prestaciones y auxilio. Importa, porque de eso depende que se aplique o
      no el factor despues: aplicarlo sobre una tarifa que ya las trae seria
      cobrarlas dos veces.
    */
    const deLiquidacion = desdeLiquidacion ? tarifas[trabajador.id] : undefined

    if (desdeLiquidacion && a.tarifa_hora == null && deLiquidacion == null) {
      if (!avisadosSinLiquidacion.has(trabajador.id)) {
        avisadosSinLiquidacion.add(trabajador.id)
        alertas.push({
          clase: 'sin_tarifa',
          orden_id: a.orden_id,
          trabajador_id: trabajador.id,
          mensaje:
            `${trabajador.nombre} no tiene nómina liquidada en ningún período, así que no hay tarifa real ` +
            'que usar: sus horas se costearon con el valor hora del salario. Liquidá el período y vuelve a cuadrar.',
        })
      }
    }

    const vh = a.tarifa_hora ?? deLiquidacion ?? valorHora(trabajador, parametros)
    const tarifaTraePrestaciones = a.tarifa_hora == null && deLiquidacion != null

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
    /*
      El factor es el de ESA persona: sus lineas y su clase de ARL. Y no se
      aplica cuando la tarifa ya viene de la liquidacion, porque ahi las
      prestaciones ya estan adentro.
    */
    const costo_empresa = tarifaTraePrestaciones
      ? costo_salario
      : costo_salario * (1 + factorPrestacionalDe(trabajador, parametros))

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
      total: conFactor || tarifaTraePrestaciones ? costo_empresa : costo_salario,
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
