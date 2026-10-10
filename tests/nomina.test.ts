import { describe, expect, it } from 'vitest'

import {
  cuadreHorasDirectas,
  gastosDeNominaDelPeriodo,
  liquidar,
  liquidarPeriodo,
  manoObraIndirectaDelPeriodo,
  manoObraPorOrden,
  recargoDe,
  resumenNomina,
  salarioBasePeriodo,
  usaFactorEnMOD,
  valorHora,
} from '../src/lib/nomina'
import type {
  AsignacionMO,
  ConceptoRemuneracion,
  Novedad,
  OrdenProduccion,
  ParametrosCalculo,
  PeriodoNomina,
  RegistroHoras,
  TipoHoraRegistro,
  Trabajador,
} from '../src/lib/tipos'

/*
  Números elegidos para poder verificarlos a mano:

    horas_mes = 240   -> un salario de $1.440.000 da una hora de $6.000 exactos
    factor    = 0,5   -> el costo-empresa es devengado x 1,5
    recargos  = los de la semilla (1,25 / 1,75 / 0,35 / 0,75)
*/
const PARAMETROS: ParametrosCalculo = {
  horas_mes: 240,
  recargos: {
    extra_diurna: 1.25,
    extra_nocturna: 1.75,
    recargo_nocturno: 0.35,
    dominical: 0.75,
  },
  factor_prestacional: 0.5,
  mod_con_factor_prestacional: true,
  metodo_inventario: 'promedio_ponderado',
  base_cif: 'unidades',
  metodo_margen: 'sobre_costo',
  margen_por_defecto_pct: 30,
  redondeo_precio_multiplo: 100,
}

const PERIODO: PeriodoNomina = {
  id: 'per1',
  nombre: 'Febrero 2026',
  mes: '2026-02',
  desde: '2026-02-01',
  hasta: '2026-02-28',
  estado: 'abierto',
}

/** Salud y pensión al 4%, para que las deducciones den números redondos. */
const CONCEPTOS: ConceptoRemuneracion[] = [
  {
    id: 'salud',
    nombre: 'Salud',
    tipo: 'deduccion',
    base: 'base_prestacional',
    porcentaje: 4,
    monto_fijo: null,
    afecta_base_prestacional: false,
    automatico: true,
    activo: true,
  },
  {
    id: 'pension',
    nombre: 'Pensión',
    tipo: 'deduccion',
    base: 'base_prestacional',
    porcentaje: 4,
    monto_fijo: null,
    afecta_base_prestacional: false,
    automatico: true,
    activo: true,
  },
]

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
    fecha_ingreso: '2025-01-01',
    activo: true,
    ...p,
  }
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
// 1. VALOR DE LA HORA
// =====================================================================

describe('valor de la hora', () => {
  it('un mensual divide el salario entre las horas del mes', () => {
    expect(valorHora(trabajador({ id: 'a' }), PARAMETROS)).toBe(6000)
  })

  it('un por hora usa su tarifa tal cual', () => {
    const t = trabajador({ id: 'b', modalidad: 'por_hora', tarifa_hora: 8000, salario_basico: 0 })
    expect(valorHora(t, PARAMETROS)).toBe(8000)
  })

  it('cambiar las horas del mes cambia el valor hora de un mensual', () => {
    const t = trabajador({ id: 'a' })
    expect(valorHora(t, { ...PARAMETROS, horas_mes: 192 })).toBe(7500)
  })

  it('no da Infinity con horas_mes en cero', () => {
    const t = trabajador({ id: 'a' })
    expect(valorHora(t, { ...PARAMETROS, horas_mes: 0 })).toBe(0)
  })

  it('los recargos salen de la configuración, y ordinaria es 1 y ausencia 0', () => {
    expect(recargoDe('ordinaria', PARAMETROS)).toBe(1)
    expect(recargoDe('ausencia', PARAMETROS)).toBe(0)
    expect(recargoDe('extra_diurna', PARAMETROS)).toBe(1.25)
    expect(recargoDe('extra_nocturna', PARAMETROS)).toBe(1.75)
    expect(recargoDe('recargo_nocturno', PARAMETROS)).toBe(0.35)
    expect(recargoDe('dominical', PARAMETROS)).toBe(0.75)
  })
})

