import { describe, expect, it } from 'vitest'

import {
  aplicarSupuestos,
  basesEquilibrio,
  equilibrioMezcla,
  esManoObraFija,
  escenarioEquilibrio,
  precioParaUtilidad,
  puntoEquilibrio,
  supuestoDe,
  unidadesParaUtilidad,
} from '../src/lib/equilibrio'
import type { EntradaEquilibrio } from '../src/lib/equilibrio'
import { precioSugerido } from '../src/lib/hoja'
import type {
  CategoriaCIF,
  CIF,
  CostoReceta,
  Gasto,
  HojaCostos,
  Liquidacion,
  OrdenProduccion,
  PeriodoNomina,
  Producto,
  Receta,
  SupuestoEquilibrio,
  Trabajador,
} from '../src/lib/tipos'

// =====================================================================
// LAS FORMULAS
// =====================================================================

describe('puntoEquilibrio', () => {
  it('con números a mano: CF 1.000.000, PV 5.000, CVu 3.000', () => {
    const r = puntoEquilibrio(1_000_000, 5_000, 3_000)

    expect(r.valido).toBe(true)
    expect(r.margen_contribucion).toBe(2_000)
    expect(r.razon_contribucion).toBeCloseTo(0.4, 10)
    // 1.000.000 / 2.000 = 500 unidades
    expect(r.unidades).toBe(500)
    expect(r.unidades_enteras).toBe(500)
    // 500 x 5.000 = 2.500.000, y tambien 1.000.000 / 0,4
    expect(r.pesos).toBe(2_500_000)
    expect(r.pesos).toBeCloseTo(1_000_000 / r.razon_contribucion, 6)
  })

  it('en el punto de equilibrio la utilidad es exactamente cero', () => {
    const cf = 1_750_000
    const pv = 8_400
    const cvu = 5_150
    const r = puntoEquilibrio(cf, pv, cvu)

    const utilidad = r.unidades * pv - (cf + r.unidades * cvu)
    expect(utilidad).toBeCloseTo(0, 6)
  })

  it('redondea las unidades HACIA ARRIBA: con 500,1 no alcanza vender 500', () => {
    const r = puntoEquilibrio(1_000_200, 5_000, 3_000)
    expect(r.unidades).toBeCloseTo(500.1, 10)
    expect(r.unidades_enteras).toBe(501)
  })

  it('con costos fijos en cero el equilibrio es cero unidades', () => {
    const r = puntoEquilibrio(0, 5_000, 3_000)
    expect(r.valido).toBe(true)
    expect(r.unidades).toBe(0)
    expect(r.pesos).toBe(0)
  })

  it('si el precio no cubre el costo variable NO hay punto de equilibrio', () => {
    const r = puntoEquilibrio(1_000_000, 3_000, 3_500)

    expect(r.valido).toBe(false)
    expect(r.unidades).toBe(0)
    expect(r.pesos).toBe(0)
    // el margen negativo igual se muestra: es el diagnostico
    expect(r.margen_contribucion).toBe(-500)
    expect(r.problema).toMatch(/no alcanza a cubrir/i)
  })

  it('con margen de contribución exactamente cero tampoco hay equilibrio', () => {
    const r = puntoEquilibrio(1_000_000, 3_000, 3_000)
    expect(r.valido).toBe(false)
    expect(r.margen_contribucion).toBe(0)
  })

  it('rechaza precio cero, costo variable negativo y fijos negativos', () => {
    expect(puntoEquilibrio(1_000, 0, 500).problema).toMatch(/sin precio/i)
    expect(puntoEquilibrio(1_000, 5_000, -1).problema).toMatch(/negativo/i)
    expect(puntoEquilibrio(-1, 5_000, 1_000).problema).toMatch(/negativo/i)
  })

  it('no propaga NaN ni Infinity', () => {
    const r = puntoEquilibrio(Number.NaN, 5_000, 1_000)
    expect(r.valido).toBe(false)
    expect(Number.isFinite(r.unidades)).toBe(true)
  })
})

