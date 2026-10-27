/**
 * EL ESTADO DE RESULTADOS.
 *
 * La prueba que manda es la del taller: con la empresa XYZ ya resuelta, la
 * utilidad bruta tiene que dar 47.293.142 y el margen exactamente 35%. Sale de
 * `ejemplos/taller-octubre-xyz.json` pasado por `calcularTodo`, asi que si
 * alguna formula de costos se mueve, este test lo cuenta.
 */
import { describe, expect, it } from 'vitest'

import respaldo from '../ejemplos/taller-octubre-xyz.json'
import { calcularTodo } from '../src/datos'
import { estadoResultados } from '../src/lib/estados'
import type { DatosCrudos } from '../src/lib/tipos'

const datos = respaldo as unknown as DatosCrudos
const c = calcularTodo(datos, '2026-09-30')

/** El estado de resultados del taller, sin impuesto ni financieros. */
function erTaller(extra: Partial<Parameters<typeof estadoResultados>[0]> = {}) {
  return estadoResultados({
    config: datos.config,
    periodo: '2026-09',
    hojas: c.hojas,
    ventas: datos.comercial.ventas,
    productos: datos.produccion.productos,
    conceptos: datos.cif.cif,
    categorias: datos.cif.categorias,
    gastos: datos.comercial.gastos,
    liquidaciones: c.liquidaciones,
    ...extra,
  })
}

describe('estado de resultados · el taller de octubre', () => {
  const r = erTaller()

  it('las ventas salen de las hojas y avisa que es un supuesto', () => {
    // 100 mesas a 502.039,00 + 80 vitrinas a 1.061.492,03
    expect(r.ventas).toBeCloseTo(135_123_262.885, 2)
    expect(r.ventas_supuestas).toBe(true)
    expect(r.advertencias.some((a) => /SUPONE que todo lo producido se vendió/i.test(a))).toBe(true)
    expect(r.lineas_ventas).toHaveLength(2)
    expect(r.lineas_ventas.every((l) => l.origen === 'hoja')).toBe(true)
  })

  it('el costo de ventas viene abierto por elemento y suma el de las hojas', () => {
    expect(r.costo_materiales).toBeCloseTo(63_804_125.475, 2)
    expect(r.costo_mano_obra).toBeCloseTo(16_003_995.4, 2)
    expect(r.costo_cif).toBe(8_022_000)
    expect(r.costo_ventas).toBeCloseTo(87_830_120.876, 2)

    // y cuadra contra las hojas, una por una
    const porHojas = c.hojas.reduce((s, h) => s + h.costo_total, 0)
    expect(r.costo_ventas).toBeCloseTo(porHojas, 6)
  })

  /* LA VALIDACIÓN QUE PIDE EL TALLER. */
  it('utilidad bruta 47.293.142, margen exactamente 35%', () => {
    expect(Math.round(r.utilidad_bruta)).toBe(47_293_142)
    expect(r.margen_bruto).toBeCloseTo(0.35, 10)
  })

  it('los gastos de administración no tocan el costo del producto', () => {
    // software 200.000 + arriendo oficina 3.500.000
    expect(r.gastos_administracion).toBe(3_700_000)
    expect(r.gastos_ventas).toBe(0)
    expect(r.utilidad_operacional).toBeCloseTo(43_593_142.01, 2)
  })

  it('sin financieros ni impuesto, la neta es la operacional', () => {
    expect(r.resultado_financiero).toBe(0)
    expect(r.impuesto).toBe(0)
    expect(r.utilidad_neta).toBeCloseTo(r.utilidad_operacional, 6)
  })

  it('con impuesto del 35% descuenta sobre la utilidad antes de impuestos', () => {
    const conImpuesto = erTaller({ tasa_impuesto_pct: 35 })

    expect(conImpuesto.utilidad_antes_impuestos).toBeCloseTo(43_593_142.01, 2)
    expect(conImpuesto.impuesto).toBeCloseTo(15_257_599.7, 2)
    expect(conImpuesto.utilidad_neta).toBeCloseTo(28_335_542.31, 2)
  })

  it('el resultado financiero entra antes del impuesto', () => {
    const conFin = erTaller({ ingresos_financieros: 1_000_000, gastos_financieros_extra: 400_000 })

    expect(conFin.resultado_financiero).toBe(600_000)
    expect(conFin.utilidad_antes_impuestos).toBeCloseTo(conFin.utilidad_operacional + 600_000, 6)
  })

  it('una empresa que pierde no paga impuesto', () => {
    const enPerdida = erTaller({ gastos_financieros_extra: 999_000_000, tasa_impuesto_pct: 35 })

    expect(enPerdida.utilidad_antes_impuestos).toBeLessThan(0)
    expect(enPerdida.impuesto).toBe(0)
    expect(enPerdida.utilidad_neta).toBe(enPerdida.utilidad_antes_impuestos)
  })

  it('cada margen es sobre las ventas', () => {
    const conTodo = erTaller({ tasa_impuesto_pct: 35 })
    expect(conTodo.margen_operacional).toBeCloseTo(conTodo.utilidad_operacional / conTodo.ventas, 10)
    expect(conTodo.margen_neto).toBeCloseTo(conTodo.utilidad_neta / conTodo.ventas, 10)
  })

  it('sin hojas terminadas lo dice en vez de mostrar ceros como si fueran datos', () => {
    const vacio = erTaller({ hojas: [] })
    expect(vacio.ventas).toBe(0)
    expect(vacio.faltantes.some((f) => /no hay ninguna hoja de costos terminada/i.test(f))).toBe(true)
  })
})
