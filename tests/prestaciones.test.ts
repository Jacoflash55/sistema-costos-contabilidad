import { describe, expect, it } from 'vitest'

import {
  TIPOS_HORA_REGISTRO,
  costoHoraCargado,
  factorGlobal,
  factorPrestacionalDe,
  lineasAporteDe,
  liquidar,
  prorrateoDe,
  valorHora,
} from '../src/lib/nomina'
import type {
  AporteEmpleador,
  ParametrosCalculo,
  PeriodoNomina,
  RegistroHoras,
  TipoHoraRegistro,
  Trabajador,
} from '../src/lib/tipos'

/*
  Las prestaciones desglosadas, tal como quedan en la semilla:

    prestaciones      8,33 + 8,33 + 1,00 + 4,17 = 21,83%
    seguridad social  12 + 8,5                  = 20,50%
    parafiscales      4 + 2 + 3                 =  9,00%
                                                  -------
    suma de las líneas                            51,33%
    + ARL clase III                                2,436%
                                                  -------
    factor                                        53,766%
*/
const APORTES: AporteEmpleador[] = [
  { id: 'cesantias', grupo: 'prestaciones', nombre: 'Cesantías', pct: 8.33, activo: true, cuando_corresponda: false },
  { id: 'prima', grupo: 'prestaciones', nombre: 'Prima', pct: 8.33, activo: true, cuando_corresponda: false },
  { id: 'intereses_cesantias', grupo: 'prestaciones', nombre: 'Intereses', pct: 1.0, activo: true, cuando_corresponda: false },
  { id: 'vacaciones', grupo: 'prestaciones', nombre: 'Vacaciones', pct: 4.17, activo: true, cuando_corresponda: false },
  { id: 'pension_empleador', grupo: 'seguridad_social', nombre: 'Pensión', pct: 12, activo: true, cuando_corresponda: false },
  { id: 'salud_empleador', grupo: 'seguridad_social', nombre: 'Salud', pct: 8.5, activo: true, cuando_corresponda: true },
  { id: 'caja', grupo: 'parafiscales', nombre: 'Caja', pct: 4, activo: true, cuando_corresponda: false },
  { id: 'sena', grupo: 'parafiscales', nombre: 'SENA', pct: 2, activo: true, cuando_corresponda: true },
  { id: 'icbf', grupo: 'parafiscales', nombre: 'ICBF', pct: 3, activo: true, cuando_corresponda: false },
]

const ARL = { I: 0.522, II: 1.044, III: 2.436, IV: 4.35, V: 6.96 }

const P: ParametrosCalculo = {
  horas_mes: 240,
  recargos: {
    extra_diurna: 1.25,
    extra_nocturna: 1.75,
    recargo_nocturno: 0.35,
    dominical: 0.9,
    recargo_nocturno_dominical: 1.25,
    extra_diurna_dominical: 2.15,
    extra_nocturna_dominical: 2.65,
  },
  aportes_empleador: APORTES,
  arl_clases: ARL,
  mod_con_factor_prestacional: true,
  metodo_inventario: 'promedio_ponderado',
  base_cif: 'unidades',
  metodo_margen: 'sobre_costo',
  margen_por_defecto_pct: 30,
  redondeo_precio_multiplo: 100,
}

const PERIODO: PeriodoNomina = {
  id: 'per1',
  nombre: 'Septiembre 2026',
  mes: '2026-09',
  desde: '2026-09-01',
  hasta: '2026-09-30',
  estado: 'abierto',
}

function trabajador(p: Partial<Trabajador> & { id: string }): Trabajador {
  return {
    codigo: p.id.toUpperCase(),
    nombre: `Trabajador ${p.id}`,
    cargo: 'Operario',
    area: 'Planta',
    clasificacion: 'directa',
    modalidad: 'mensual',
    salario_basico: 1_440_000,
    tarifa_hora: 0,
    tiene_auxilio_transporte: false,
    tipo_contrato: 'termino_indefinido',
    clase_riesgo: 'III',
    fecha_ingreso: '2025-01-01',
    activo: true,
    ...p,
  }
}