// =====================================================================
// 2. EL ERROR QUE NO HAY QUE COMETER
// =====================================================================

describe('un salario mensual NO se multiplica por las horas', () => {
  const t = trabajador({ id: 'a', salario_basico: 1_440_000 })

  it('el salario del período es el salario, trabaje 200 o 240 horas', () => {
    const base200 = salarioBasePeriodo(
      t,
      { ordinaria: 200, extra_diurna: 0, extra_nocturna: 0, recargo_nocturno: 0, dominical: 0, ausencia: 0 },
      PARAMETROS,
    )
    const base240 = salarioBasePeriodo(
      t,
      { ordinaria: 240, extra_diurna: 0, extra_nocturna: 0, recargo_nocturno: 0, dominical: 0, ausencia: 0 },
      PARAMETROS,
    )

    expect(base200).toBe(1_440_000)
    expect(base240).toBe(1_440_000)
    // el error clásico sería 200 x $6.000 = $1.200.000
    expect(base200).not.toBe(1_200_000)
  })

  it('un por hora SÍ multiplica sus horas ordinarias por la tarifa', () => {
    const porHora = trabajador({ id: 'b', modalidad: 'por_hora', tarifa_hora: 8000, salario_basico: 0 })
    const base = salarioBasePeriodo(
      porHora,
      { ordinaria: 180, extra_diurna: 0, extra_nocturna: 0, recargo_nocturno: 0, dominical: 0, ausencia: 0 },
      PARAMETROS,
    )
    expect(base).toBe(1_440_000)
  })
})

// =====================================================================
// 3. LIQUIDACION POR MODALIDAD
// =====================================================================

describe('liquidación de un trabajador MENSUAL', () => {
  /*
      salario del período                        $1.440.000
      10 h extra nocturna: 10 x 6.000 x 1,75     $  105.000
                                                 ----------
      total devengado                            $1.545.000
      salud 4% + pensión 4% de 1.545.000         $  123.600
                                                 ----------
      neto a pagar                               $1.421.400
      costo empresa: 1.545.000 x 1,5             $2.317.500
  */
  const t = trabajador({ id: 'a' })
  const l = liquidar({
    trabajador: t,
    periodo: PERIODO,
    horas: [horas('a', 'ordinaria', 200), horas('a', 'extra_nocturna', 10)],
    novedades: [],
    conceptos: CONCEPTOS,
    parametros: PARAMETROS,
  })

  it('el salario base no depende de las horas ordinarias', () => {
    expect(l.salario_base_periodo).toBe(1_440_000)
  })

  it('las horas ordinarias se cuentan pero no se pagan aparte', () => {
    const linea = l.lineas_horas.find((h) => h.tipo_hora === 'ordinaria')!
    expect(linea.horas).toBe(200)
    expect(linea.se_paga).toBe(false)
    expect(linea.monto).toBe(0)
  })

  it('la extra nocturna se paga con su recargo', () => {
    const linea = l.lineas_horas.find((h) => h.tipo_hora === 'extra_nocturna')!
    expect(linea.recargo).toBe(1.75)
    expect(linea.monto).toBe(105_000)
    expect(l.extras_y_recargos).toBe(105_000)
  })

  it('devengado, deducciones y neto', () => {
    expect(l.total_devengado).toBe(1_545_000)
    expect(l.total_deducciones).toBe(123_600)
    expect(l.neto_pagar).toBe(1_421_400)
  })

  it('el costo para la empresa es devengado x (1 + factor)', () => {
    expect(l.costo_empresa).toBe(2_317_500)
    expect(l.carga_prestacional).toBe(772_500)
  })

  it('el neto y el costo-empresa son cifras distintas, y en el orden correcto', () => {
    expect(l.neto_pagar).toBeLessThan(l.total_devengado)
    expect(l.costo_empresa).toBeGreaterThan(l.total_devengado)
    expect(l.neto_pagar).not.toBe(l.costo_empresa)
  })

  it('la hora cargada sirve para costear órdenes', () => {
    expect(l.valor_hora).toBe(6000)
    expect(l.costo_hora_cargado).toBe(9000)
  })
})

