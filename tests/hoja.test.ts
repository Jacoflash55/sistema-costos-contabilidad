import { describe, expect, it } from 'vitest'

import { CONFIG_BASE, calcularTodo } from '../src/datos'
import {
  armarHoja,
  diferenciasEntre,
  finalizarHoja,
  hojaDeOrden,
  margenDe,
  precioSugerido,
  reabrirHoja,
  siguienteNumeroHoja,
} from '../src/lib/hoja'
import type { EntradaHoja } from '../src/lib/hoja'
import type {
  CIFOrden,
  Config,
  DatosCrudos,
  HojaRegistro,
  ManoObraOrden,
  MaterialesOrden,
  OrdenProduccion,
  OtroCostoDirecto,
  Producto,
} from '../src/lib/tipos'

// =====================================================================
// Fábricas
// =====================================================================

const CONFIG: Config = {
  ...CONFIG_BASE,
  empresa: { ...CONFIG_BASE.empresa, razon_social: 'Carpintería de Prueba S.A.S.', nit: '900.000.000-0' },
  parametros: {
    ...CONFIG_BASE.parametros,
    factor_prestacional: 0.5,
    margen_por_defecto_pct: 30,
    redondeo_precio_multiplo: 100,
    metodo_margen: 'sobre_costo',
  },
}

const PRODUCTO: Producto = {
  id: 'p1',
  codigo: 'PT-001',
  nombre: 'Mesa de comedor',
  unidad: 'unidad',
  margen_objetivo_pct: null,
  precio_referencia: null,
  activo: true,
}

const ORDEN: OrdenProduccion = {
  id: 'op1',
  numero: 'OP-001',
  producto_id: 'p1',
  cantidad_programada: 100,
  cantidad_terminada: 100,
  fecha_inicio: '2026-02-01',
  fecha_fin: '2026-02-20',
  estado: 'terminada',
}

function registro(p: Partial<HojaRegistro> = {}): HojaRegistro {
  return {
    id: 'h1',
    orden_id: 'op1',
    numero: 'HC-001',
    fecha_elaboracion: '2026-02-21',
    observaciones: '',
    estado: 'borrador',
    margen_metodo: null,
    margen_pct: null,
    version: 1,
    congelada: null,
    historial: [],
    ...p,
  }
}

/*
  OCHO MATERIALES. Los totales suman $1.060.000 y están elegidos para poder
  verificar la hoja a mano:

    300.000 + 250.000 + 180.000 + 120.000 + 90.000 + 60.000 + 40.000 + 20.000
*/
const TOTALES_MATERIAL = [300_000, 250_000, 180_000, 120_000, 90_000, 60_000, 40_000, 20_000]

const MATERIALES: MaterialesOrden = {
  orden_id: 'op1',
  lineas: TOTALES_MATERIAL.map((total, i) => ({
    consumo_id: `c${i + 1}`,
    materia_prima_id: `mp${i + 1}`,
    codigo: `MP-00${i + 1}`,
    nombre: `Material ${i + 1}`,
    unidad: 'unidad' as const,
    cantidad: 10,
    costo_unitario: total / 10,
    costo_total: total,
    aplicado: true,
  })),
  total: TOTALES_MATERIAL.reduce((s, v) => s + v, 0),
}

/*
  DOS TRABAJADORES:
    Ana   100 h x $9.000  = $  900.000
    Luis   60 h x $12.000 = $  720.000
                            ----------
                            $1.620.000
*/
const MANO_OBRA: ManoObraOrden = {
  orden_id: 'op1',
  lineas: [
    {
      asignacion_id: 'a1',
      trabajador_id: 't1',
      codigo: 'T-001',
      nombre: 'Ana Gómez',
      tipo_hora: 'ordinaria',
      horas: 100,
      valor_hora: 6000,
      recargo: 1,
      costo_salario: 600_000,
      costo_empresa: 900_000,
      total: 900_000,
    },
    {
      asignacion_id: 'a2',
      trabajador_id: 't2',
      codigo: 'T-002',
      nombre: 'Luis Pérez',
      tipo_hora: 'ordinaria',
      horas: 60,
      valor_hora: 8000,
      recargo: 1,
      costo_salario: 480_000,
      costo_empresa: 720_000,
      total: 720_000,
    },
  ],
  horas: 160,
  total_salario: 1_080_000,
  total_con_factor: 1_620_000,
  total: 1_620_000,
}

