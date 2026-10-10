import { describe, expect, it } from 'vitest'

import {
  baseEsExacta,
  calcularCIF,
  nivelActividadDeOrden,
  ordenesDelPeriodo,
  periodoDeOrden,
  pozoDelPeriodo,
  tasaDelPeriodo,
} from '../src/lib/cif'
import type { ContextoBase } from '../src/lib/cif'
import type {
  CategoriaCIF,
  CIF,
  ManoObraOrden,
  MaterialesOrden,
  OrdenProduccion,
  ParametrosCalculo,
  Receta,
} from '../src/lib/tipos'

const PARAMETROS: ParametrosCalculo = {
  horas_mes: 240,
  recargos: { extra_diurna: 1.25, extra_nocturna: 1.75, recargo_nocturno: 0.35, dominical: 0.75 },
  factor_prestacional: 0.5,
  mod_con_factor_prestacional: true,
  metodo_inventario: 'promedio_ponderado',
  base_cif: 'unidades',
  cif_tasa_desde: 'real',
  metodo_margen: 'sobre_costo',
  margen_por_defecto_pct: 30,
  redondeo_precio_multiplo: 100,
}

const CATEGORIAS: CategoriaCIF[] = [
  { id: 'c_cif', nombre: 'Servicios de planta', naturaleza: 'cif', comportamiento: 'variable', base: null, activa: true },
  { id: 'c_arr', nombre: 'Arriendo de planta', naturaleza: 'cif', comportamiento: 'fijo', base: null, activa: true },
  { id: 'c_adm', nombre: 'Administración', naturaleza: 'administracion', comportamiento: 'fijo', base: null, activa: true },
  { id: 'c_off', nombre: 'Categoría apagada', naturaleza: 'cif', comportamiento: 'fijo', base: null, activa: false },
]

let n = 0
function concepto(p: Partial<CIF> & { categoria_id: string; monto: number }): CIF {
  n += 1
  return {
    id: `cif${n}`,
    fecha: '2026-02-10',
    periodo: '2026-02',
    concepto: `Concepto ${n}`,
    documento: '',
    presupuestado: false,
    ...p,
  }
}

function orden(p: Partial<OrdenProduccion> & { id: string }): OrdenProduccion {
  return {
    numero: p.id.toUpperCase(),
    producto_id: 'p1',
    cantidad_programada: 100,
    cantidad_terminada: 100,
    fecha_inicio: '2026-02-01',
    fecha_fin: '2026-02-20',
    estado: 'terminada',
    ...p,
  }
}

/** Un contexto con el material y la mano de obra que cada orden ya tiene calculados. */
function contexto(
  porOrden: Record<string, { material?: number; mo?: number; horas?: number }>,
  recetas: Receta[] = [],
): ContextoBase {
  const materialesPorOrden: Record<string, MaterialesOrden> = {}
  const manoObraPorOrden: Record<string, ManoObraOrden> = {}

  for (const [id, v] of Object.entries(porOrden)) {
    materialesPorOrden[id] = { orden_id: id, lineas: [], total: v.material ?? 0 }
    manoObraPorOrden[id] = {
      orden_id: id,
      lineas: [],
      horas: v.horas ?? 0,
      total_salario: 0,
      total_con_factor: 0,
      total: v.mo ?? 0,
    }
  }

  return { materialesPorOrden, manoObraPorOrden, productos: [], recetas }
}

// =====================================================================
// 1. QUE ES CIF Y QUE NO
// =====================================================================