describe('liquidación de un trabajador POR HORA', () => {
  /*
      180 h ordinarias x $8.000                  $1.440.000
      5 h extra diurna: 5 x 8.000 x 1,25         $   50.000
                                                 ----------
      total devengado                            $1.490.000
      salud 4% + pensión 4%                       $  119.200
                                                 ----------
      neto a pagar                               $1.370.800
      costo empresa: 1.490.000 x 1,5             $2.235.000
  */
  const t = trabajador({ id: 'b', modalidad: 'por_hora', tarifa_hora: 8000, salario_basico: 0 })
  const l = liquidar({
    trabajador: t,
    periodo: PERIODO,
    horas: [horas('b', 'ordinaria', 180), horas('b', 'extra_diurna', 5)],
    novedades: [],
    conceptos: CONCEPTOS,
    parametros: PARAMETROS,
  })

  it('las horas ordinarias son el salario del período', () => {
    expect(l.salario_base_periodo).toBe(1_440_000)
    const linea = l.lineas_horas.find((h) => h.tipo_hora === 'ordinaria')!
    expect(linea.se_paga).toBe(true)
    expect(linea.monto).toBe(1_440_000)
  })

  it('las ordinarias no se cuentan dos veces', () => {
    // están en el salario base, no en extras
    expect(l.extras_y_recargos).toBe(50_000)
    expect(l.total_devengado).toBe(1_490_000)
  })

  it('devengado, neto y costo-empresa', () => {
    expect(l.total_deducciones).toBe(119_200)
    expect(l.neto_pagar).toBe(1_370_800)
    expect(l.costo_empresa).toBe(2_235_000)
  })
})

describe('las dos modalidades dan resultados distintos', () => {
  const mensual = liquidar({
    trabajador: trabajador({ id: 'a' }),
    periodo: PERIODO,
    horas: [horas('a', 'ordinaria', 200)],
    novedades: [],
    conceptos: CONCEPTOS,
    parametros: PARAMETROS,
  })

  const porHora = liquidar({
    trabajador: trabajador({ id: 'b', modalidad: 'por_hora', tarifa_hora: 6000, salario_basico: 0 }),
    periodo: PERIODO,
    horas: [horas('b', 'ordinaria', 200)],
    novedades: [],
    conceptos: CONCEPTOS,
    parametros: PARAMETROS,
  })

  it('con las mismas 200 horas y el mismo valor hora, el mensual gana más', () => {
    // el mensual cobra su salario completo (240 h implícitas); el otro, 200 h
    expect(mensual.total_devengado).toBe(1_440_000)
    expect(porHora.total_devengado).toBe(1_200_000)
    expect(mensual.total_devengado).not.toBe(porHora.total_devengado)
    expect(mensual.neto_pagar).not.toBe(porHora.neto_pagar)
  })
})

// =====================================================================
// 4. RECARGOS, AUSENCIAS Y NOVEDADES
// =====================================================================

describe('recargos', () => {
  const liq = (tipo: TipoHoraRegistro, cantidad: number) =>
    liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', tipo, cantidad)],
      novedades: [],
      conceptos: [],
      parametros: PARAMETROS,
    })

  it('extra diurna: +25%', () => {
    expect(liq('extra_diurna', 10).extras_y_recargos).toBe(75_000) // 10 x 6.000 x 1,25
  })

  it('extra nocturna: +75%', () => {
    expect(liq('extra_nocturna', 10).extras_y_recargos).toBe(105_000) // 10 x 6.000 x 1,75
  })

  it('recargo nocturno: solo el 35% adicional', () => {
    expect(liq('recargo_nocturno', 20).extras_y_recargos).toBe(42_000) // 20 x 6.000 x 0,35
  })

  it('dominical: solo el 75% adicional', () => {
    expect(liq('dominical', 8).extras_y_recargos).toBe(36_000) // 8 x 6.000 x 0,75
  })

  it('cambiar el recargo en la configuración cambia el resultado', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'extra_nocturna', 10)],
      novedades: [],
      conceptos: [],
      parametros: { ...PARAMETROS, recargos: { ...PARAMETROS.recargos, extra_nocturna: 2 } },
    })
    expect(l.extras_y_recargos).toBe(120_000) // 10 x 6.000 x 2
  })
})