/** CIF por unidades: tasa $25.000 x 100 unidades = $2.500.000 */
const CIF: CIFOrden = {
  orden_id: 'op1',
  periodo: '2026-02',
  base: 'unidades',
  tasa: 25_000,
  nivel_actividad: 100,
  importe: 2_500_000,
  valido: true,
  estimado: false,
}

const OTROS: OtroCostoDirecto[] = [
  { id: 'o1', orden_id: 'op1', fecha: '2026-02-18', concepto: 'Flete de entrega', monto: 120_000 },
]

function entrada(p: Partial<EntradaHoja> = {}): EntradaHoja {
  return {
    registro: registro(),
    orden: ORDEN,
    producto: PRODUCTO,
    cliente: { id: 'cl1', nombre: 'Muebles del Norte', activo: true },
    materiales: MATERIALES,
    manoObra: MANO_OBRA,
    cif: CIF,
    otros: OTROS,
    config: CONFIG,
    ...p,
  }
}

// =====================================================================
// 1. LA HOJA COMPLETA, VERIFICADA A MANO
// =====================================================================

describe('hoja con 8 materiales, 2 trabajadores y CIF por unidades', () => {
  /*
      (A) materia prima directa   $1.060.000
      (B) mano de obra directa    $1.620.000
      (C) CIF aplicados           $2.500.000
      (D) otros directos          $  120.000
                                  ----------
      COSTO TOTAL                 $5.300.000
      cantidad producida                 100
      COSTO UNITARIO              $   53.000
  */
  const hoja = armarHoja(entrada())

  it('los tres bloques se llenan solos, sin reescribir nada', () => {
    expect(hoja.materiales).toHaveLength(8)
    expect(hoja.mano_obra).toHaveLength(2)
    expect(hoja.cif).toHaveLength(1)
    expect(hoja.otros).toHaveLength(1)
  })

  it('los totales de cada bloque', () => {
    expect(hoja.total_materiales).toBe(1_060_000)
    expect(hoja.total_mano_obra).toBe(1_620_000)
    expect(hoja.total_cif).toBe(2_500_000)
    expect(hoja.total_otros).toBe(120_000)
  })

  it('costo primo y costo de conversión', () => {
    expect(hoja.costo_primo).toBe(2_680_000) // A + B
    expect(hoja.costo_conversion).toBe(4_120_000) // B + C
  })

  it('costo total y costo unitario exactos', () => {
    expect(hoja.costo_total).toBe(5_300_000)
    expect(hoja.cantidad_producida).toBe(100)
    expect(hoja.costo_unitario).toBe(53_000)
  })

  it('el encabezado trae lo que tiene que traer', () => {
    expect(hoja.numero).toBe('HC-001')
    expect(hoja.orden_numero).toBe('OP-001')
    expect(hoja.empresa).toBe('Carpintería de Prueba S.A.S.')
    expect(hoja.cliente).toBe('Muebles del Norte')
    expect(hoja.producto).toBe('Mesa de comedor')
    expect(hoja.producto_codigo).toBe('PT-001')
    expect(hoja.cantidad_solicitada).toBe(100)
    expect(hoja.fecha_elaboracion).toBe('2026-02-21')
  })

  it('el renglón de CIF muestra base, tasa y nivel de actividad', () => {
    const r = hoja.cif[0]
    expect(r.cantidad).toBe(100)
    expect(r.costo_unitario).toBe(25_000)
    expect(r.total).toBe(2_500_000)
    expect(r.detalle).toContain('Tasa del período')
  })

  it('la mano de obra muestra la tarifa que de verdad se cargó', () => {
    const ana = hoja.mano_obra.find((r) => r.concepto === 'Ana Gómez')!
    expect(ana.cantidad).toBe(100)
    expect(ana.costo_unitario).toBe(9000) // 900.000 / 100 h
  })

  it('queda completa y sin faltantes', () => {
    expect(hoja.completa).toBe(true)
    expect(hoja.faltantes).toEqual([])
  })

  it('cada peso aparece UNA sola vez: la suma de los bloques es el costo total', () => {
    const suma =
      hoja.total_materiales + hoja.total_mano_obra + hoja.total_cif + hoja.total_otros
    expect(suma).toBe(hoja.costo_total)
  })
})

