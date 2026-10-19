/**
 * EL TALLER DE OCTUBRE, DE PUNTA A PUNTA.
 *
 * No es un test de una funcion: es el ejercicio completo del profesor —la
 * empresa XYZ, cinco compras, dos salidas a produccion, cinco operarios y los
 * CIF del mes— pasado por `calcularTodo` y comparado contra las respuestas
 * que se sacaron a mano en Excel.
 *
 * Vale mas que cualquier test unitario, porque si una formula se rompe la
 * rompe aqui con un numero que se puede verificar con una calculadora. Y si
 * alguna vez cambia a proposito, este archivo dice exactamente cuanto.
 *
 * Los datos salen de `ejemplos/taller-octubre-xyz.json`, que es el mismo
 * respaldo que se puede importar en la app.
 */
import { describe, expect, it } from 'vitest'

import respaldo from '../ejemplos/taller-octubre-xyz.json'
import { calcularTodo } from '../src/datos'
import type { DatosCrudos } from '../src/lib/tipos'

const datos = respaldo as unknown as DatosCrudos
const c = calcularTodo(datos, '2026-09-30')

/** El peso más cercano. Los centavos los pone el promedio ponderado. */
const alPeso = (n: number) => Math.round(n)

describe('el Kardex de las cuatro materias primas', () => {
  it('madera: 340 entradas, 300 salidas, 40 en saldo', () => {
    const t = c.tarjetas.mad
    expect(t.saldo_cantidad).toBe(40)
    // promedio despues de la compra 5: 8.222.000 / 190
    expect(t.costo_promedio).toBeCloseTo(43_273.684210526, 6)
    expect(t.saldo_total).toBeCloseTo(1_730_947.368421, 4)
  })

  it('metal: 500 entradas, 420 salidas, 80 en saldo', () => {
    const t = c.tarjetas.met
    expect(t.saldo_cantidad).toBe(80)
    expect(t.costo_promedio).toBeCloseTo(59_333.333333, 5)
    expect(t.saldo_total).toBeCloseTo(4_746_666.666667, 4)
  })

  it('plástico: 200 entradas, 180 salidas, 20 en saldo', () => {
    const t = c.tarjetas.pla
    expect(t.saldo_cantidad).toBe(20)
    expect(t.costo_promedio).toBeCloseTo(20_717.948718, 5)
    expect(t.saldo_total).toBeCloseTo(414_358.974359, 4)
  })

  it('vidrio: 680 entradas, 640 salidas, 40 en saldo', () => {
    const t = c.tarjetas.vid
    expect(t.saldo_cantidad).toBe(40)
    expect(t.costo_promedio).toBeCloseTo(36_847.537879, 5)
    expect(t.saldo_total).toBeCloseTo(1_473_901.515152, 4)
  })

  it('no deja ninguna alerta: ninguna salida se quedó sin saldo', () => {
    expect(c.alertasKardex).toHaveLength(0)
  })

  /* PREGUNTA 3 del taller. */
  it('el inventario final vale $8.365.874,52', () => {
    expect(c.valorInventario).toBeCloseTo(8_365_874.524598, 4)
  })
})