describe('unidadesParaUtilidad', () => {
  it('la utilidad objetivo se comporta como un costo fijo más', () => {
    // CF 1.000.000, MC 2.000, utilidad 400.000 -> (1.400.000)/2.000 = 700
    const r = unidadesParaUtilidad(1_000_000, 5_000, 3_000, 400_000)

    expect(r.valido).toBe(true)
    expect(r.unidades).toBe(700)
    expect(r.pesos).toBe(3_500_000)
  })

  it('con utilidad cero da el mismo número que el punto de equilibrio', () => {
    const pe = puntoEquilibrio(1_000_000, 5_000, 3_000)
    const u0 = unidadesParaUtilidad(1_000_000, 5_000, 3_000, 0)
    expect(u0.unidades).toBe(pe.unidades)
  })

  it('a ese volumen la utilidad real es la pedida', () => {
    const cf = 2_300_000
    const pv = 7_500
    const cvu = 4_125
    const objetivo = 1_000_000
    const r = unidadesParaUtilidad(cf, pv, cvu, objetivo)

    const utilidad = r.unidades * (pv - cvu) - cf
    expect(utilidad).toBeCloseTo(objetivo, 6)
  })

  it('hereda el problema del punto de equilibrio y rechaza utilidad negativa', () => {
    expect(unidadesParaUtilidad(1_000_000, 3_000, 3_500, 100).valido).toBe(false)
    expect(unidadesParaUtilidad(1_000_000, 5_000, 3_000, -1).problema).toMatch(/negativa/i)
  })
})

describe('precioParaUtilidad', () => {
  it('reparte los fijos entre el volumen esperado', () => {
    // CF 1.000.000 entre 500 unidades = 2.000 por unidad; CVu 3.000
    // costo unitario total 5.000, utilidad 500.000/500 = 1.000 -> PV 6.000
    const r = precioParaUtilidad(1_000_000, 3_000, 500, 500_000)

    expect(r.valido).toBe(true)
    expect(r.costo_unitario_total).toBe(5_000)
    expect(r.utilidad_unitaria).toBe(1_000)
    expect(r.precio).toBe(6_000)
    // 1.000 / 6.000 = 16,666% sobre la venta; 1.000 / 5.000 = 20% sobre el costo
    expect(r.margen_sobre_venta_pct).toBeCloseTo(100 / 6, 10)
    expect(r.markup_sobre_costo_pct).toBeCloseTo(20, 10)
  })

  it('el mismo objetivo con MÁS volumen necesita MENOS precio', () => {
    const pocas = precioParaUtilidad(1_000_000, 3_000, 200, 500_000)
    const muchas = precioParaUtilidad(1_000_000, 3_000, 1_000, 500_000)

    expect(pocas.precio).toBeGreaterThan(muchas.precio)
    expect(pocas.precio).toBe(3_000 + (1_000_000 + 500_000) / 200)
    expect(muchas.precio).toBe(3_000 + (1_000_000 + 500_000) / 1_000)
  })

  it('a ese precio y ese volumen la utilidad sale exacta', () => {
    const cf = 3_750_000
    const cvu = 2_480
    const q = 340
    const objetivo = 900_000
    const r = precioParaUtilidad(cf, cvu, q, objetivo)

    const utilidad = q * r.precio - (cf + q * cvu)
    expect(utilidad).toBeCloseTo(objetivo, 6)
  })

  it('exige volumen mayor que cero', () => {
    expect(precioParaUtilidad(1_000_000, 3_000, 0, 500_000).problema).toMatch(/volumen/i)
    expect(precioParaUtilidad(1_000_000, 3_000, -5, 500_000).valido).toBe(false)
  })

  it('sin ningún costo no hay precio que derivar del costo', () => {
    const r = precioParaUtilidad(0, 0, 100, 500_000)
    expect(r.valido).toBe(false)
    expect(r.problema).toMatch(/sin ningún costo/i)
  })

  it('cierra el círculo con unidadesParaUtilidad', () => {
    const cf = 1_000_000
    const cvu = 3_000
    const q = 500
    const objetivo = 500_000

    const precio = precioParaUtilidad(cf, cvu, q, objetivo)
    const unidades = unidadesParaUtilidad(cf, precio.precio, cvu, objetivo)

    // si cobro ese precio, las unidades que necesito son justo las que supuse
    expect(unidades.unidades).toBeCloseTo(q, 6)
  })
})

// ---------------------------------------------------------------------
// LA CONSISTENCIA CON precioSugerido (no hay dos lógicas de precio)
// ---------------------------------------------------------------------