/** Un registro de horas con todo en cero menos lo que se le pase. */
function horasVacias(p: Partial<Record<TipoHoraRegistro, number>> = {}): Record<TipoHoraRegistro, number> {
  const base = Object.fromEntries(TIPOS_HORA_REGISTRO.map((t) => [t, 0])) as Record<
    TipoHoraRegistro,
    number
  >
  return { ...base, ...p }
}

let n = 0
function horas(trabajadorId: string, tipo: TipoHoraRegistro, cantidad: number): RegistroHoras {
  n += 1
  return {
    id: `h${n}`,
    trabajador_id: trabajadorId,
    periodo_id: PERIODO.id,
    fecha: PERIODO.hasta,
    tipo_hora: tipo,
    horas: cantidad,
  }
}

// =====================================================================
// 1. EL FACTOR SE DERIVA DE LAS LINEAS
// =====================================================================

describe('el factor prestacional ya no se escribe: se deriva', () => {
  it('es la suma de las líneas activas más la ARL de esa persona', () => {
    expect(factorPrestacionalDe(trabajador({ id: 'a' }), P)).toBeCloseTo(0.53766, 10)
  })

  it('cambiar la clase de riesgo cambia el factor y nada más', () => {
    const baja = factorPrestacionalDe(trabajador({ id: 'a', clase_riesgo: 'I' }), P)
    const alta = factorPrestacionalDe(trabajador({ id: 'b', clase_riesgo: 'V' }), P)
    expect(baja).toBeCloseTo(0.51852, 10) // 51,33 + 0,522
    expect(alta).toBeCloseTo(0.5829, 10) // 51,33 + 6,96
    expect(alta - baja).toBeCloseTo((6.96 - 0.522) / 100, 10)
  })

  it('apagar una línea la saca del factor', () => {
    const sinSalud: ParametrosCalculo = {
      ...P,
      aportes_empleador: APORTES.map((a) => (a.id === 'salud_empleador' ? { ...a, activo: false } : a)),
    }
    expect(factorPrestacionalDe(trabajador({ id: 'a' }), sinSalud)).toBeCloseTo(0.53766 - 0.085, 10)
  })

  it('subir un porcentaje sube el factor en la misma proporción', () => {
    const subida: ParametrosCalculo = {
      ...P,
      aportes_empleador: APORTES.map((a) => (a.id === 'pension_empleador' ? { ...a, pct: 13 } : a)),
    }
    expect(factorPrestacionalDe(trabajador({ id: 'a' }), subida)).toBeCloseTo(0.53766 + 0.01, 10)
  })

  it('la exoneración del Art. 114-1 apaga salud y SENA: 10,5 puntos menos', () => {
    const exonerado: ParametrosCalculo = {
      ...P,
      aportes_empleador: APORTES.map((a) => (a.cuando_corresponda ? { ...a, activo: false } : a)),
    }
    // en esta semilla de prueba solo salud (8,5) y SENA (2) estan marcadas
    expect(factorPrestacionalDe(trabajador({ id: 'a' }), exonerado)).toBeCloseTo(0.53766 - 0.105, 10)
  })

  it('sin líneas se cae al factor viejo de un solo número', () => {
    const viejo: ParametrosCalculo = { ...P, aportes_empleador: [], factor_prestacional: 0.42 }
    expect(factorPrestacionalDe(trabajador({ id: 'a' }), viejo)).toBe(0.42)
  })

  it('el factor global de Configuración no es de nadie en concreto', () => {
    expect(factorGlobal(P, 'III')).toBeCloseTo(0.53766, 10)
    expect(factorGlobal(P, 'I')).toBeCloseTo(0.51852, 10)
  })

  it('la hora cargada usa el factor de esa persona', () => {
    const t = trabajador({ id: 'a', salario_basico: 2_400_000 })
    expect(valorHora(t, P)).toBe(10_000)
    expect(costoHoraCargado(t, P)).toBeCloseTo(15_376.6, 6)
  })
})