describe('un material que no se aplicó por falta de saldo no entra al costo', () => {
  it('se deja por fuera y se avisa', () => {
    const conFallo: MaterialesOrden = {
      ...MATERIALES,
      lineas: [
        ...MATERIALES.lineas,
        {
          consumo_id: 'cx',
          materia_prima_id: 'mpx',
          codigo: 'MP-XXX',
          nombre: 'Material sin saldo',
          unidad: 'unidad',
          cantidad: 50,
          costo_unitario: 0,
          costo_total: 0,
          aplicado: false,
        },
      ],
    }
    const hoja = armarHoja(entrada({ materiales: conFallo }))
    expect(hoja.materiales).toHaveLength(8)
    expect(hoja.total_materiales).toBe(1_060_000)
    expect(hoja.advertencias.some((a) => a.includes('no se aplicaron'))).toBe(true)
  })
})

// =====================================================================
// 2. CAMBIAR LA CANTIDAD PRODUCIDA
// =====================================================================

describe('subir la cantidad producida de 100 a 120', () => {
  /*
      El CIF de la orden cambia porque la base del período cambia. Con un pozo
      de $2.200.000 y otra orden de 100 unidades:

        100 unidades -> nivel 200 -> tasa $11.000 -> CIF orden $1.100.000
        120 unidades -> nivel 220 -> tasa $10.000 -> CIF orden $1.200.000
  */
  const cif100: CIFOrden = { ...CIF, tasa: 11_000, nivel_actividad: 100, importe: 1_100_000 }
  const cif120: CIFOrden = { ...CIF, tasa: 10_000, nivel_actividad: 120, importe: 1_200_000 }

  const con100 = armarHoja(entrada({ cif: cif100 }))
  const con120 = armarHoja(
    entrada({ orden: { ...ORDEN, cantidad_terminada: 120 }, cif: cif120 }),
  )

  it('el CIF asignado se actualiza', () => {
    expect(con100.total_cif).toBe(1_100_000)
    expect(con120.total_cif).toBe(1_200_000)
  })

  it('el costo total y el unitario se actualizan', () => {
    // 1.060.000 + 1.620.000 + 1.100.000 + 120.000
    expect(con100.costo_total).toBe(3_900_000)
    expect(con100.costo_unitario).toBe(39_000)

    // 1.060.000 + 1.620.000 + 1.200.000 + 120.000
    expect(con120.costo_total).toBe(4_000_000)
    expect(con120.costo_unitario).toBeCloseTo(4_000_000 / 120, 6)
  })

  it('producir más baja el costo unitario', () => {
    expect(con120.costo_unitario).toBeLessThan(con100.costo_unitario)
  })
})

// =====================================================================
// 3. BORRADOR CUANDO FALTA LO ESENCIAL
// =====================================================================