describe('el precio por utilidad objetivo coincide con precioSugerido', () => {
  const casos: ReadonlyArray<[number, number, number, number]> = [
    [1_000_000, 3_000, 500, 500_000],
    [2_300_000, 4_125, 740, 1_000_000],
    [500_000, 1_200, 100, 0],
    [12_500_000, 18_400, 3_200, 7_000_000],
  ]

  it('el margen sobre la venta que devuelve reproduce el mismo precio', () => {
    for (const [cf, cvu, q, u] of casos) {
      const r = precioParaUtilidad(cf, cvu, q, u)
      expect(r.valido).toBe(true)

      const porSugerido = precioSugerido(
        r.costo_unitario_total,
        'sobre_precio',
        r.margen_sobre_venta_pct,
        1, // sin redondeo: se comparan las fórmulas, no el redondeo
      )

      expect(porSugerido.precio).not.toBeNull()
      expect(porSugerido.precio as number).toBeCloseTo(r.precio, 6)
    }
  })

  it('y el markup sobre el costo también', () => {
    for (const [cf, cvu, q, u] of casos) {
      const r = precioParaUtilidad(cf, cvu, q, u)

      const porSugerido = precioSugerido(
        r.costo_unitario_total,
        'sobre_costo',
        r.markup_sobre_costo_pct,
        1,
      )

      expect(porSugerido.precio as number).toBeCloseTo(r.precio, 6)
    }
  })

  it('con margen en % sobre ventas: PV = CVu_total / (1 − m), igual que precioSugerido', () => {
    // la otra entrada de la herramienta: la empresa dice el margen, no la utilidad
    const cf = 1_000_000
    const cvu = 3_000
    const q = 500
    const m = 20 // % sobre la venta

    const costoUnitarioTotal = cvu + cf / q // 5.000
    const aMano = costoUnitarioTotal / (1 - m / 100) // 6.250
    const porSugerido = precioSugerido(costoUnitarioTotal, 'sobre_precio', m, 1)

    expect(porSugerido.precio as number).toBeCloseTo(aMano, 10)

    // y la utilidad del período que implica ese margen
    const utilidad = q * (aMano - costoUnitarioTotal)
    expect(utilidad).toBeCloseTo(625_000, 6)

    // que es consistente con el camino inverso
    const vuelta = precioParaUtilidad(cf, cvu, q, utilidad)
    expect(vuelta.precio).toBeCloseTo(aMano, 6)
    expect(vuelta.margen_sobre_venta_pct).toBeCloseTo(m, 10)
  })
})

// ---------------------------------------------------------------------
// LA MEZCLA
// ---------------------------------------------------------------------

describe('equilibrioMezcla', () => {
  const lineas = [
    { producto_id: 'p1', nombre: 'Banca', unidades_canasta: 3, precio: 10_000, costo_variable_unitario: 6_000 },
    { producto_id: 'p2', nombre: 'Mesa', unidades_canasta: 1, precio: 30_000, costo_variable_unitario: 18_000 },
  ]

  it('resuelve por canastas y reparte las unidades según la mezcla', () => {
    // MC canasta = 3 x 4.000 + 1 x 12.000 = 24.000
    const r = equilibrioMezcla(lineas, 2_400_000)

    expect(r.valido).toBe(true)
    expect(r.margen_contribucion_canasta).toBe(24_000)
    expect(r.canastas).toBe(100)
    expect(r.lineas[0].unidades).toBe(300)
    expect(r.lineas[1].unidades).toBe(100)
    expect(r.unidades_totales).toBe(400)
    // 300 x 10.000 + 100 x 30.000 = 6.000.000
    expect(r.pesos).toBe(6_000_000)
  })

  it('en el equilibrio de la empresa la utilidad total es cero', () => {
    const cf = 2_400_000
    const r = equilibrioMezcla(lineas, cf)

    const utilidad = r.lineas.reduce(
      (s, l) => s + l.unidades * (l.precio - l.costo_variable_unitario),
      0,
    ) - cf

    expect(utilidad).toBeCloseTo(0, 6)
  })

  it('la participación de cada producto suma 1', () => {
    const r = equilibrioMezcla(lineas, 2_400_000)
    const suma = r.lineas.reduce((s, l) => s + l.participacion, 0)
    expect(suma).toBeCloseTo(1, 10)
    // 12.000 de 24.000: la mesa pone la mitad del margen con una sola unidad
    expect(r.lineas[1].participacion).toBeCloseTo(0.5, 10)
  })

  it('cambiar la MEZCLA cambia el equilibrio sin mover ningún costo', () => {
    const a = equilibrioMezcla(lineas, 2_400_000)
    const b = equilibrioMezcla(
      [
        { ...lineas[0], unidades_canasta: 1 },
        { ...lineas[1], unidades_canasta: 3 },
      ],
      2_400_000,
    )

    // MC canasta pasa de 24.000 a 4.000 + 36.000 = 40.000
    expect(b.margen_contribucion_canasta).toBe(40_000)
    expect(b.unidades_totales).toBeLessThan(a.unidades_totales)
  })

  it('un producto con margen negativo arrastra la canasta y se deja ver', () => {
    const r = equilibrioMezcla(
      [
        lineas[0],
        { producto_id: 'p3', nombre: 'Taburete', unidades_canasta: 2, precio: 5_000, costo_variable_unitario: 9_000 },
      ],
      1_000_000,
    )

    // 3 x 4.000 = 12.000 contra 2 x (-4.000) = -8.000 -> 4.000
    expect(r.margen_contribucion_canasta).toBe(4_000)
    expect(r.lineas[1].margen_contribucion).toBe(-4_000)
    expect(r.valido).toBe(true)
  })

  it('si la canasta no deja margen, no hay equilibrio', () => {
    const r = equilibrioMezcla(
      [{ producto_id: 'p1', nombre: 'Banca', unidades_canasta: 1, precio: 5_000, costo_variable_unitario: 6_000 }],
      1_000_000,
    )
    expect(r.valido).toBe(false)
    expect(r.problema).toMatch(/margen de contribución/i)
  })

  it('rechaza una mezcla vacía y una canasta sin unidades', () => {
    expect(equilibrioMezcla([], 1_000_000).problema).toMatch(/no hay productos/i)
    expect(
      equilibrioMezcla([{ ...lineas[0], unidades_canasta: 0 }], 1_000_000).problema,
    ).toMatch(/canasta está vacía/i)
  })
})