// =====================================================================
// 2. OVERRIDE POR TRABAJADOR
// =====================================================================

describe('override de prestaciones por trabajador', () => {
  const hereda = trabajador({ id: 'h' })
  const propio = trabajador({
    id: 'p',
    // este gana 10 SMLMV o más y además le negociaron otra pensión
    aportes_override: { pension_empleador: { pct: 16 } },
  })

  it('la línea con override usa su propio porcentaje', () => {
    const pension = lineasAporteDe(propio, P).find((l) => l.id === 'pension_empleador')!
    expect(pension.pct).toBe(16)
    expect(pension.origen).toBe('trabajador')
  })

  it('lo que el override no diga se hereda', () => {
    const cesantias = lineasAporteDe(propio, P).find((l) => l.id === 'cesantias')!
    expect(cesantias.pct).toBe(8.33)
    expect(cesantias.origen).toBe('global')
  })

  it('cambiar el porcentaje global recalcula al que hereda y NO al que tiene override', () => {
    const antesHereda = factorPrestacionalDe(hereda, P)
    const antesPropio = factorPrestacionalDe(propio, P)

    // la empresa sube la pensión del 12% al 13% para todos
    const subida: ParametrosCalculo = {
      ...P,
      aportes_empleador: APORTES.map((a) => (a.id === 'pension_empleador' ? { ...a, pct: 13 } : a)),
    }

    expect(factorPrestacionalDe(hereda, subida)).toBeCloseTo(antesHereda + 0.01, 10)
    expect(factorPrestacionalDe(propio, subida)).toBe(antesPropio)
  })

  it('un override puede apagar una línea solo para esa persona', () => {
    const sinIcbf = trabajador({ id: 'x', aportes_override: { icbf: { activo: false } } })
    expect(factorPrestacionalDe(sinIcbf, P)).toBeCloseTo(0.53766 - 0.03, 10)
    // el que hereda no se movió
    expect(factorPrestacionalDe(hereda, P)).toBeCloseTo(0.53766, 10)
  })

  it('también se puede forzar otra ARL para una persona', () => {
    const t = trabajador({ id: 'y', clase_riesgo: 'I', aportes_override: { arl: { pct: 6.96 } } })
    expect(factorPrestacionalDe(t, P)).toBeCloseTo(0.5829, 10)
  })

  it('en la liquidación el desglose dice de dónde salió cada línea', () => {
    const l = liquidar({
      trabajador: propio,
      periodo: PERIODO,
      horas: [horas('p', 'ordinaria', 240)],
      novedades: [],
      conceptos: [],
      parametros: P,
    })
    const pension = l.aportes.find((a) => a.id === 'pension_empleador')!
    expect(pension.origen).toBe('trabajador')
    expect(pension.pct).toBe(16)
    expect(l.aportes.filter((a) => a.origen === 'global').length).toBeGreaterThan(5)
  })
})

// =====================================================================
// 3. EL DESGLOSE SUMA EXACTO
// =====================================================================