describe('una hoja sin datos esenciales no muestra totales falsos', () => {
  it('sin cantidad producida queda incompleta y sin costo unitario', () => {
    const hoja = armarHoja(entrada({ orden: { ...ORDEN, cantidad_terminada: null, estado: 'en_proceso' } }))
    expect(hoja.completa).toBe(false)
    expect(hoja.faltantes.some((f) => f.includes('cantidad producida'))).toBe(true)
    expect(hoja.costo_unitario).toBe(0)
    // el costo total si se puede mostrar: eso si esta cargado
    expect(hoja.costo_total).toBe(5_300_000)
  })

  it('con cantidad producida en cero tampoco se puede repartir', () => {
    const hoja = armarHoja(entrada({ orden: { ...ORDEN, cantidad_terminada: 0 } }))
    expect(hoja.completa).toBe(false)
    expect(hoja.costo_unitario).toBe(0)
  })

  it('sin ningún costo cargado, la hoja no dice nada', () => {
    const hoja = armarHoja(
      entrada({ materiales: undefined, manoObra: undefined, cif: undefined, otros: [] }),
    )
    expect(hoja.completa).toBe(false)
    expect(hoja.costo_total).toBe(0)
    expect(hoja.faltantes.some((f) => f.includes('ningún costo'))).toBe(true)
  })

  it('sin CIF válidos avisa, pero no bloquea: el período puede no tener CIF', () => {
    const sinTasa: CIFOrden = { ...CIF, valido: false, importe: 0, tasa: 0, nota: 'Sin nivel de actividad.' }
    const hoja = armarHoja(entrada({ cif: sinTasa }))
    expect(hoja.completa).toBe(true)
    expect(hoja.total_cif).toBe(0)
    expect(hoja.advertencias.length).toBeGreaterThan(0)
  })

  it('avisa cuando se produjo menos de lo programado', () => {
    const hoja = armarHoja(entrada({ orden: { ...ORDEN, cantidad_terminada: 80 } }))
    expect(hoja.advertencias.some((a) => a.includes('80 de 100'))).toBe(true)
  })
})

// =====================================================================
// 4. MARGEN Y PRECIO
// =====================================================================

describe('precio de venta sugerido', () => {
  it('recargo sobre el costo: PV = costo x (1 + r)', () => {
    const r = precioSugerido(53_000, 'sobre_costo', 30, 100)
    expect(r.precio).toBe(68_900) // 53.000 x 1,30
    expect(r.utilidad).toBe(15_900)
  })

  it('margen sobre la venta: PV = costo / (1 - m)', () => {
    const r = precioSugerido(53_000, 'sobre_precio', 30, 100)
    // 53.000 / 0,70 = 75.714,28... redondeado ARRIBA al centenar
    expect(r.precio).toBe(75_800)
    expect(r.utilidad).toBe(22_800)
  })

  it('los dos métodos dan resultados distintos con el mismo porcentaje', () => {
    const costo = precioSugerido(53_000, 'sobre_costo', 30, 100).precio!
    const venta = precioSugerido(53_000, 'sobre_precio', 30, 100).precio!
    expect(venta).toBeGreaterThan(costo)
    expect(venta).not.toBe(costo)
  })

  it('el margen sobre la venta de verdad deja ese margen', () => {
    const r = precioSugerido(70_000, 'sobre_precio', 20, 1)
    // 70.000 / 0,8 = 87.500 ; utilidad 17.500 ; 17.500 / 87.500 = 20%
    expect(r.precio).toBe(87_500)
    expect(r.utilidad! / r.precio!).toBeCloseTo(0.2, 10)
  })

  it('margen sobre la venta del 100%: NO se calcula y se explica', () => {
    const r = precioSugerido(53_000, 'sobre_precio', 100, 100)
    expect(r.precio).toBe(null)
    expect(r.utilidad).toBe(null)
    expect(r.problema).toContain('menor que 100%')
  })

  it('más de 100% tampoco', () => {
    expect(precioSugerido(53_000, 'sobre_precio', 150, 100).precio).toBe(null)
  })

  it('un recargo sobre el costo del 100% sí es válido: duplica el precio', () => {
    expect(precioSugerido(50_000, 'sobre_costo', 100, 1).precio).toBe(100_000)
  })

  it('sin costo unitario no hay precio que sugerir', () => {
    const r = precioSugerido(0, 'sobre_costo', 30, 100)
    expect(r.precio).toBe(null)
    expect(r.problema).toContain('Sin costo unitario')
  })

  it('el redondeo del precio es hacia arriba, para no comerse el margen', () => {
    const r = precioSugerido(10_001, 'sobre_costo', 0, 1000)
    expect(r.precio).toBe(11_000)
  })
})