// =====================================================================
// LA CLASIFICACION FIJO / VARIABLE (integracion)
// =====================================================================

describe('esManoObraFija', () => {
  it('sin el campo, la modalidad decide', () => {
    expect(esManoObraFija({ modalidad: 'mensual' })).toBe(true)
    expect(esManoObraFija({ modalidad: 'por_hora' })).toBe(false)
  })

  it('el campo manda sobre la modalidad', () => {
    expect(esManoObraFija({ modalidad: 'mensual', mano_obra_fija: false })).toBe(false)
    expect(esManoObraFija({ modalidad: 'por_hora', mano_obra_fija: true })).toBe(true)
  })
})

// ---------------------------------------------------------------------
// Datos de ejemplo. Numeros redondos a proposito, para poder verificar a mano.
// ---------------------------------------------------------------------

const CATEGORIAS: CategoriaCIF[] = [
  { id: 'c_arriendo', nombre: 'Arriendo de planta', naturaleza: 'cif', comportamiento: 'fijo', base: null, activa: true },
  { id: 'c_energia', nombre: 'Energía de planta', naturaleza: 'cif', comportamiento: 'variable', base: null, activa: true },
  { id: 'c_admin', nombre: 'Administración', naturaleza: 'administracion', comportamiento: 'fijo', base: null, activa: true },
  { id: 'c_comision', nombre: 'Comisiones de venta', naturaleza: 'ventas', comportamiento: 'variable', base: null, activa: true },
  { id: 'c_muerta', nombre: 'Categoría inactiva', naturaleza: 'cif', comportamiento: 'fijo', base: null, activa: false },
]

const CONCEPTOS: CIF[] = [
  { id: 'k1', fecha: '2026-09-30', periodo: '2026-09', categoria_id: 'c_arriendo', concepto: 'Arriendo', monto: 2_000_000, documento: '', presupuestado: false },
  { id: 'k2', fecha: '2026-09-30', periodo: '2026-09', categoria_id: 'c_energia', concepto: 'Energía', monto: 400_000, documento: '', presupuestado: false },
  { id: 'k3', fecha: '2026-09-30', periodo: '2026-09', categoria_id: 'c_admin', concepto: 'Sueldo contador', monto: 1_000_000, documento: '', presupuestado: false },
  { id: 'k4', fecha: '2026-09-30', periodo: '2026-09', categoria_id: 'c_comision', concepto: 'Comisiones', monto: 200_000, documento: '', presupuestado: false },
  // un presupuesto NO entra: el equilibrio se corre sobre lo real
  { id: 'k5', fecha: '2026-09-30', periodo: '2026-09', categoria_id: 'c_arriendo', concepto: 'Arriendo presupuestado', monto: 9_900_000, documento: '', presupuestado: true },
  // una categoria inactiva queda por fuera y se avisa
  { id: 'k6', fecha: '2026-09-30', periodo: '2026-09', categoria_id: 'c_muerta', concepto: 'Sin clasificar', monto: 50_000, documento: '', presupuestado: false },
  // otro mes: no debe contaminar
  { id: 'k7', fecha: '2026-10-31', periodo: '2026-10', categoria_id: 'c_arriendo', concepto: 'Arriendo de octubre', monto: 7_777_777, documento: '', presupuestado: false },
]