describe('el pozo del período separa costo de gasto', () => {
  const conceptos = [
    concepto({ categoria_id: 'c_cif', monto: 2_000_000 }),
    concepto({ categoria_id: 'c_arr', monto: 3_000_000 }),
    concepto({ categoria_id: 'c_adm', monto: 1_500_000 }),
  ]

  const pozo = pozoDelPeriodo(conceptos, CATEGORIAS, '2026-02')

  it('solo la naturaleza CIF es asignable al producto', () => {
    expect(pozo.asignable_real).toBe(5_000_000)
  })

  it('el arriendo de oficina es gasto del período y NO entra al costo', () => {
    expect(pozo.gastos_del_periodo).toBe(1_500_000)
  })

  it('un concepto sin categoría válida no se asigna: queda contado aparte', () => {
    const p = pozoDelPeriodo(
      [...conceptos, concepto({ categoria_id: 'c_off', monto: 400_000 }), concepto({ categoria_id: 'fantasma', monto: 100_000 })],
      CATEGORIAS,
      '2026-02',
    )
    expect(p.asignable_real).toBe(5_000_000)
    expect(p.sin_categoria).toBe(500_000)
  })

  it('separa presupuestados de reales', () => {
    const p = pozoDelPeriodo(
      [...conceptos, concepto({ categoria_id: 'c_cif', monto: 6_000_000, presupuestado: true })],
      CATEGORIAS,
      '2026-02',
    )
    expect(p.asignable_real).toBe(5_000_000)
    expect(p.asignable_presupuestado).toBe(6_000_000)
  })

  it('ignora los conceptos de otro período', () => {
    const p = pozoDelPeriodo(
      [...conceptos, concepto({ categoria_id: 'c_cif', monto: 9_000_000, periodo: '2026-03' })],
      CATEGORIAS,
      '2026-02',
    )
    expect(p.asignable_real).toBe(5_000_000)
  })
})

// =====================================================================
// 2. A QUE PERIODO PERTENECE UNA ORDEN
// =====================================================================

describe('período de una orden', () => {
  it('se toma la fecha de cierre', () => {
    expect(periodoDeOrden(orden({ id: 'o1', fecha_fin: '2026-03-02' }))).toBe('2026-03')
  })

  it('si sigue abierta, la de inicio', () => {
    expect(
      periodoDeOrden(orden({ id: 'o1', fecha_inicio: '2026-05-10', fecha_fin: null, estado: 'en_proceso' })),
    ).toBe('2026-05')
  })

  it('las anuladas no participan del reparto', () => {
    const ordenes = [orden({ id: 'o1' }), orden({ id: 'o2', estado: 'anulada' })]
    expect(ordenesDelPeriodo(ordenes, '2026-02').map((o) => o.id)).toEqual(['o1'])
  })
})

// =====================================================================
// 3. LA TASA Y EL REPARTO
// =====================================================================

describe('tasa por unidades producidas', () => {
  /*
      CIF asignables del período          $5.000.000
      unidades: op1 100 + op2 150 =              250
      tasa = 5.000.000 / 250 =               $20.000 por unidad

      op1 = 20.000 x 100 = $2.000.000
      op2 = 20.000 x 150 = $3.000.000
  */
  const conceptos = [
    concepto({ categoria_id: 'c_cif', monto: 2_000_000 }),
    concepto({ categoria_id: 'c_arr', monto: 3_000_000 }),
    concepto({ categoria_id: 'c_adm', monto: 1_500_000 }),
  ]
  const ordenes = [orden({ id: 'op1', cantidad_terminada: 100 }), orden({ id: 'op2', cantidad_terminada: 150 })]
  const ctx = contexto({ op1: {}, op2: {} })

  const { tasa, porOrden } = tasaDelPeriodo('2026-02', conceptos, CATEGORIAS, ordenes, PARAMETROS, ctx)

  it('la tasa es el pozo asignable sobre el nivel de actividad', () => {
    expect(tasa.nivel_actividad).toBe(250)
    expect(tasa.total_cif).toBe(5_000_000)
    expect(tasa.tasa).toBe(20_000)
    expect(tasa.valida).toBe(true)
  })

  it('reparte proporcionalmente a las unidades de cada orden', () => {
    expect(porOrden.op1.importe).toBe(2_000_000)
    expect(porOrden.op2.importe).toBe(3_000_000)
    expect(porOrden.op1.nivel_actividad).toBe(100)
  })

  it('el gasto del período queda aparte y no se reparte', () => {
    expect(tasa.gastos_del_periodo).toBe(1_500_000)
    expect(porOrden.op1.importe + porOrden.op2.importe).toBe(5_000_000)
  })
})