describe('de dónde sale el porcentaje de margen', () => {
  it('la hoja manda sobre el producto y sobre la configuración', () => {
    const m = margenDe({ margen_metodo: 'sobre_precio', margen_pct: 15 }, { ...PRODUCTO, margen_objetivo_pct: 40 }, CONFIG)
    expect(m).toEqual({ metodo: 'sobre_precio', pct: 15, origen: 'hoja' })
  })

  it('si la hoja no dice nada, manda el producto', () => {
    const m = margenDe({ margen_metodo: null, margen_pct: null }, { ...PRODUCTO, margen_objetivo_pct: 40 }, CONFIG)
    expect(m).toEqual({ metodo: 'sobre_costo', pct: 40, origen: 'producto' })
  })

  it('y si tampoco, la configuración', () => {
    const m = margenDe({ margen_metodo: null, margen_pct: null }, PRODUCTO, CONFIG)
    expect(m).toEqual({ metodo: 'sobre_costo', pct: 30, origen: 'configuracion' })
  })

  it('la hoja usa el margen y deja ver de dónde salió', () => {
    const hoja = armarHoja(entrada({ registro: registro({ margen_pct: 50 }) }))
    expect(hoja.margen_pct).toBe(50)
    expect(hoja.margen_origen).toBe('hoja')
    expect(hoja.precio_sugerido).toBe(79_500) // 53.000 x 1,5
    expect(hoja.utilidad_unitaria).toBe(26_500)
  })

  it('con margen imposible la hoja no inventa un precio', () => {
    const hoja = armarHoja(
      entrada({ registro: registro({ margen_metodo: 'sobre_precio', margen_pct: 100 }) }),
    )
    expect(hoja.precio_sugerido).toBe(null)
    expect(hoja.utilidad_unitaria).toBe(null)
    expect(hoja.advertencias.some((a) => a.includes('menor que 100%'))).toBe(true)
  })
})

// =====================================================================
// 5. FINALIZAR, CONGELAR Y TRAZAR
// =====================================================================

describe('finalizar una hoja la congela', () => {
  const hoja = armarHoja(entrada())
  const r = finalizarHoja(registro(), hoja, '', '2026-02-21T10:00:00.000Z')

  it('queda finalizada, con la foto guardada', () => {
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.registro.estado).toBe('finalizada')
    expect(r.registro.congelada?.costo_total).toBe(5_300_000)
    expect(r.registro.version).toBe(1)
    expect(r.registro.historial).toEqual([])
  })

  it('una hoja finalizada NO cambia aunque cambien los datos de origen', () => {
    if (!r.ok) return

    // el material se encarece y la cantidad producida cambia, pero la hoja
    // finalizada tiene que seguir mostrando lo que se firmo
    const despues = armarHoja(
      entrada({
        registro: r.registro,
        materiales: { ...MATERIALES, total: 9_999_999 },
        orden: { ...ORDEN, cantidad_terminada: 500 },
      }),
    )

    expect(despues.costo_total).toBe(5_300_000)
    expect(despues.costo_unitario).toBe(53_000)
    expect(despues.cantidad_producida).toBe(100)
  })

  it('no deja finalizar una hoja incompleta', () => {
    const incompleta = armarHoja(entrada({ orden: { ...ORDEN, cantidad_terminada: null } }))
    const malo = finalizarHoja(registro(), incompleta, '')
    expect(malo.ok).toBe(false)
    if (malo.ok) return
    expect(malo.faltantes.length).toBeGreaterThan(0)
  })
})