const GASTOS: Gasto[] = [
  { id: 'g1', fecha: '2026-09-15', concepto: 'Papelería', monto: 100_000, clasificacion: 'administracion' },
  { id: 'g2', fecha: '2026-09-20', concepto: 'Publicidad', monto: 300_000, clasificacion: 'ventas' },
  { id: 'g3', fecha: '2026-08-20', concepto: 'De otro mes', monto: 500_000, clasificacion: 'ventas' },
  { id: 'g4', fecha: '2026-09-25', concepto: 'Sin clasificar', monto: 999_999, clasificacion: 'otro' },
]

function trabajador(p: Partial<Trabajador> & { id: string }): Trabajador {
  return {
    codigo: p.id,
    nombre: p.id,
    cargo: 'Operario',
    area: 'Planta',
    clasificacion: 'directa',
    modalidad: 'mensual',
    salario_basico: 1_000_000,
    tarifa_hora: 0,
    tiene_auxilio_transporte: false,
    tipo_contrato: 'termino_indefinido',
    clase_riesgo: 'II',
    fecha_ingreso: '2026-01-01',
    activo: true,
    ...p,
  }
}

const TRABAJADORES: Trabajador[] = [
  trabajador({ id: 't_mensual', modalidad: 'mensual' }),
  trabajador({ id: 't_hora', modalidad: 'por_hora', tarifa_hora: 10_000 }),
  trabajador({ id: 't_forzado', modalidad: 'mensual', mano_obra_fija: false }),
]

const PERIODOS_NOMINA: PeriodoNomina[] = [
  { id: 'per_sep', nombre: 'Septiembre', mes: '2026-09', desde: '2026-09-01', hasta: '2026-09-30', estado: 'cerrado' },
  { id: 'per_oct', nombre: 'Octubre', mes: '2026-10', desde: '2026-10-01', hasta: '2026-10-31', estado: 'abierto' },
]

/** Solo los campos que la clasificación mira. El resto no cambia nada acá. */
function liquidacion(trabajadorId: string, periodoId: string, costoEmpresa: number): Liquidacion {
  return {
    trabajador_id: trabajadorId,
    periodo_id: periodoId,
    clasificacion: 'directa',
    modalidad: 'mensual',
    valor_hora: 0,
    horas_por_tipo: {} as Liquidacion['horas_por_tipo'],
    lineas_horas: [],
    salario_base_periodo: 0,
    extras_y_recargos: 0,
    bonificaciones: 0,
    total_devengado: costoEmpresa,
    base_prestacional: costoEmpresa,
    auxilio_transporte: 0,
    lineas: [],
    total_deducciones: 0,
    neto_pagar: costoEmpresa,
    aportes: [],
    carga_prestacional: 0,
    costo_empresa: costoEmpresa,
    factor_prestacional: 0,
    costo_hora_cargado: 0,
    horas_pagadas: 0,
    horas_esperadas: 0,
    horas_descontadas: 0,
    descuento_por_horas: 0,
    alertas: [],
  }
}

const LIQUIDACIONES: Liquidacion[] = [
  liquidacion('t_mensual', 'per_sep', 1_500_000),
  liquidacion('t_hora', 'per_sep', 800_000),
  liquidacion('t_forzado', 'per_sep', 700_000),
  // otro mes: no debe contaminar
  liquidacion('t_mensual', 'per_oct', 9_999_999),
]

const PRODUCTOS: Producto[] = [
  { id: 'p1', codigo: 'BAN', nombre: 'Banca', unidad: 'unidad', margen_objetivo_pct: null, precio_referencia: 20_000, activo: true },
  { id: 'p2', codigo: 'MES', nombre: 'Mesa', unidad: 'unidad', margen_objetivo_pct: null, precio_referencia: null, activo: true },
]

const RECETAS: Record<string, Receta> = {
  p1: { id: 'r1', producto_id: 'p1', version: 1, rendimiento: 1, items: [], horas_mo_estandar: 1, horas_maquina_estandar: 0, vigente: true },
  p2: { id: 'r2', producto_id: 'p2', version: 1, rendimiento: 1, items: [], horas_mo_estandar: 2, horas_maquina_estandar: 0, vigente: true },
}