describe('guarda: sin nivel de actividad no hay tasa', () => {
  const conceptos = [concepto({ categoria_id: 'c_cif', monto: 5_000_000 })]

  it('con las órdenes sin cantidad producida, la tasa no es válida y nada se reparte', () => {
    const ordenes = [orden({ id: 'op1', cantidad_terminada: null, estado: 'en_proceso', fecha_fin: null })]
    const { tasa, porOrden } = tasaDelPeriodo(
      '2026-02',
      conceptos,
      CATEGORIAS,
      ordenes.map((o) => ({ ...o, fecha_inicio: '2026-02-01' })),
      PARAMETROS,
      contexto({ op1: {} }),
    )

    expect(tasa.nivel_actividad).toBe(0)
    expect(tasa.valida).toBe(false)
    expect(tasa.tasa).toBe(0)
    expect(Number.isFinite(tasa.tasa)).toBe(true)
    expect(porOrden.op1.importe).toBe(0)
    expect(porOrden.op1.valido).toBe(false)
    expect(porOrden.op1.nota).toContain('no tiene nivel de actividad')
  })

  it('un período sin órdenes no explota', () => {
    const { tasa } = tasaDelPeriodo('2026-09', conceptos, CATEGORIAS, [], PARAMETROS, contexto({}))
    expect(tasa.valida).toBe(false)
    expect(tasa.cif_aplicado).toBe(0)
  })
})

// =====================================================================
// 4. OTRAS BASES
// =====================================================================

describe('la base es configurable', () => {
  const conceptos = [concepto({ categoria_id: 'c_cif', monto: 5_000_000 })]
  const ordenes = [orden({ id: 'op1', cantidad_terminada: 100 }), orden({ id: 'op2', cantidad_terminada: 150 })]

  it('por horas de mano de obra directa', () => {
    const ctx = contexto({ op1: { horas: 80 }, op2: { horas: 120 } })
    const { tasa, porOrden } = tasaDelPeriodo(
      '2026-02',
      conceptos,
      CATEGORIAS,
      ordenes,
      { ...PARAMETROS, base_cif: 'horas_mo' },
      ctx,
    )
    // 5.000.000 / 200 h = 25.000 por hora
    expect(tasa.nivel_actividad).toBe(200)
    expect(tasa.tasa).toBe(25_000)
    expect(porOrden.op1.importe).toBe(2_000_000)
    expect(porOrden.op2.importe).toBe(3_000_000)
  })

  it('por costo de mano de obra directa', () => {
    const ctx = contexto({ op1: { mo: 1_000_000 }, op2: { mo: 4_000_000 } })
    const { tasa, porOrden } = tasaDelPeriodo(
      '2026-02',
      conceptos,
      CATEGORIAS,
      ordenes,
      { ...PARAMETROS, base_cif: 'costo_mo' },
      ctx,
    )
    // 5.000.000 / 5.000.000 = 1, o sea 100% del costo de MOD
    expect(tasa.tasa).toBe(1)
    expect(porOrden.op1.importe).toBe(1_000_000)
    expect(porOrden.op2.importe).toBe(4_000_000)
  })

  it('por costo primo: material + mano de obra', () => {
    const ctx = contexto({ op1: { material: 600_000, mo: 400_000 }, op2: { material: 3_000_000, mo: 1_000_000 } })
    const { tasa } = tasaDelPeriodo(
      '2026-02',
      conceptos,
      CATEGORIAS,
      ordenes,
      { ...PARAMETROS, base_cif: 'costo_primo' },
      ctx,
    )
    expect(tasa.nivel_actividad).toBe(5_000_000)
  })

  it('las horas máquina se estiman de la receta y se marcan como estimadas', () => {
    const receta: Receta = {
      id: 'r1',
      producto_id: 'p1',
      version: 1,
      rendimiento: 10,
      items: [],
      horas_mo_estandar: 0,
      horas_maquina_estandar: 25, // 2,5 h por unidad
      vigente: true,
    }
    const o = orden({ id: 'op1', cantidad_terminada: 40 })
    const n = nivelActividadDeOrden(o, 'horas_maquina', contexto({ op1: {} }, [receta]))
    expect(n.valor).toBe(100) // 2,5 x 40
    expect(n.estimado).toBe(true)
  })

  it('las bases con datos registrados no son estimaciones', () => {
    expect(baseEsExacta('unidades')).toBe(true)
    expect(baseEsExacta('horas_mo')).toBe(true)
    expect(baseEsExacta('horas_maquina')).toBe(false)
  })
})

// =====================================================================
// 5. INCURRIDOS VS APLICADOS
// =====================================================================