describe('ausencias', () => {
  it('a un mensual le descuentan salario', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 224), horas('a', 'ausencia', 16)],
      novedades: [],
      conceptos: [],
      parametros: PARAMETROS,
    })
    // 1.440.000 - 16 x 6.000 = 1.344.000
    expect(l.salario_base_periodo).toBe(1_344_000)
    expect(l.total_devengado).toBe(1_344_000)
  })

  it('a un por hora no le descuentan nada: esa hora no se registró', () => {
    const t = trabajador({ id: 'b', modalidad: 'por_hora', tarifa_hora: 8000, salario_basico: 0 })
    const l = liquidar({
      trabajador: t,
      periodo: PERIODO,
      horas: [horas('b', 'ordinaria', 180), horas('b', 'ausencia', 16)],
      novedades: [],
      conceptos: [],
      parametros: PARAMETROS,
    })
    expect(l.salario_base_periodo).toBe(1_440_000)
  })

  it('las ausencias no se pueden imputar a una orden: no cuentan como horas pagadas', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 200), horas('a', 'ausencia', 16)],
      novedades: [],
      conceptos: [],
      parametros: PARAMETROS,
    })
    expect(l.horas_pagadas).toBe(200)
  })

  it('un descuento mayor al salario no deja el salario en negativo', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ausencia', 500)],
      novedades: [],
      conceptos: [],
      parametros: PARAMETROS,
    })
    expect(l.salario_base_periodo).toBe(0)
  })
})

describe('novedades y conceptos configurables', () => {
  const bonificacion: ConceptoRemuneracion = {
    id: 'bono',
    nombre: 'Bonificación',
    tipo: 'devengado',
    base: 'fijo',
    porcentaje: null,
    monto_fijo: null,
    afecta_base_prestacional: false,
    automatico: false,
    activo: true,
  }
  const prestamo: ConceptoRemuneracion = {
    id: 'prestamo',
    nombre: 'Préstamo',
    tipo: 'deduccion',
    base: 'fijo',
    porcentaje: null,
    monto_fijo: null,
    afecta_base_prestacional: false,
    automatico: false,
    activo: true,
  }

  const novedad = (conceptoId: string, monto: number): Novedad => ({
    id: `n-${conceptoId}`,
    trabajador_id: 'a',
    periodo_id: PERIODO.id,
    concepto_id: conceptoId,
    monto,
  })

  it('una bonificación suma al devengado y al costo-empresa', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [novedad('bono', 100_000)],
      conceptos: [bonificacion],
      parametros: PARAMETROS,
    })
    expect(l.bonificaciones).toBe(100_000)
    expect(l.total_devengado).toBe(1_540_000)
    expect(l.costo_empresa).toBe(2_310_000) // 1.540.000 x 1,5
  })

  it('una deducción baja el neto pero NO el costo-empresa', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [novedad('prestamo', 200_000)],
      conceptos: [prestamo],
      parametros: PARAMETROS,
    })
    expect(l.total_devengado).toBe(1_440_000)
    expect(l.total_deducciones).toBe(200_000)
    expect(l.neto_pagar).toBe(1_240_000)
    // la empresa igual paga su costo completo: la deducción es plata del trabajador
    expect(l.costo_empresa).toBe(2_160_000)
  })

  it('el auxilio de transporte solo le llega a quien lo tenga marcado', () => {
    const auxilio: ConceptoRemuneracion = {
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
    }
    const con = liquidar({
      trabajador: trabajador({ id: 'a', tiene_auxilio_transporte: true }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [],
      conceptos: [auxilio],
      parametros: PARAMETROS,
    })
    const sin = liquidar({
      trabajador: trabajador({ id: 'a', tiene_auxilio_transporte: false }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [],
      conceptos: [auxilio],
      parametros: PARAMETROS,
    })
    expect(con.total_devengado).toBe(1_640_000)
    expect(sin.total_devengado).toBe(1_440_000)
  })

  it('un concepto inactivo no se aplica', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [],
      conceptos: CONCEPTOS.map((c) => ({ ...c, activo: false })),
      parametros: PARAMETROS,
    })
    expect(l.total_deducciones).toBe(0)
  })

  it('el neto nunca es negativo, y lo avisa', () => {
    const l = liquidar({
      trabajador: trabajador({ id: 'a' }),
      periodo: PERIODO,
      horas: [horas('a', 'ordinaria', 240)],
      novedades: [novedad('prestamo', 9_000_000)],
      conceptos: [prestamo],
      parametros: PARAMETROS,
    })
    expect(l.neto_pagar).toBe(0)
    expect(l.alertas.length).toBeGreaterThan(0)
  })
})