describe('la nómina de los cinco operarios', () => {
  const liq = c.liquidacionesPorPeriodo.per_sep
  const uno = liq[0]

  it('devenga salario más auxilio de transporte', () => {
    expect(uno.salario_base_periodo).toBe(2_300_000)
    expect(uno.auxilio_transporte).toBe(249_095)
    expect(uno.total_devengado).toBe(2_549_095)
  })

  it('el IBC es el salario: el auxilio no causa seguridad social', () => {
    expect(uno.base_prestacional).toBe(2_300_000)
  })

  it('cesantías, prima e intereses SÍ van sobre salario + auxilio', () => {
    const porId = Object.fromEntries(uno.aportes.map((a) => [a.id, a]))

    expect(porId.cesantias.base).toBe(2_549_095)
    expect(porId.cesantias.monto).toBeCloseTo(212_339.6135, 6)
    expect(porId.prima.monto).toBeCloseTo(212_339.6135, 6)
    expect(porId.intereses_cesantias.monto).toBeCloseTo(25_490.95, 6)

    // y el resto, solo sobre el salario
    expect(porId.vacaciones.base).toBe(2_300_000)
    expect(porId.vacaciones.monto).toBeCloseTo(95_910, 6)
    expect(porId.pension_empleador.monto).toBe(276_000)
    expect(porId.caja.monto).toBe(92_000)
    expect(porId.arl.monto).toBeCloseTo(56_028, 6)
  })

  it('no causa salud del empleador, SENA ni ICBF: exoneración 114-1', () => {
    const ids = uno.aportes.map((a) => a.id)
    expect(ids).not.toContain('salud_empleador')
    expect(ids).not.toContain('sena')
    expect(ids).not.toContain('icbf')
  })

  it('deduce 4% de salud y 4% de pensión, y el neto son $2.365.095', () => {
    expect(uno.total_deducciones).toBe(184_000)
    expect(uno.neto_pagar).toBe(2_365_095)
  })

  it('a la empresa le cuesta $3.519.203,18 cada operario', () => {
    expect(uno.carga_prestacional).toBeCloseTo(970_108.177, 5)
    expect(uno.costo_empresa).toBeCloseTo(3_519_203.177, 5)
  })

  it('los cinco cuestan $17.596.015,89', () => {
    const total = liq.reduce((s, l) => s + l.costo_empresa, 0)
    expect(total).toBeCloseTo(17_596_015.885, 4)
    expect(c.resumenesNomina.per_sep.total_costo_empresa).toBeCloseTo(17_596_015.885, 4)
  })

  it('la hora cuesta $16.758,11: costo-empresa entre las 210 horas de la jornada', () => {
    expect(uno.costo_empresa / uno.horas_esperadas).toBeCloseTo(16_758.1103667, 6)
  })
})

describe('la mano de obra que se carga a cada orden', () => {
  const mesas = c.manoObraPorOrden.op_mesas
  const vitrinas = c.manoObraPorOrden.op_vitrinas

  it('489 horas a las mesas y 466 a las vitrinas', () => {
    expect(mesas.horas).toBe(489)
    expect(vitrinas.horas).toBe(466)
  })

  it('se costean con la tarifa real del período, no con el valor hora', () => {
    // sin el modo 'liquidacion' la tarifa seria 2.300.000/210 = 10.952,38
    expect(mesas.lineas[0].valor_hora).toBeCloseTo(16_758.1103667, 6)
  })

  it('MOD mesas $8.194.715,97 y MOD vitrinas $7.809.279,43', () => {
    expect(mesas.total).toBeCloseTo(8_194_715.9693, 4)
    expect(vitrinas.total).toBeCloseTo(7_809_279.430867, 4)
  })

  it('las 95 horas que nadie imputó son tiempo ocioso', () => {
    const ocioso = c.cuadreMO.reduce((s, f) => s + f.diferencia, 0)
    expect(ocioso).toBe(1050 - 955)

    const costoOcioso = 17_596_015.885 - (8_194_715.9693 + 7_809_279.430867)
    expect(costoOcioso).toBeCloseTo(1_592_020.484833, 4)
  })
})

describe('los CIF del mes', () => {
  const tasa = c.tasaPorPeriodo['2026-09']

  it('solo las categorías de naturaleza CIF entran al producto', () => {
    // 7.000.000 + 120.000 + 950.000 + 750.000
    expect(tasa.total_cif).toBe(8_820_000)
    // el software y el arriendo de la oficina son gasto del período
    expect(tasa.gastos_del_periodo).toBe(3_700_000)
  })

  it('la tasa se calcula sobre la CAPACIDAD NORMAL de 1.050 horas', () => {
    expect(tasa.base).toBe('horas_mo')
    expect(tasa.nivel_actividad).toBe(955)
    expect(tasa.nivel_divisor).toBe(1050)
    expect(tasa.desde_capacidad).toBe(true)
    // 8.820.000 / 1.050 = 8.400 por hora
    expect(tasa.tasa).toBe(8_400)
  })

  it('CIF a las mesas $4.107.600 y a las vitrinas $3.914.400', () => {
    expect(c.cifPorOrden.op_mesas.importe).toBe(4_107_600)
    expect(c.cifPorOrden.op_vitrinas.importe).toBe(3_914_400)
  })

  /* La consecuencia de usar la capacidad normal. */
  it('quedan $798.000 de CIF SUBAPLICADOS', () => {
    expect(tasa.cif_aplicado).toBe(8_022_000)
    expect(tasa.variacion).toBe(798_000)
  })
})