describe('CIF incurridos vs. aplicados', () => {
  const ordenes = [orden({ id: 'op1', cantidad_terminada: 100 }), orden({ id: 'op2', cantidad_terminada: 150 })]
  const ctx = contexto({ op1: {}, op2: {} })

  it('con la tasa sobre los reales, la variación da cero (modelo simplificado)', () => {
    const conceptos = [concepto({ categoria_id: 'c_cif', monto: 5_000_000 })]
    const { tasa } = tasaDelPeriodo('2026-02', conceptos, CATEGORIAS, ordenes, PARAMETROS, ctx)

    expect(tasa.desde).toBe('real')
    expect(tasa.cif_incurrido).toBe(5_000_000)
    expect(tasa.cif_aplicado).toBeCloseTo(5_000_000, 6)
    expect(tasa.variacion).toBeCloseTo(0, 6)
  })

  it('con tasa presupuestada aparece la variación: sobreaplicados', () => {
    const conceptos = [
      concepto({ categoria_id: 'c_cif', monto: 5_000_000 }),
      concepto({ categoria_id: 'c_cif', monto: 6_000_000, presupuestado: true }),
    ]
    const { tasa } = tasaDelPeriodo(
      '2026-02',
      conceptos,
      CATEGORIAS,
      ordenes,
      { ...PARAMETROS, cif_tasa_desde: 'presupuestado' },
      ctx,
    )

    expect(tasa.total_cif).toBe(6_000_000)
    expect(tasa.tasa).toBe(24_000) // 6.000.000 / 250
    expect(tasa.cif_aplicado).toBe(6_000_000)
    expect(tasa.cif_incurrido).toBe(5_000_000)
    // se aplico mas de lo que costo: sobreaplicados
    expect(tasa.variacion).toBe(-1_000_000)
  })

  it('subaplicados cuando el presupuesto quedó corto', () => {
    const conceptos = [
      concepto({ categoria_id: 'c_cif', monto: 5_000_000 }),
      concepto({ categoria_id: 'c_cif', monto: 4_000_000, presupuestado: true }),
    ]
    const { tasa } = tasaDelPeriodo(
      '2026-02',
      conceptos,
      CATEGORIAS,
      ordenes,
      { ...PARAMETROS, cif_tasa_desde: 'presupuestado' },
      ctx,
    )
    expect(tasa.variacion).toBe(1_000_000)
  })
})

// =====================================================================
// 6. TODOS LOS PERIODOS DE UNA PASADA
// =====================================================================

describe('calcularCIF sobre varios períodos', () => {
  const conceptos = [
    concepto({ categoria_id: 'c_cif', monto: 1_000_000, periodo: '2026-02' }),
    concepto({ categoria_id: 'c_cif', monto: 2_000_000, periodo: '2026-03' }),
  ]
  const ordenes = [
    orden({ id: 'op1', cantidad_terminada: 50, fecha_fin: '2026-02-20' }),
    orden({ id: 'op2', cantidad_terminada: 200, fecha_fin: '2026-03-15' }),
    // una orden de un mes sin CIF registrados
    orden({ id: 'op3', cantidad_terminada: 10, fecha_fin: '2026-04-05' }),
  ]
  const ctx = contexto({ op1: {}, op2: {}, op3: {} })

  const { tasas, porOrden, periodos } = calcularCIF(conceptos, CATEGORIAS, ordenes, PARAMETROS, ctx)

  it('cada período tiene su propia tasa', () => {
    expect(periodos).toEqual(['2026-02', '2026-03', '2026-04'])
    expect(tasas.find((t) => t.periodo === '2026-02')!.tasa).toBe(20_000) // 1.000.000 / 50
    expect(tasas.find((t) => t.periodo === '2026-03')!.tasa).toBe(10_000) // 2.000.000 / 200
  })

  it('una orden de un mes sin CIF queda con cero, no con la tasa de otro mes', () => {
    expect(porOrden.op3.importe).toBe(0)
    expect(porOrden.op3.periodo).toBe('2026-04')
  })

  it('cada orden recibe el CIF de SU período', () => {
    expect(porOrden.op1.importe).toBe(1_000_000)
    expect(porOrden.op2.importe).toBe(2_000_000)
  })
})