describe('el costo-empresa es exactamente devengado x (1 + factor)', () => {
  for (const factor of [0, 0.25, 0.5, 0.52, 1]) {
    it(`con factor ${factor}`, () => {
      const l = liquidar({
        trabajador: trabajador({ id: 'a' }),
        periodo: PERIODO,
        horas: [horas('a', 'ordinaria', 240), horas('a', 'extra_diurna', 7)],
        novedades: [],
        conceptos: CONCEPTOS,
        parametros: { ...PARAMETROS, factor_prestacional: factor },
      })
      expect(l.costo_empresa).toBeCloseTo(l.total_devengado * (1 + factor), 6)
      expect(l.carga_prestacional).toBeCloseTo(l.total_devengado * factor, 6)
    })
  }
})

// =====================================================================
// 5. EL PERIODO COMPLETO
// =====================================================================

describe('liquidación del período', () => {
  const trabajadores = [
    trabajador({ id: 'd1', clasificacion: 'directa', salario_basico: 1_440_000 }),
    trabajador({ id: 'd2', clasificacion: 'directa', modalidad: 'por_hora', tarifa_hora: 7000, salario_basico: 0 }),
    trabajador({ id: 'i1', clasificacion: 'indirecta', salario_basico: 2_400_000 }),
    trabajador({ id: 'ad', clasificacion: 'administracion', salario_basico: 3_000_000 }),
    trabajador({ id: 'vt', clasificacion: 'ventas', salario_basico: 1_800_000 }),
    trabajador({ id: 'ret', clasificacion: 'directa', activo: false }),
  ]

  const registros = [
    horas('d1', 'ordinaria', 240),
    horas('d2', 'ordinaria', 200),
    horas('i1', 'ordinaria', 240),
    horas('ad', 'ordinaria', 240),
    horas('vt', 'ordinaria', 240),
  ]

  const liquidaciones = liquidarPeriodo(trabajadores, PERIODO, registros, [], [], PARAMETROS)

  it('deja por fuera a los inactivos sin movimiento', () => {
    expect(liquidaciones).toHaveLength(5)
    expect(liquidaciones.some((l) => l.trabajador_id === 'ret')).toBe(false)
  })

  it('pero liquida a un inactivo que sí trabajó en el período', () => {
    const conRetirado = liquidarPeriodo(
      trabajadores,
      PERIODO,
      [...registros, horas('ret', 'ordinaria', 80)],
      [],
      [],
      PARAMETROS,
    )
    expect(conRetirado).toHaveLength(6)
  })

  it('el resumen reparte el costo-empresa por clasificación', () => {
    const r = resumenNomina(PERIODO.id, liquidaciones)
    expect(r.liquidaciones).toBe(5)

    // d1: 1.440.000 ; d2: 200 x 7.000 = 1.400.000 -> directa = 2.840.000 x 1,5
    expect(r.por_clasificacion.directa).toBe(2_840_000 * 1.5)
    expect(r.por_clasificacion.indirecta).toBe(2_400_000 * 1.5)
    expect(r.por_clasificacion.administracion).toBe(3_000_000 * 1.5)
    expect(r.por_clasificacion.ventas).toBe(1_800_000 * 1.5)

    const suma = Object.values(r.por_clasificacion).reduce((s, v) => s + v, 0)
    expect(suma).toBeCloseTo(r.total_costo_empresa, 6)
  })

  it('la MOI del período es el insumo de CIF, y no incluye nada más', () => {
    expect(manoObraIndirectaDelPeriodo(liquidaciones)).toBe(2_400_000 * 1.5)
  })

  it('administración y ventas son gasto del período, aparte', () => {
    const g = gastosDeNominaDelPeriodo(liquidaciones)
    expect(g.administracion).toBe(3_000_000 * 1.5)
    expect(g.ventas).toBe(1_800_000 * 1.5)
  })
})

