/**
 * LOS DOS ESTADOS FINANCIEROS.
 *
 * La prueba que manda es la del taller: con la empresa XYZ ya resuelta, la
 * utilidad bruta tiene que dar 47.293.142 y el margen exactamente 35%. Sale de
 * `ejemplos/taller-octubre-xyz.json` pasado por `calcularTodo`, asi que si
 * alguna formula de costos se mueve, este test lo cuenta.
 */
import { describe, expect, it } from 'vitest'

import respaldo from '../ejemplos/taller-octubre-xyz.json'
import { calcularTodo } from '../src/datos'
import { CUENTAS_BALANCE, estadoResultados, estadoSituacion } from '../src/lib/estados'
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

describe('estado de situación financiera', () => {
  const base = {
    config: datos.config,
    periodo: '2026-09',
    valor_inventario: c.valorInventario,
    producto_en_proceso: 0,
    producto_terminado: 0,
    utilidad_ejercicio: 43_593_142.01,
  }

  it('autollena el inventario del Kardex y la utilidad del ejercicio', () => {
    const b = estadoSituacion({ ...base, manuales: {} })
    const porId = Object.fromEntries(b.cuentas.map((x) => [x.id, x]))

    expect(porId.inv_materias_primas.monto).toBeCloseTo(8_365_874.52, 2)
    expect(porId.inv_materias_primas.origen).toBe('derivado')
    expect(porId.utilidad_ejercicio.monto).toBeCloseTo(43_593_142.01, 2)
    expect(porId.efectivo.origen).toBe('manual')
  })

  it('la depreciación acumulada RESTA dentro del activo no corriente', () => {
    const b = estadoSituacion({
      ...base,
      manuales: { ppe: 50_000_000, depreciacion_acumulada: 12_000_000 },
    })

    expect(b.activo_no_corriente).toBe(38_000_000)
  })

  /* EL TEST QUE PIDE EL TALLER: que detecte el descuadre. */
  it('DETECTA el descuadre y dice por cuánto, sin ajustar nada', () => {
    const b = estadoSituacion({
      ...base,
      manuales: { efectivo: 1_000_000, capital: 500_000 },
    })

    expect(b.cuadra).toBe(false)
    // activo = 1.000.000 + 8.365.874,52 ; pasivo+patrimonio = 500.000 + 43.593.142,01
    expect(b.total_activo).toBeCloseTo(9_365_874.52, 2)
    expect(b.total_pasivo_patrimonio).toBeCloseTo(44_093_142.01, 2)
    expect(b.descuadre).toBeCloseTo(-34_727_267.49, 2)
    expect(b.advertencias.some((a) => /mayor que el activo/i.test(a))).toBe(true)

    // y NO se tocó ninguna cuenta para forzar el cierre
    const porId = Object.fromEntries(b.cuentas.map((x) => [x.id, x]))
    expect(porId.efectivo.monto).toBe(1_000_000)
    expect(porId.capital.monto).toBe(500_000)
  })

  it('cuadra cuando las cuentas manuales cierran la ecuación', () => {
    /*
      activo = efectivo 40.000.000 + inventario 8.365.874,52 = 48.365.874,52
      pasivo + patrimonio = 4.772.732,51 + 43.593.142,01 = 48.365.874,52
    */
    const b = estadoSituacion({
      ...base,
      manuales: { efectivo: 40_000_000, cuentas_por_pagar: 4_772_732.51 },
    })

    expect(b.cuadra).toBe(true)
    expect(Math.abs(b.descuadre)).toBeLessThan(0.005)
  })

  it('un descuadre de menos de medio centavo se considera cuadrado', () => {
    const b = estadoSituacion({
      ...base,
      valor_inventario: 0,
      utilidad_ejercicio: 0,
      manuales: { efectivo: 1_000_000, capital: 1_000_000.004 },
    })

    expect(b.cuadra).toBe(true)
  })

  it('avisa cuando no se ha escrito ninguna cuenta', () => {
    const b = estadoSituacion({ ...base, manuales: {} })
    expect(b.advertencias.some((a) => /no escribiste ninguna cuenta/i.test(a))).toBe(true)
  })

  it('el catálogo cubre los cinco grupos y marca cuáles son derivadas', () => {
    const grupos = new Set(CUENTAS_BALANCE.map((x) => x.grupo))
    expect(grupos.size).toBe(5)

    const derivadas = CUENTAS_BALANCE.filter((x) => x.derivada).map((x) => x.id)
    expect(derivadas).toEqual([
      'inv_materias_primas',
      'inv_producto_proceso',
      'inv_producto_terminado',
      'utilidad_ejercicio',
    ])
  })
})

describe('los dos estados se hablan', () => {
  it('la utilidad del balance es la utilidad neta del estado de resultados', () => {
    const r = erTaller({ tasa_impuesto_pct: 35 })
    const b = estadoSituacion({
      config: datos.config,
      periodo: '2026-09',
      valor_inventario: c.valorInventario,
      producto_en_proceso: 0,
      producto_terminado: 0,
      utilidad_ejercicio: r.utilidad_neta,
      manuales: {},
    })

    const utilidad = b.cuentas.find((x) => x.id === 'utilidad_ejercicio')
    expect(utilidad?.monto).toBeCloseTo(r.utilidad_neta, 6)
  })
})