describe('las hojas de costos', () => {
  const mesas = c.hojasPorOrden.op_mesas
  const vitrinas = c.hojasPorOrden.op_vitrinas

  it('el material sale del Kardex, al promedio del momento de cada salida', () => {
    // mesas: 300 madera + 100 metal + 100 plástico
    expect(mesas.total_materiales).toBeCloseTo(20_330_219.298246, 4)
    // vitrinas: 640 vidrio + 320 metal + 80 plástico
    expect(vitrinas.total_materiales).toBeCloseTo(43_473_906.177156, 4)
  })

  it('cada hoja integra material, mano de obra y CIF sin que nada se escriba a mano', () => {
    expect(mesas.total_mano_obra).toBeCloseTo(8_194_715.9693, 4)
    expect(mesas.total_cif).toBe(4_107_600)
    expect(vitrinas.total_mano_obra).toBeCloseTo(7_809_279.430867, 4)
    expect(vitrinas.total_cif).toBe(3_914_400)
  })

  /* PREGUNTA 1 del taller. */
  it('el costo de producción: mesas $32.632.535,27 y vitrinas $55.197.585,61', () => {
    expect(mesas.costo_total).toBeCloseTo(32_632_535.267546, 4)
    expect(vitrinas.costo_total).toBeCloseTo(55_197_585.608023, 4)
  })

  it('el costo unitario: $326.325,35 la mesa y $689.969,82 la vitrina', () => {
    expect(mesas.costo_unitario).toBeCloseTo(326_325.352675, 5)
    expect(vitrinas.costo_unitario).toBeCloseTo(689_969.8201, 5)
  })

  /* PREGUNTA 2 del taller: utilidad bruta del 35% SOBRE LA VENTA. */
  it('el precio de venta con 35% de utilidad sobre la venta', () => {
    expect(mesas.margen_metodo).toBe('sobre_precio')
    expect(mesas.margen_pct).toBe(35)

    expect(alPeso(mesas.precio_sugerido ?? 0)).toBe(502_039)
    expect(alPeso(vitrinas.precio_sugerido ?? 0)).toBe(1_061_492)

    // y el total de cada orden
    expect((mesas.precio_sugerido ?? 0) * 100).toBeCloseTo(50_203_900.411609, 3)
    expect((vitrinas.precio_sugerido ?? 0) * 80).toBeCloseTo(84_919_362.473881, 3)
  })

  /* PREGUNTA 5 del taller. */
  it('la vitrina deja más utilidad por unidad que la mesa', () => {
    const utilidadMesa = mesas.utilidad_unitaria ?? 0
    const utilidadVitrina = vitrinas.utilidad_unitaria ?? 0

    expect(utilidadMesa).toBeCloseTo(175_713.651441, 5)
    expect(utilidadVitrina).toBeCloseTo(371_522.210823, 5)
    expect(utilidadVitrina).toBeGreaterThan(utilidadMesa)

    // pero el margen sobre la venta es el mismo 35% en las dos: lo que cambia
    // es el tamaño del producto, no su rentabilidad relativa
    expect(utilidadMesa / (mesas.precio_sugerido ?? 1)).toBeCloseTo(0.35, 10)
    expect(utilidadVitrina / (vitrinas.precio_sugerido ?? 1)).toBeCloseTo(0.35, 10)
  })
})

/* PREGUNTA 4 del taller. */
describe('los costos que no se aplicaron a ninguna orden', () => {
  it('son los CIF subaplicados más el tiempo ocioso: $2.390.020,48', () => {
    const cifNoAplicado = c.tasaPorPeriodo['2026-09'].variacion

    const costoNomina = c.resumenesNomina.per_sep.total_costo_empresa
    const modAplicada = c.manoObraPorOrden.op_mesas.total + c.manoObraPorOrden.op_vitrinas.total
    const moOciosa = costoNomina - modAplicada

    expect(cifNoAplicado).toBe(798_000)
    expect(moOciosa).toBeCloseTo(1_592_020.484833, 4)
    expect(cifNoAplicado + moOciosa).toBeCloseTo(2_390_020.484833, 4)
  })

  it('y los $3.700.000 de administración nunca fueron costo del producto', () => {
    // no son «no aplicados»: son gasto del período por naturaleza
    expect(c.tasaPorPeriodo['2026-09'].gastos_del_periodo).toBe(3_700_000)
  })
})