// =====================================================================
// 6. IMPUTACION A LAS ORDENES
// =====================================================================

describe('mano de obra directa imputada a una orden', () => {
  const ordenes: OrdenProduccion[] = [
    {
      id: 'op1',
      numero: 'OP-001',
      producto_id: 'p1',
      cantidad_programada: 10,
      cantidad_terminada: 10,
      fecha_inicio: '2026-02-01',
      fecha_fin: '2026-02-20',
      estado: 'terminada',
    },
  ]

  const trabajadores = [
    trabajador({ id: 'd1', clasificacion: 'directa', salario_basico: 1_440_000 }),
    trabajador({ id: 'i1', clasificacion: 'indirecta', salario_basico: 2_400_000 }),
  ]

  const asignacion = (p: Partial<AsignacionMO> & { id: string }): AsignacionMO => ({
    orden_id: 'op1',
    trabajador_id: 'd1',
    fecha: '2026-02-10',
    tipo_hora: 'ordinaria',
    horas: 40,
    tarifa_hora: null,
    ...p,
  })

  it('costo = horas x valor_hora x recargo x (1 + factor)', () => {
    /*
       40 h ordinarias x $6.000           = $240.000 de salario
       4 h extra diurna x 6.000 x 1,25    = $ 30.000
                                            --------
       salario                              $270.000
       costo empresa x 1,5                  $405.000
    */
    const { porOrden, alertas } = manoObraPorOrden(
      ordenes,
      [asignacion({ id: 'a1' }), asignacion({ id: 'a2', tipo_hora: 'extra_diurna', horas: 4 })],
      trabajadores,
      PARAMETROS,
    )

    const mo = porOrden.op1
    expect(mo.horas).toBe(44)
    expect(mo.total_salario).toBe(270_000)
    expect(mo.total_con_factor).toBe(405_000)
    expect(mo.total).toBe(405_000)
    expect(alertas).toEqual([])
  })

  it('el detalle trae lo que la hoja de costos necesita', () => {
    const { porOrden } = manoObraPorOrden(ordenes, [asignacion({ id: 'a1' })], trabajadores, PARAMETROS)
    const linea = porOrden.op1.lineas[0]
    expect(linea.nombre).toBe('Trabajador d1')
    expect(linea.codigo).toBe('D1')
    expect(linea.horas).toBe(40)
    expect(linea.valor_hora).toBe(6000)
    expect(linea.recargo).toBe(1)
    expect(linea.costo_salario).toBe(240_000)
    expect(linea.costo_empresa).toBe(360_000)
    expect(linea.total).toBe(360_000)
  })

  it('con el factor apagado, la hoja se lleva solo el salario', () => {
    const parametros = { ...PARAMETROS, mod_con_factor_prestacional: false }
    expect(usaFactorEnMOD(parametros)).toBe(false)

    const { porOrden } = manoObraPorOrden(ordenes, [asignacion({ id: 'a1' })], trabajadores, parametros)
    expect(porOrden.op1.total).toBe(240_000)
    // las dos cifras siguen calculadas, para poder compararlas
    expect(porOrden.op1.total_salario).toBe(240_000)
    expect(porOrden.op1.total_con_factor).toBe(360_000)
  })

  it('sin el campo en la configuración, el factor se aplica (por defecto sí)', () => {
    const { mod_con_factor_prestacional: _quitado, ...sinCampo } = PARAMETROS
    expect(usaFactorEnMOD(sinCampo)).toBe(true)
    const { porOrden } = manoObraPorOrden(ordenes, [asignacion({ id: 'a1' })], trabajadores, sinCampo)
    expect(porOrden.op1.total).toBe(360_000)
  })

  it('una tarifa escrita a mano manda sobre el valor hora del trabajador', () => {
    const { porOrden } = manoObraPorOrden(
      ordenes,
      [asignacion({ id: 'a1', tarifa_hora: 10_000 })],
      trabajadores,
      PARAMETROS,
    )
    expect(porOrden.op1.total_salario).toBe(400_000)
  })

  it('la misma asignación dos veces no se cuenta dos veces', () => {
    const a = asignacion({ id: 'a1' })
    const { porOrden } = manoObraPorOrden(ordenes, [a, a], trabajadores, PARAMETROS)
    expect(porOrden.op1.horas).toBe(40)
    expect(porOrden.op1.total).toBe(360_000)
  })

  it('horas en cero o negativas no se costean y se reportan', () => {
    const { porOrden, alertas } = manoObraPorOrden(
      ordenes,
      [asignacion({ id: 'a1', horas: 0 }), asignacion({ id: 'a2', horas: -5 })],
      trabajadores,
      PARAMETROS,
    )
    expect(porOrden.op1.total).toBe(0)
    expect(alertas.filter((a) => a.clase === 'horas_invalidas')).toHaveLength(2)
  })

  it('una asignación a un trabajador que ya no existe se reporta', () => {
    const { porOrden, alertas } = manoObraPorOrden(
      ordenes,
      [asignacion({ id: 'a1', trabajador_id: 'fantasma' })],
      trabajadores,
      PARAMETROS,
    )
    expect(porOrden.op1.total).toBe(0)
    expect(alertas[0].clase).toBe('trabajador_inexistente')
  })
})