function costo(recetaId: string, productoId: string, porUnidad: number): CostoReceta {
  return {
    receta_id: recetaId,
    producto_id: productoId,
    lineas: [],
    total_lote: porUnidad,
    por_unidad: porUnidad,
    faltantes: [],
  }
}

const COSTOS_RECETA: Record<string, CostoReceta> = {
  r1: costo('r1', 'p1', 5_000),
  r2: costo('r2', 'p2', 9_000),
}

const ORDENES: OrdenProduccion[] = [
  { id: 'o1', numero: 'OP-1', producto_id: 'p1', cantidad_programada: 300, cantidad_terminada: 300, estado: 'terminada', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-20' },
  { id: 'o2', numero: 'OP-2', producto_id: 'p2', cantidad_programada: 100, cantidad_terminada: 100, estado: 'terminada', fecha_inicio: '2026-09-05', fecha_fin: '2026-09-25' },
  // anulada: no cuenta
  { id: 'o3', numero: 'OP-3', producto_id: 'p1', cantidad_programada: 999, cantidad_terminada: 999, estado: 'anulada', fecha_inicio: '2026-09-05', fecha_fin: '2026-09-25' },
  // de otro mes: no cuenta
  { id: 'o4', numero: 'OP-4', producto_id: 'p1', cantidad_programada: 500, cantidad_terminada: 500, estado: 'terminada', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-20' },
]

/** La mesa no tiene precio de referencia: lo saca de la hoja de su orden. */
const HOJAS = {
  o2: { precio_sugerido: 40_000 } as HojaCostos,
} as Record<string, HojaCostos>

const ENTRADA: EntradaEquilibrio = {
  periodo: '2026-09',
  conceptos: CONCEPTOS,
  categorias: CATEGORIAS,
  gastos: GASTOS,
  trabajadores: TRABAJADORES,
  periodosNomina: PERIODOS_NOMINA,
  liquidaciones: LIQUIDACIONES,
  ordenes: ORDENES,
  productos: PRODUCTOS,
  recetaPorProducto: RECETAS,
  costosReceta: COSTOS_RECETA,
  hojasPorOrden: HOJAS,
}

describe('basesEquilibrio: los costos fijos', () => {
  const b = basesEquilibrio(ENTRADA)

  it('suma CIF fijo + gasto fijo + mano de obra fija, y nada más', () => {
    //   2.000.000  arriendo de planta (CIF fijo)
    // + 1.000.000  administración (gasto, categoría fija)
    // +   400.000  gastos del módulo comercial (100.000 + 300.000)
    // + 1.500.000  mano de obra del mensual
    // = 4.900.000
    expect(b.costos_fijos).toBe(4_900_000)
  })

  it('deja una línea por cada origen, y suman el total', () => {
    const suma = b.lineas_fijas.reduce((s, l) => s + l.monto, 0)
    expect(suma).toBe(b.costos_fijos)

    const origenes = b.lineas_fijas.map((l) => l.origen)
    expect(origenes).toContain('cif')
    expect(origenes).toContain('gasto')
    expect(origenes).toContain('nomina')
  })

  it('NO mete los presupuestados', () => {
    // el arriendo presupuestado de 9.900.000 no aparece en ninguna línea
    expect(b.lineas_fijas.every((l) => l.monto !== 9_900_000)).toBe(true)
  })

  it('NO mete los montos de otro período', () => {
    expect(b.costos_fijos).toBeLessThan(7_777_777)
    expect(b.lineas_fijas.every((l) => l.monto !== 7_777_777)).toBe(true)
  })

  it('avisa de lo que no pudo clasificar y del riesgo de doble conteo', () => {
    expect(b.avisos.some((a) => /categoría no existe o está inactiva/i.test(a))).toBe(true)
    expect(b.avisos.some((a) => /contado dos veces/i.test(a))).toBe(true)
  })

  it('un mensual forzado a variable sale de los fijos', () => {
    const linea = b.lineas_fijas.find((l) => l.origen === 'nomina')
    expect(linea?.monto).toBe(1_500_000)
    expect(linea?.detalle).toMatch(/1 persona/)
    // los otros dos (por hora, y el mensual forzado) van al pozo variable
    expect(b.mano_obra_variable).toBe(1_500_000)
  })
})

describe('basesEquilibrio: el costo variable unitario', () => {
  const b = basesEquilibrio(ENTRADA)

  it('cuenta las unidades del período sin anuladas ni de otros meses', () => {
    expect(b.unidades_totales).toBe(400)
  })

  it('reparte los pozos variables por unidad', () => {
    //   400.000 de energía (CIF variable) / 400 =   1.000
    //   200.000 de comisiones (gasto variable) / 400 =  500
    // 1.500.000 de mano de obra variable / 400 =     3.750
    expect(b.cif_variable).toBe(400_000)
    expect(b.gasto_variable).toBe(200_000)
    expect(b.mano_obra_variable).toBe(1_500_000)

    const banca = b.productos.find((p) => p.producto_id === 'p1')
    expect(banca?.cif_variable_unitario).toBe(1_000)
    expect(banca?.gasto_variable_unitario).toBe(500)
    expect(banca?.mano_obra_variable_unitaria).toBe(3_750)
  })

  it('el CVu es material de la receta + los tres repartos', () => {
    const banca = b.productos.find((p) => p.producto_id === 'p1')
    // 5.000 + 1.000 + 500 + 3.750 = 10.250
    expect(banca?.material_unitario).toBe(5_000)
    expect(banca?.costo_variable_unitario).toBe(10_250)

    const mesa = b.productos.find((p) => p.producto_id === 'p2')
    // 9.000 + 5.250 = 14.250
    expect(mesa?.costo_variable_unitario).toBe(14_250)
  })

  it('el precio sale del producto, y si no tiene, de su hoja de costos', () => {
    const banca = b.productos.find((p) => p.producto_id === 'p1')
    expect(banca?.precio).toBe(20_000)
    expect(banca?.origen_precio).toBe('referencia')

    const mesa = b.productos.find((p) => p.producto_id === 'p2')
    expect(mesa?.precio).toBe(40_000)
    expect(mesa?.origen_precio).toBe('hoja')
  })

  it('un producto sin receta queda en cero y lo dice', () => {
    const b2 = basesEquilibrio({ ...ENTRADA, recetaPorProducto: {} })
    const banca = b2.productos.find((p) => p.producto_id === 'p1')

    expect(banca?.material_unitario).toBe(0)
    expect(banca?.faltantes.some((f) => /receta vigente/i.test(f))).toBe(true)
  })

  it('sin unidades producidas no reparte nada y avisa', () => {
    const b3 = basesEquilibrio({ ...ENTRADA, ordenes: [] })
    expect(b3.unidades_totales).toBe(0)
    expect(b3.productos).toHaveLength(0)
    expect(b3.avisos.some((a) => /no tiene unidades producidas/i.test(a))).toBe(true)
  })
})

describe('de la clasificación al punto de equilibrio', () => {
  it('el equilibrio de la banca sale de los datos derivados', () => {
    const b = basesEquilibrio(ENTRADA)
    const banca = b.productos.find((p) => p.producto_id === 'p1')!

    const r = puntoEquilibrio(b.costos_fijos, banca.precio, banca.costo_variable_unitario)

    // MC = 20.000 − 10.250 = 9.750
    expect(r.margen_contribucion).toBe(9_750)
    // 4.900.000 / 9.750 = 502,56… -> 503 unidades
    expect(r.unidades).toBeCloseTo(4_900_000 / 9_750, 10)
    expect(r.unidades_enteras).toBe(503)
    expect(r.valido).toBe(true)
  })

  it('y el de la empresa, con la mezcla que traen las órdenes', () => {
    const esc = escenarioEquilibrio(ENTRADA, [])

    const r = equilibrioMezcla(
      esc.productos.map((p) => ({
        producto_id: p.producto_id,
        nombre: p.nombre,
        unidades_canasta: p.mezcla_unidades,
        precio: p.precio_usado,
        costo_variable_unitario: p.cvu_usado,
      })),
      esc.costos_fijos,
    )

    // la canasta precargada es 300 bancas + 100 mesas, las unidades del mes
    // MC canasta = 300 x 9.750 + 100 x 25.750 = 2.925.000 + 2.575.000 = 5.500.000
    expect(r.margen_contribucion_canasta).toBe(5_500_000)
    // 4.900.000 / 5.500.000 = 0,8909… de una canasta: el mes alcanzó el equilibrio
    expect(r.canastas).toBeCloseTo(0.890909, 5)
    expect(r.canastas).toBeLessThan(1)
    expect(r.valido).toBe(true)
  })
})

describe('los supuestos a mano', () => {
  const SUPUESTOS: SupuestoEquilibrio[] = [
    { id: 's1', periodo: '2026-09', producto_id: null, costos_fijos: 6_000_000, precio_venta: null, costo_variable_unitario: null, mezcla_unidades: null },
    { id: 's2', periodo: '2026-09', producto_id: 'p1', costos_fijos: null, precio_venta: 25_000, costo_variable_unitario: null, mezcla_unidades: 2 },
    { id: 's3', periodo: '2026-10', producto_id: 'p1', costos_fijos: null, precio_venta: 1, costo_variable_unitario: null, mezcla_unidades: null },
  ]

  const esc = aplicarSupuestos(basesEquilibrio(ENTRADA), SUPUESTOS)

  it('el manual manda y queda marcado como manual', () => {
    expect(esc.costos_fijos).toBe(6_000_000)
    expect(esc.origen_costos_fijos).toBe('manual')

    const banca = esc.productos.find((p) => p.producto_id === 'p1')!
    expect(banca.precio_usado).toBe(25_000)
    expect(banca.origen_precio_usado).toBe('manual')
    expect(banca.mezcla_unidades).toBe(2)
    expect(banca.origen_mezcla).toBe('manual')
  })

  it('un campo en null se sigue derivando', () => {
    const banca = esc.productos.find((p) => p.producto_id === 'p1')!
    expect(banca.cvu_usado).toBe(10_250)
    expect(banca.origen_cvu).toBe('derivado')
  })

  it('un producto sin fila de supuestos queda todo derivado', () => {
    const mesa = esc.productos.find((p) => p.producto_id === 'p2')!
    expect(mesa.origen_precio_usado).toBe('derivado')
    expect(mesa.origen_cvu).toBe('derivado')
    expect(mesa.precio_usado).toBe(40_000)
  })

  it('no toma los supuestos de otro período', () => {
    const banca = esc.productos.find((p) => p.producto_id === 'p1')!
    expect(banca.precio_usado).not.toBe(1)
  })

  it('sin supuestos, el escenario es el derivado puro', () => {
    const limpio = aplicarSupuestos(basesEquilibrio(ENTRADA), [])
    expect(limpio.hay_supuestos).toBe(false)
    expect(limpio.costos_fijos).toBe(4_900_000)
    expect(limpio.origen_costos_fijos).toBe('derivado')
  })

  it('supuestoDe encuentra la fila del período y la del producto', () => {
    expect(supuestoDe(SUPUESTOS, '2026-09', null)?.id).toBe('s1')
    expect(supuestoDe(SUPUESTOS, '2026-09', 'p1')?.id).toBe('s2')
    expect(supuestoDe(SUPUESTOS, '2026-09', 'p2')).toBeUndefined()
  })

  it('el supuesto cambia el equilibrio y se puede verificar a mano', () => {
    const banca = esc.productos.find((p) => p.producto_id === 'p1')!
    const r = puntoEquilibrio(esc.costos_fijos, banca.precio_usado, banca.cvu_usado)

    // MC = 25.000 − 10.250 = 14.750; 6.000.000 / 14.750 = 406,78 -> 407
    expect(r.margen_contribucion).toBe(14_750)
    expect(r.unidades_enteras).toBe(407)
  })
})

describe('el redondeo de unidades no inventa una unidad de más', () => {
  /*
    Lo encontre probando el ejercicio real: con CF 17.343.236, CVu 257.531,04 y
    200 unidades, el precio por utilidad objetivo da exactamente 200 unidades
    necesarias, pero la division se guarda como 200,00000000000003 y Math.ceil
    la convertia en 201. Una unidad que no existe, y el usuario no tiene forma
    de saberlo.
  */
  it('un resultado entero con error de coma flotante se queda entero', () => {
    const cf = 17_343_236
    const cvu = 257_531.04
    const q = 200
    const u = 1_000_000

    const precio = precioParaUtilidad(cf, cvu, q, u)
    const necesarias = unidadesParaUtilidad(cf, precio.precio, cvu, u)

    expect(necesarias.unidades).toBeCloseTo(200, 6)
    expect(necesarias.unidades_enteras).toBe(200)
  })

  it('pero medio decimal de verdad sí sube a la siguiente unidad', () => {
    // 1.000.001 / 2.000 = 500,0005: 500 no alcanza
    const r = puntoEquilibrio(1_000_001, 5_000, 3_000)
    expect(r.unidades_enteras).toBe(501)
  })

  it('y en la mezcla también', () => {
    const r = equilibrioMezcla(
      [{ producto_id: 'p1', nombre: 'Banca', unidades_canasta: 3, precio: 10_000, costo_variable_unitario: 6_000 }],
      // 3 x 4.000 = 12.000 por canasta; 120.000 / 12.000 = 10 canastas = 30 unidades
      120_000,
    )
    expect(r.lineas[0].unidades_enteras).toBe(30)
  })
})