describe('corregir una hoja finalizada deja trazabilidad', () => {
  const primera = finalizarHoja(registro(), armarHoja(entrada()), '', '2026-02-21T10:00:00.000Z')

  it('reabrir la vuelve a borrador sin perder la foto', () => {
    if (!primera.ok) return
    const reabierta = reabrirHoja(primera.registro)
    expect(reabierta.estado).toBe('borrador')
    expect(reabierta.congelada).not.toBe(null)

    // en borrador vuelve a calcular con los datos de hoy
    const recalculada = armarHoja(entrada({ registro: reabierta, orden: { ...ORDEN, cantidad_terminada: 120 } }))
    expect(recalculada.cantidad_producida).toBe(120)
  })

  it('al volver a finalizar sube la versión y registra qué cambió', () => {
    if (!primera.ok) return
    const reabierta = reabrirHoja(primera.registro)

    // se corrigio la cantidad producida: 100 -> 120
    const nueva = armarHoja(
      entrada({
        registro: reabierta,
        orden: { ...ORDEN, cantidad_terminada: 120 },
        cif: { ...CIF, nivel_actividad: 120, tasa: 25_000, importe: 3_000_000 },
      }),
    )
    const segunda = finalizarHoja(reabierta, nueva, 'Se corrigió la cantidad producida', '2026-03-01T09:00:00.000Z')

    expect(segunda.ok).toBe(true)
    if (!segunda.ok) return

    expect(segunda.registro.version).toBe(2)
    expect(segunda.registro.historial).toHaveLength(1)

    const cambio = segunda.registro.historial[0]
    expect(cambio.version).toBe(2)
    expect(cambio.motivo).toBe('Se corrigió la cantidad producida')
    expect(cambio.costo_total_antes).toBe(5_300_000)
    expect(cambio.costo_total_despues).toBe(5_800_000)
    expect(cambio.costo_unitario_antes).toBe(53_000)
    expect(cambio.diferencias.some((d) => d.includes('cantidad producida'))).toBe(true)
    expect(cambio.diferencias.some((d) => d.includes('Costo total'))).toBe(true)
  })

  it('sin motivo deja constancia de que no se dio', () => {
    if (!primera.ok) return
    const reabierta = reabrirHoja(primera.registro)
    const segunda = finalizarHoja(reabierta, armarHoja(entrada({ registro: reabierta })), '')
    if (!segunda.ok) return
    expect(segunda.registro.historial[0].motivo).toContain('sin motivo')
  })
})

describe('diferenciasEntre describe los cambios en palabras', () => {
  const antes = armarHoja(entrada())
  const despues = armarHoja(entrada({ cif: { ...CIF, importe: 3_000_000 } }))

  it('nombra el bloque que se movió', () => {
    const d = diferenciasEntre(antes, despues)
    expect(d.some((x) => x.includes('CIF aplicados') && x.includes('subió'))).toBe(true)
  })

  it('dice cuando nada cambió', () => {
    expect(diferenciasEntre(antes, antes)[0]).toContain('Ninguna cifra cambió')
  })
})

describe('numeración de hojas', () => {
  it('arranca en HC-001 y sigue el máximo', () => {
    expect(siguienteNumeroHoja([])).toBe('HC-001')
    expect(siguienteNumeroHoja([registro({ numero: 'HC-001' })])).toBe('HC-002')
    expect(
      siguienteNumeroHoja([registro({ numero: 'HC-001' }), registro({ numero: 'HC-014' })]),
    ).toBe('HC-015')
  })

  it('ignora números escritos a mano con otro formato', () => {
    expect(siguienteNumeroHoja([registro({ numero: 'hoja de Pedro' })])).toBe('HC-001')
  })

  it('encuentra la hoja de una orden', () => {
    const hojas = [registro({ id: 'h1', orden_id: 'op1' }), registro({ id: 'h2', orden_id: 'op2' })]
    expect(hojaDeOrden(hojas, 'op2')?.id).toBe('h2')
    expect(hojaDeOrden(hojas, 'op9')).toBeUndefined()
  })
})