// =====================================================================
// 7. NO HAY DOBLE CONTEO
// =====================================================================

describe('la mano de obra indirecta no entra a la hoja de costos', () => {
  const ordenes: OrdenProduccion[] = [
    {
      id: 'op1',
      numero: 'OP-001',
      producto_id: 'p1',
      cantidad_programada: 10,
      cantidad_terminada: 10,
      fecha_inicio: '2026-02-01',
      fecha_fin: null,
      estado: 'en_proceso',
    },
  ]

  const directo = trabajador({ id: 'd1', clasificacion: 'directa', salario_basico: 1_440_000 })
  const indirecto = trabajador({ id: 'i1', clasificacion: 'indirecta', salario_basico: 2_400_000 })
  const admin = trabajador({ id: 'ad', clasificacion: 'administracion', salario_basico: 3_000_000 })

  const asignaciones: AsignacionMO[] = [
    { id: 'a1', orden_id: 'op1', trabajador_id: 'd1', fecha: '2026-02-10', tipo_hora: 'ordinaria', horas: 40, tarifa_hora: null },
    { id: 'a2', orden_id: 'op1', trabajador_id: 'i1', fecha: '2026-02-10', tipo_hora: 'ordinaria', horas: 30, tarifa_hora: null },
    { id: 'a3', orden_id: 'op1', trabajador_id: 'ad', fecha: '2026-02-10', tipo_hora: 'ordinaria', horas: 20, tarifa_hora: null },
  ]

  const { porOrden, alertas } = manoObraPorOrden(
    ordenes,
    asignaciones,
    [directo, indirecto, admin],
    PARAMETROS,
  )

  it('solo las horas del directo se costean como MOD', () => {
    expect(porOrden.op1.lineas).toHaveLength(1)
    expect(porOrden.op1.lineas[0].trabajador_id).toBe('d1')
    expect(porOrden.op1.horas).toBe(40)
    expect(porOrden.op1.total).toBe(360_000)
  })

  it('las del indirecto y las de administración se dejan por fuera y se avisa', () => {
    const rechazadas = alertas.filter((a) => a.clase === 'mo_indirecta_en_orden')
    expect(rechazadas).toHaveLength(2)
    expect(rechazadas.map((a) => a.trabajador_id).sort()).toEqual(['ad', 'i1'])
  })

  it('el costo del indirecto aparece UNA sola vez, y por la vía de los CIF', () => {
    const liquidaciones = liquidarPeriodo(
      [directo, indirecto, admin],
      PERIODO,
      [horas('d1', 'ordinaria', 240), horas('i1', 'ordinaria', 240), horas('ad', 'ordinaria', 240)],
      [],
      [],
      PARAMETROS,
    )

    const moi = manoObraIndirectaDelPeriodo(liquidaciones)
    expect(moi).toBe(2_400_000 * 1.5)

    // el mismo costo NO está en la orden
    const enLaOrden = porOrden.op1.lineas.some((l) => l.trabajador_id === 'i1')
    expect(enLaOrden).toBe(false)

    // ni el de administración, que tampoco es CIF
    const gastos = gastosDeNominaDelPeriodo(liquidaciones)
    expect(gastos.administracion).toBe(3_000_000 * 1.5)
    expect(porOrden.op1.lineas.some((l) => l.trabajador_id === 'ad')).toBe(false)
  })
})