describe('costo-empresa = devengado + Σ aportes', () => {
  const l = liquidar({
    trabajador: trabajador({ id: 'a' }),
    periodo: PERIODO,
    horas: [horas('a', 'ordinaria', 240), horas('a', 'extra_diurna', 10)],
    novedades: [],
    conceptos: [],
    parametros: P,
  })

  it('una línea por cada aporte activo, más la de ARL', () => {
    expect(l.aportes).toHaveLength(APORTES.length + 1)
    expect(l.aportes.some((a) => a.id === 'arl')).toBe(true)
  })

  it('cada línea se calculó sobre el IBC', () => {
    // 1.440.000 de salario + 10 h x 6.000 x 1,25 = 75.000
    expect(l.base_prestacional).toBe(1_515_000)
    expect(l.aportes.every((a) => a.base === 1_515_000)).toBe(true)
    const cesantias = l.aportes.find((a) => a.id === 'cesantias')!
    expect(cesantias.monto).toBeCloseTo(1_515_000 * 0.0833, 6)
  })

  it('el desglose suma exactamente la carga prestacional', () => {
    const suma = l.aportes.reduce((s, a) => s + a.monto, 0)
    expect(suma).toBeCloseTo(l.carga_prestacional, 6)
    expect(l.carga_prestacional).toBeCloseTo(1_515_000 * 0.53766, 6)
  })

  it('y el costo-empresa es el devengado más esa suma', () => {
    expect(l.costo_empresa).toBeCloseTo(l.total_devengado + l.carga_prestacional, 6)
    expect(l.factor_prestacional).toBeCloseTo(0.53766, 10)
  })

  it('el IBC es el devengado SALARIAL: el auxilio no causa aportes', () => {
    const conAuxilio = liquidar({
      trabajador: trabajador({ id: 'a', tiene_auxilio_transporte: true }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [],
      conceptos: [
        {
          id: 'auxilio',
          nombre: 'Auxilio de transporte',
          tipo: 'devengado',
          base: 'fijo',
          porcentaje: null,
          monto_fijo: 200_000,
          afecta_base_prestacional: false,
          automatico: true,
          requiere_auxilio_transporte: true,
          activo: true,
        },
      ],
      parametros: P,
    })

    expect(conAuxilio.total_devengado).toBe(1_640_000)
    // el IBC se queda en el salario: el auxilio no es salarial
    expect(conAuxilio.base_prestacional).toBe(1_440_000)
    expect(conAuxilio.carga_prestacional).toBeCloseTo(1_440_000 * 0.53766, 6)
    expect(conAuxilio.costo_empresa).toBeCloseTo(1_640_000 + 1_440_000 * 0.53766, 6)
  })
})

// =====================================================================
// 4. PRORRATEO POR HORAS
// =====================================================================

describe('prorrateo del salario mensual', () => {
  const t = trabajador({ id: 'a', salario_basico: 1_440_000 })

  it('apagado: trabajar menos horas no baja el salario, solo las ausencias', () => {
    const r = prorrateoDe(t, horasVacias({ ordinaria: 200 }), P)
    expect(r.salario).toBe(1_440_000)
    expect(r.esperadas).toBe(240)
    expect(r.descontadas).toBe(0)
    expect(r.descuento).toBe(0)
  })

  it('encendido: las horas que faltan se descuentan como una ausencia', () => {
    const con = { ...P, prorratear_ordinarias: true }
    const r = prorrateoDe(t, horasVacias({ ordinaria: 200 }), con)
    expect(r.descontadas).toBe(40) // faltan 40 h
    expect(r.descuento).toBe(240_000) // x 6.000
    expect(r.salario).toBe(1_200_000)
  })

  it('las ausencias registradas cuentan dentro de las horas esperadas', () => {
    const con = { ...P, prorratear_ordinarias: true }
    const r = prorrateoDe(t, horasVacias({ ordinaria: 200, ausencia: 40 }), con)
    // 200 + 40 = 240: no falta nada, solo se descuentan las 40 de ausencia
    expect(r.descontadas).toBe(40)
    expect(r.salario).toBe(1_200_000)
  })

  it('sin horas registradas NO se prorratea: nadie queda en cero por descuido', () => {
    const con = { ...P, prorratear_ordinarias: true }
    const r = prorrateoDe(t, horasVacias(), con)
    expect(r.salario).toBe(1_440_000)
    expect(r.descontadas).toBe(0)
  })

  it('a un trabajador por hora no hay nada que prorratearle', () => {
    const porHora = trabajador({ id: 'b', modalidad: 'por_hora', tarifa_hora: 8000, salario_basico: 0 })
    const con = { ...P, prorratear_ordinarias: true }
    const r = prorrateoDe(porHora, horasVacias({ ordinaria: 180 }), con)
    expect(r.salario).toBe(1_440_000)
    expect(r.descuento).toBe(0)
  })

  it('la liquidación deja ver esperadas, descontadas y el descuento', () => {
    const l = liquidar({
      trabajador: t,
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 224), horas('a', 'ausencia', 16)],
      novedades: [],
      conceptos: [],
      parametros: P,
    })
    expect(l.horas_esperadas).toBe(240)
    expect(l.horas_descontadas).toBe(16)
    expect(l.descuento_por_horas).toBe(96_000)
    expect(l.salario_base_periodo).toBe(1_344_000)
    // menos devengado es menos IBC, así que también bajan los aportes
    expect(l.base_prestacional).toBe(1_344_000)
    expect(l.carga_prestacional).toBeCloseTo(1_344_000 * 0.53766, 6)
  })

  it('el descuento nunca se come más que el salario', () => {
    const r = prorrateoDe(t, horasVacias({ ausencia: 500 }), P)
    expect(r.salario).toBe(0)
    expect(r.descuento).toBe(1_440_000)
  })
})