// =====================================================================
// 6. LA INTEGRACION COMPLETA: material -> MO -> CIF -> hoja
// =====================================================================

describe('integración de punta a punta por calcularTodo', () => {
  /*
    Un caso chico y verificable, armado solo con datos CRUDOS. Si la hoja sale
    bien, es porque el Kardex, la nomina y el CIF se conectaron de verdad: aqui
    no se escribe ningun costo.

      material: 50 u a $1.000 + 100 u a $500   = $100.000
      mano de obra: 20 h x ($6.000 x 1,5)      = $180.000
      CIF: $200.000 / 20 unidades = $10.000/u  = $200.000
                                                 --------
      costo total                                $480.000
      20 unidades -> costo unitario              $ 24.000
  */
  const datos: DatosCrudos = {
    config: {
      ...CONFIG,
      parametros: { ...CONFIG.parametros, horas_mes: 240, factor_prestacional: 0.5, base_cif: 'unidades' },
    },
    nomina: {
      trabajadores: [
        {
          id: 't1',
          codigo: 'T-001',
          nombre: 'Ana Gómez',
          cargo: 'Ebanista',
          area: 'Planta',
          clasificacion: 'directa',
          modalidad: 'mensual',
          salario_basico: 1_440_000,
          tarifa_hora: 0,
          tiene_auxilio_transporte: false,
          tipo_contrato: 'termino_indefinido',
          fecha_ingreso: '2025-01-01',
          activo: true,
        },
      ],
      periodos: [
        { id: 'per1', nombre: 'Febrero', mes: '2026-02', desde: '2026-02-01', hasta: '2026-02-28', estado: 'abierto' },
      ],
      registros_horas: [
        { id: 'rh1', trabajador_id: 't1', periodo_id: 'per1', fecha: '2026-02-28', tipo_hora: 'ordinaria', horas: 240 },
      ],
      conceptos: [],
      novedades: [],
    },
    inventario: {
      materias_primas: [
        {
          id: 'mp1',
          codigo: 'MP-001',
          nombre: 'Madera',
          descripcion: '',
          unidad: 'unidad',
          categoria: 'Maderas',
          cantidad_inicial: 100,
          costo_unitario_inicial: 1000,
          stock_minimo: 0,
          proveedor: '',
          activo: true,
        },
        {
          id: 'mp2',
          codigo: 'MP-002',
          nombre: 'Tornillos',
          descripcion: '',
          unidad: 'unidad',
          categoria: 'Ferretería',
          cantidad_inicial: 200,
          costo_unitario_inicial: 500,
          stock_minimo: 0,
          proveedor: '',
          activo: true,
        },
      ],
      compras: [],
      movimientos: [],
    },
    produccion: {
      productos: [PRODUCTO],
      recetas: [],
      ordenes: [
        {
          id: 'op1',
          numero: 'OP-001',
          producto_id: 'p1',
          cantidad_programada: 20,
          cantidad_terminada: 20,
          fecha_inicio: '2026-02-01',
          fecha_fin: '2026-02-20',
          estado: 'terminada',
          cliente_id: 'cl1',
        },
      ],
      consumos: [
        { id: 'c1', orden_id: 'op1', materia_prima_id: 'mp1', fecha: '2026-02-10', documento: 'REQ-1', cantidad: 50, unidad: 'unidad', costo_unitario: null },
        { id: 'c2', orden_id: 'op1', materia_prima_id: 'mp2', fecha: '2026-02-10', documento: 'REQ-1', cantidad: 100, unidad: 'unidad', costo_unitario: null },
      ],
      asignaciones_mo: [
        { id: 'am1', orden_id: 'op1', trabajador_id: 't1', periodo_id: 'per1', fecha: '2026-02-10', tipo_hora: 'ordinaria', horas: 20, tarifa_hora: null },
      ],
      otros_directos: [],
      hojas: [registro({ id: 'h1', orden_id: 'op1', numero: 'HC-001' })],
    },
    cif: {
      categorias: [
        { id: 'cat1', nombre: 'Servicios de planta', naturaleza: 'cif', comportamiento: 'variable', base: null, activa: true },
        { id: 'cat2', nombre: 'Administración', naturaleza: 'administracion', comportamiento: 'fijo', base: null, activa: true },
      ],
      cif: [
        { id: 'x1', fecha: '2026-02-15', periodo: '2026-02', categoria_id: 'cat1', concepto: 'Energía', monto: 200_000, documento: '', presupuestado: false },
        { id: 'x2', fecha: '2026-02-15', periodo: '2026-02', categoria_id: 'cat2', concepto: 'Arriendo oficina', monto: 900_000, documento: '', presupuestado: false },
      ],
    },
    comercial: {
      clientes: [{ id: 'cl1', nombre: 'Muebles del Norte', activo: true }],
      ventas: [],
      gastos: [],
    },
  }

  const c = calcularTodo(datos, '2026-03-01')
  const hoja = c.hojasPorOrden.op1

  it('el material sale del Kardex', () => {
    expect(hoja.total_materiales).toBe(100_000)
    expect(hoja.materiales).toHaveLength(2)
    expect(hoja.materiales[0].costo_unitario).toBe(1000)
  })

  it('la mano de obra sale de la nómina', () => {
    expect(hoja.total_mano_obra).toBe(180_000)
    expect(hoja.mano_obra).toHaveLength(1)
    expect(hoja.mano_obra[0].cantidad).toBe(20)
    expect(hoja.mano_obra[0].costo_unitario).toBe(9000) // 6.000 x 1,5
  })

  it('el CIF sale de la tasa del período, y el gasto de oficina NO entra', () => {
    expect(c.tasaPorPeriodo['2026-02'].tasa).toBe(10_000) // 200.000 / 20 unidades
    expect(c.tasaPorPeriodo['2026-02'].gastos_del_periodo).toBe(900_000)
    expect(hoja.total_cif).toBe(200_000)
  })

  it('el costo total y el unitario cierran', () => {
    expect(hoja.costo_total).toBe(480_000)
    expect(hoja.costo_unitario).toBe(24_000)
    expect(hoja.completa).toBe(true)
  })

  it('el encabezado toma el cliente de la orden', () => {
    expect(hoja.cliente).toBe('Muebles del Norte')
  })

  it('el precio sugerido usa el margen de la configuración', () => {
    // 24.000 x 1,30 = 31.200
    expect(hoja.margen_origen).toBe('configuracion')
    expect(hoja.precio_sugerido).toBe(31_200)
    expect(hoja.utilidad_unitaria).toBe(7_200)
  })

  it('cambiar un costo de material recalcula la hoja en borrador', () => {
    // entra una compra mas cara: el promedio de mp1 sube de 1.000 a 1.500
    const conCompra: DatosCrudos = {
      ...datos,
      inventario: {
        ...datos.inventario,
        movimientos: [
          {
            id: 'k1',
            fecha: '2026-02-05',
            materia_prima_id: 'mp1',
            tipo: 'entrada_compra',
            concepto: 'Compra',
            documento: 'FC-1',
            cantidad: 100,
            costo_unitario: 2000,
          },
        ],
      },
    }
    const c2 = calcularTodo(conCompra, '2026-03-01')
    const hoja2 = c2.hojasPorOrden.op1

    // 100 a 1.000 + 100 a 2.000 = promedio 1.500 ; 50 x 1.500 = 75.000
    expect(c2.tarjetas.mp1.costo_promedio).toBe(1500)
    expect(hoja2.total_materiales).toBe(125_000) // 75.000 + 50.000
    expect(hoja2.costo_total).toBe(505_000)
    expect(hoja2.costo_unitario).toBe(25_250)
  })
})