// =====================================================================
// 8. HORAS PAGADAS VS. IMPUTADAS
// =====================================================================

describe('cuadre de horas de los directos', () => {
  const directo = trabajador({ id: 'd1', clasificacion: 'directa', salario_basico: 1_440_000 })
  const indirecto = trabajador({ id: 'i1', clasificacion: 'indirecta', salario_basico: 2_400_000 })

  const liquidaciones = liquidarPeriodo(
    [directo, indirecto],
    PERIODO,
    [horas('d1', 'ordinaria', 240), horas('i1', 'ordinaria', 240)],
    [],
    [],
    PARAMETROS,
  )

  it('mide el tiempo ocioso y lo valora a la hora cargada', () => {
    const asignaciones: AsignacionMO[] = [
      { id: 'a1', orden_id: 'op1', trabajador_id: 'd1', periodo_id: PERIODO.id, fecha: '2026-02-10', tipo_hora: 'ordinaria', horas: 200, tarifa_hora: null },
    ]
    const { filas, alertas } = cuadreHorasDirectas(liquidaciones, asignaciones, [directo, indirecto])

    expect(filas).toHaveLength(1) // solo los directos
    expect(filas[0].horas_pagadas).toBe(240)
    expect(filas[0].horas_imputadas).toBe(200)
    expect(filas[0].diferencia).toBe(40)
    expect(filas[0].costo_ocioso).toBe(40 * 9000) // hora cargada = 6.000 x 1,5
    expect(alertas.some((a) => a.clase === 'horas_sin_imputar')).toBe(true)
  })

  it('avisa si se imputó más de lo que se pagó', () => {
    const asignaciones: AsignacionMO[] = [
      { id: 'a1', orden_id: 'op1', trabajador_id: 'd1', periodo_id: PERIODO.id, fecha: '2026-02-10', tipo_hora: 'ordinaria', horas: 300, tarifa_hora: null },
    ]
    const { filas, alertas } = cuadreHorasDirectas(liquidaciones, asignaciones, [directo, indirecto])
    expect(filas[0].diferencia).toBe(-60)
    expect(filas[0].costo_ocioso).toBe(0)
    expect(alertas.some((a) => a.clase === 'imputa_mas_de_lo_pagado')).toBe(true)
  })

  it('sin horas imputadas no molesta: todavía no se repartió nada', () => {
    const { alertas } = cuadreHorasDirectas(liquidaciones, [], [directo, indirecto])
    expect(alertas).toEqual([])
  })
})