// =====================================================================
// 5. LOS SIETE RECARGOS
// =====================================================================

describe('los siete recargos dan los valores esperados', () => {
  const liq = (tipo: TipoHoraRegistro, cantidad: number) =>
    liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', tipo, cantidad)],
      novedades: [],
      conceptos: [],
      parametros: P,
    }).extras_y_recargos

  // valor hora = 1.440.000 / 240 = 6.000
  const casos: Array<[TipoHoraRegistro, number, number]> = [
    ['extra_diurna', 1.25, 7_500],
    ['extra_nocturna', 1.75, 10_500],
    ['recargo_nocturno', 0.35, 2_100],
    ['dominical', 0.9, 5_400],
    ['recargo_nocturno_dominical', 1.25, 7_500],
    ['extra_diurna_dominical', 2.15, 12_900],
    ['extra_nocturna_dominical', 2.65, 15_900],
  ]

  for (const [tipo, factor, esperado] of casos) {
    it(`${tipo}: 1 h x $6.000 x ${factor} = $${esperado.toLocaleString('es-CO')}`, () => {
      expect(liq(tipo, 1)).toBeCloseTo(esperado, 6)
    })
  }

  it('el recargo nocturno paga solo el 35% y la extra nocturna el 175%', () => {
    expect(liq('recargo_nocturno', 10)).toBe(21_000) // 10 x 6.000 x 0,35
    expect(liq('extra_nocturna', 10)).toBe(105_000) // 10 x 6.000 x 1,75
    expect(liq('extra_nocturna', 10) / liq('recargo_nocturno', 10)).toBe(5)
  })

  it('los dominicales pagan más que sus equivalentes de día hábil', () => {
    expect(liq('recargo_nocturno_dominical', 10)).toBeGreaterThan(liq('recargo_nocturno', 10))
    expect(liq('extra_diurna_dominical', 10)).toBeGreaterThan(liq('extra_diurna', 10))
    expect(liq('extra_nocturna_dominical', 10)).toBeGreaterThan(liq('extra_nocturna', 10))
  })

  it('una hora de cada clase suma lo que suman sus factores', () => {
    const total = casos.reduce((s, [, , esperado]) => s + esperado, 0)
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: casos.map(([tipo]) => horas('a', tipo, 1)),
      novedades: [],
      conceptos: [],
      parametros: P,
    })
    expect(l.extras_y_recargos).toBeCloseTo(total, 6)
    // las 7 horas se pueden imputar a una orden; las ausencias no
    expect(l.horas_pagadas).toBe(7)
  })
})
