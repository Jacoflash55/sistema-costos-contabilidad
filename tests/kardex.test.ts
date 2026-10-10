import { describe, expect, it } from 'vitest'

import {
  construirTarjetas,
  costoReceta,
  esEntrada,
  historialKardex,
  idMovimientoConsumo,
  materialesDeOrdenes,
  metodoEfectivo,
  movimientosDeConsumos,
  tarjetaDeMateria,
  validarSalida,
} from '../src/lib/kardex'
import { compatibles, convertir } from '../src/lib/unidades'
import type {
  ConsumoMaterial,
  MateriaPrima,
  MovimientoKardex,
  OrdenProduccion,
  Receta,
  TipoMovimientoKardex,
  UnidadMedida,
} from '../src/lib/tipos'

// ---------------------------------------------------------------------
// Fábricas: solo lo que cada test necesita decir en voz alta
// ---------------------------------------------------------------------

function mp(parcial: Partial<MateriaPrima> & { id: string }): MateriaPrima {
  return {
    codigo: parcial.id.toUpperCase(),
    nombre: `Material ${parcial.id}`,
    descripcion: '',
    unidad: 'unidad',
    categoria: '',
    cantidad_inicial: 0,
    costo_unitario_inicial: 0,
    stock_minimo: 0,
    proveedor: '',
    activo: true,
    ...parcial,
  }
}

let n = 0
function mov(
  tipo: TipoMovimientoKardex,
  fecha: string,
  cantidad: number,
  costo: number | null = null,
  extra: Partial<MovimientoKardex> = {},
): MovimientoKardex {
  n += 1
  return {
    id: extra.id ?? `m${n}`,
    fecha,
    materia_prima_id: 'mp1',
    tipo,
    concepto: tipo,
    documento: `DOC-${n}`,
    cantidad,
    costo_unitario: costo,
    ...extra,
  }
}

// =====================================================================
// 1. PROMEDIO PONDERADO PERPETUO
// =====================================================================

describe('promedio ponderado perpetuo', () => {
  /*
    La secuencia de la hoja de cálculo, con números redondos para poder
    verificarla a mano:

      entrada 100 un a $1.000  -> 100 un, $100.000, promedio $1.000
      entrada 100 un a $1.400  -> 200 un, $240.000, promedio $1.200
      salida   50 un           -> 150 un, $180.000, promedio $1.200 (NO cambia)
  */
  const movimientos = [
    mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
    mov('entrada_compra', '2026-01-10', 100, 1400, { id: 'e2' }),
    mov('salida_consumo', '2026-01-15', 50, null, { id: 's1' }),
  ]

  const t = historialKardex('mp1', movimientos)

  it('la primera entrada deja el promedio en su propio costo', () => {
    expect(t.filas[0].saldo_cantidad).toBe(100)
    expect(t.filas[0].saldo_total).toBe(100_000)
    expect(t.filas[0].saldo_costo_unitario).toBe(1000)
  })

  it('la segunda entrada pondera los dos costos', () => {
    expect(t.filas[1].saldo_cantidad).toBe(200)
    expect(t.filas[1].saldo_total).toBe(240_000)
    expect(t.filas[1].saldo_costo_unitario).toBe(1200)
  })

  it('la salida se valora al promedio vigente', () => {
    expect(t.filas[2].salida_cantidad).toBe(50)
    expect(t.filas[2].costo_unitario_aplicado).toBe(1200)
    expect(t.filas[2].salida_total).toBe(60_000)
  })

  it('la salida baja cantidad y valor pero NO el promedio', () => {
    expect(t.saldo_cantidad).toBe(150)
    expect(t.saldo_total).toBe(180_000)
    expect(t.costo_promedio).toBe(1200)
  })

  it('el valor del inventario es cantidad x promedio', () => {
    expect(t.saldo_total).toBeCloseTo(t.saldo_cantidad * t.costo_promedio, 6)
  })

  it('no deja alertas: la secuencia es limpia', () => {
    expect(t.alertas).toEqual([])
    expect(t.descartados).toEqual([])
  })

  it('mientras haya saldo, valor / cantidad es siempre el promedio', () => {
    for (const f of t.filas) {
      if (f.saldo_cantidad > 0) {
        expect(f.saldo_total / f.saldo_cantidad).toBeCloseTo(f.saldo_costo_unitario, 6)
      }
    }
  })
})

describe('el saldo inicial sale de la ficha del material, no de un movimiento', () => {
  const material = mp({ id: 'mp1', cantidad_inicial: 20, costo_unitario_inicial: 1500 })

  it('arranca la tarjeta con una fila de apertura', () => {
    const t = tarjetaDeMateria(material, [])
    expect(t.filas).toHaveLength(1)
    expect(t.filas[0].tipo).toBe('saldo_inicial')
    expect(t.saldo_cantidad).toBe(20)
    expect(t.saldo_total).toBe(30_000)
    expect(t.costo_promedio).toBe(1500)
  })

  it('la apertura se pondera con las entradas que vengan después', () => {
    // 20 a $1.500 + 20 a $2.500 = 40 un, $80.000, promedio $2.000
    const t = tarjetaDeMateria(material, [mov('entrada_compra', '2026-02-01', 20, 2500)])
    expect(t.saldo_cantidad).toBe(40)
    expect(t.saldo_total).toBe(80_000)
    expect(t.costo_promedio).toBe(2000)
  })

  it('sin cantidad inicial no hay fila de apertura', () => {
    const t = tarjetaDeMateria(mp({ id: 'mp1' }), [])
    expect(t.filas).toHaveLength(0)
    expect(t.saldo_cantidad).toBe(0)
  })
})

// =====================================================================
// 2. SALDO NEGATIVO
// =====================================================================

describe('una salida mayor al saldo', () => {
  const movimientos = [
    mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
    mov('salida_consumo', '2026-01-10', 150, null, { id: 's1' }),
  ]

  it('no se aplica y se reporta', () => {
    const t = historialKardex('mp1', movimientos)

    expect(t.saldo_cantidad).toBe(100)
    expect(t.saldo_total).toBe(100_000)

    const fila = t.filas.find((f) => f.id === 's1')!
    expect(fila.aplicado).toBe(false)
    expect(fila.salida_cantidad).toBe(0)
    expect(fila.salida_total).toBe(0)

    expect(t.alertas).toHaveLength(1)
    expect(t.alertas[0].clase).toBe('saldo_insuficiente')
  })

  it('pasa si el movimiento viene marcado como forzado', () => {
    const forzado = [
      movimientos[0],
      mov('ajuste_salida', '2026-01-10', 150, null, { id: 's1', forzar: true }),
    ]
    const t = historialKardex('mp1', forzado)

    expect(t.saldo_cantidad).toBe(-50)
    expect(t.saldo_total).toBe(-50_000)
    expect(t.costo_promedio).toBe(1000)
    expect(t.alertas[0].clase).toBe('saldo_negativo')
  })

  it('forzar un movimiento no apaga la validación de los demás', () => {
    const mezcla = [
      mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
      mov('ajuste_salida', '2026-01-06', 120, null, { id: 's1', forzar: true }),
      mov('salida_consumo', '2026-01-07', 10, null, { id: 's2' }),
    ]
    const t = historialKardex('mp1', mezcla)
    // tras forzar quedan -20: la siguiente salida normal no debe pasar
    expect(t.filas.find((f) => f.id === 's2')!.aplicado).toBe(false)
    expect(t.saldo_cantidad).toBe(-20)
  })

  it('validarSalida avisa antes de guardar', () => {
    const t = historialKardex('mp1', [mov('entrada_compra', '2026-01-05', 10, 1000)])
    expect(validarSalida(t, 5, 'un').ok).toBe(true)
    expect(validarSalida(t, 10, 'un').ok).toBe(true)
    const malo = validarSalida(t, 11, 'un')
    expect(malo.ok).toBe(false)
    expect(malo.mensaje).toContain('11')
  })

  it('una salida que deja el saldo exactamente en cero sí pasa', () => {
    const t = historialKardex('mp1', [
      mov('entrada_compra', '2026-01-05', 7, 300, { id: 'e1' }),
      mov('salida_consumo', '2026-01-06', 7, null, { id: 's1' }),
    ])
    expect(t.saldo_cantidad).toBe(0)
    expect(t.saldo_total).toBe(0)
    expect(t.filas[1].aplicado).toBe(true)
  })
})

// =====================================================================
// 3. IDEMPOTENCIA
// =====================================================================

describe('idempotencia por id de movimiento', () => {
  it('el mismo movimiento dos veces descuenta una sola vez', () => {
    const entrada = mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' })
    const salida = mov('salida_consumo', '2026-01-10', 30, null, { id: 's1' })

    const unaVez = historialKardex('mp1', [entrada, salida])
    const dosVeces = historialKardex('mp1', [entrada, salida, salida])

    expect(dosVeces.saldo_cantidad).toBe(unaVez.saldo_cantidad)
    expect(dosVeces.saldo_total).toBe(unaVez.saldo_total)
    expect(dosVeces.saldo_cantidad).toBe(70)
    expect(dosVeces.saldo_total).toBe(70_000)
  })

  it('deja constancia de lo que descartó', () => {
    const salida = mov('salida_consumo', '2026-01-10', 30, null, { id: 's1' })
    const t = historialKardex('mp1', [
      mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
      salida,
      salida,
      salida,
    ])
    expect(t.descartados).toEqual(['s1', 's1'])
    expect(t.alertas.filter((a) => a.clase === 'duplicado')).toHaveLength(2)
    // una sola fila en la tarjeta, no tres
    expect(t.filas.filter((f) => f.id === 's1')).toHaveLength(1)
  })

  it('también aplica a las entradas repetidas', () => {
    const entrada = mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' })
    const t = historialKardex('mp1', [entrada, entrada])
    expect(t.saldo_cantidad).toBe(100)
    expect(t.saldo_total).toBe(100_000)
  })
})

// =====================================================================
// 4. ORDEN DE APLICACIÓN
// =====================================================================

describe('orden de los movimientos', () => {
  it('ordena por fecha aunque lleguen desordenados', () => {
    const t = historialKardex('mp1', [
      mov('salida_consumo', '2026-03-01', 10, null, { id: 's1' }),
      mov('entrada_compra', '2026-01-01', 100, 1000, { id: 'e1' }),
    ])
    expect(t.filas[0].id).toBe('e1')
    expect(t.filas[1].id).toBe('s1')
    expect(t.saldo_cantidad).toBe(90)
  })

  it('dentro del mismo día aplica primero las entradas', () => {
    // sin esta regla, la salida del mismo día daría «saldo insuficiente»
    const t = historialKardex('mp1', [
      mov('salida_consumo', '2026-01-05', 40, null, { id: 's1' }),
      mov('entrada_compra', '2026-01-05', 50, 2000, { id: 'e1' }),
    ])
    expect(t.filas[0].id).toBe('e1')
    expect(t.filas[1].aplicado).toBe(true)
    expect(t.saldo_cantidad).toBe(10)
    expect(t.saldo_total).toBe(20_000)
  })
})

// =====================================================================
// 5. CONSUMOS DE UNA ORDEN
// =====================================================================

describe('una orden que consume tres materiales', () => {
  /*
    Tres materiales con costos preparados para que el total se pueda verificar
    de memoria:

      A: apertura 100 a $500                       -> promedio $500
         consumo 10                                -> $5.000
      B: compra 50 a $2.000                        -> promedio $2.000
         consumo 4                                 -> $8.000
      C: apertura 20 a $1.500 + compra 20 a $2.500 -> promedio $2.000
         consumo 3                                 -> $6.000
                                                      --------
                                            total     $19.000
  */
  const materias = [
    mp({ id: 'a', nombre: 'Tablero', cantidad_inicial: 100, costo_unitario_inicial: 500 }),
    mp({ id: 'b', nombre: 'Tornillos' }),
    mp({ id: 'c', nombre: 'Barniz', cantidad_inicial: 20, costo_unitario_inicial: 1500 }),
  ]

  const movimientos: MovimientoKardex[] = [
    mov('entrada_compra', '2026-01-02', 50, 2000, { id: 'eb', materia_prima_id: 'b' }),
    mov('entrada_compra', '2026-01-02', 20, 2500, { id: 'ec', materia_prima_id: 'c' }),
  ]

  const ordenes: OrdenProduccion[] = [
    {
      id: 'op1',
      numero: 'OP-001',
      producto_id: 'p1',
      cantidad_programada: 10,
      cantidad_terminada: 10,
      fecha_inicio: '2026-01-03',
      fecha_fin: '2026-01-09',
      estado: 'terminada',
    },
  ]

  const consumos: ConsumoMaterial[] = [
    { id: 'c1', orden_id: 'op1', materia_prima_id: 'a', fecha: '2026-01-05', documento: 'REQ-1', cantidad: 10, unidad: 'unidad', costo_unitario: null },
    { id: 'c2', orden_id: 'op1', materia_prima_id: 'b', fecha: '2026-01-05', documento: 'REQ-1', cantidad: 4, unidad: 'unidad', costo_unitario: null },
    { id: 'c3', orden_id: 'op1', materia_prima_id: 'c', fecha: '2026-01-05', documento: 'REQ-1', cantidad: 3, unidad: 'unidad', costo_unitario: null },
  ]

  const { tarjetas, alertas } = construirTarjetas(materias, movimientos, consumos)
  const materiales = materialesDeOrdenes(ordenes, consumos, materias, tarjetas)

  it('cada material queda valorado a su propio promedio', () => {
    expect(tarjetas.a.costo_promedio).toBe(500)
    expect(tarjetas.b.costo_promedio).toBe(2000)
    expect(tarjetas.c.costo_promedio).toBe(2000)
  })

  it('el costo de material directo de la orden es la suma de las líneas', () => {
    const m = materiales.op1
    expect(m.lineas).toHaveLength(3)
    expect(m.lineas.find((l) => l.materia_prima_id === 'a')!.costo_total).toBe(5_000)
    expect(m.lineas.find((l) => l.materia_prima_id === 'b')!.costo_total).toBe(8_000)
    expect(m.lineas.find((l) => l.materia_prima_id === 'c')!.costo_total).toBe(6_000)
    expect(m.total).toBe(19_000)
  })

  it('el detalle trae lo que la hoja de costos necesita', () => {
    const linea = materiales.op1.lineas.find((l) => l.materia_prima_id === 'a')!
    expect(linea.nombre).toBe('Tablero')
    expect(linea.codigo).toBe('A')
    expect(linea.unidad).toBe('unidad')
    expect(linea.cantidad).toBe(10)
    expect(linea.costo_unitario).toBe(500)
    expect(linea.aplicado).toBe(true)
  })

  it('los consumos bajan las existencias de cada material', () => {
    expect(tarjetas.a.saldo_cantidad).toBe(90)
    expect(tarjetas.b.saldo_cantidad).toBe(46)
    expect(tarjetas.c.saldo_cantidad).toBe(37)
    expect(alertas).toEqual([])
  })

  it('borrar un consumo devuelve el material al inventario', () => {
    const sinC2 = consumos.filter((c) => c.id !== 'c2')
    const { tarjetas: t2 } = construirTarjetas(materias, movimientos, sinC2)
    const m2 = materialesDeOrdenes(ordenes, sinC2, materias, t2)

    expect(t2.b.saldo_cantidad).toBe(50)
    expect(m2.op1.total).toBe(11_000)
  })

  it('un consumo no se puede descontar dos veces, ni listándolo repetido', () => {
    const repetido = [...consumos, consumos[0]]
    const { tarjetas: t2 } = construirTarjetas(materias, movimientos, repetido)
    expect(t2.a.saldo_cantidad).toBe(90)
  })

  it('cada consumo produce un id de movimiento derivado y estable', () => {
    const { movimientos: generados } = movimientosDeConsumos(consumos, materias)
    expect(generados.map((m) => m.id)).toEqual(['consumo:c1', 'consumo:c2', 'consumo:c3'])
    expect(idMovimientoConsumo('c1')).toBe('consumo:c1')
  })

  it('un consumo sin saldo queda sin aplicar y en cero, no a medias', () => {
    const exagerado: ConsumoMaterial[] = [
      { ...consumos[0], id: 'cx', cantidad: 500 },
    ]
    const { tarjetas: t2, alertas: al } = construirTarjetas(materias, movimientos, exagerado)
    const m2 = materialesDeOrdenes(ordenes, exagerado, materias, t2)

    expect(t2.a.saldo_cantidad).toBe(100)
    expect(m2.op1.total).toBe(0)
    expect(m2.op1.lineas[0].aplicado).toBe(false)
    expect(al.some((a) => a.clase === 'saldo_insuficiente')).toBe(true)
  })
})

// =====================================================================
// 6. UNIDADES
// =====================================================================

describe('unidades', () => {
  it('convierte dentro de la misma dimensión', () => {
    expect(convertir(500, 'g', 'kg')).toBe(0.5)
    expect(convertir(2, 'kg', 'g')).toBe(2000)
    expect(convertir(150, 'cm', 'metro')).toBeCloseTo(1.5, 10)
  })

  it('no inventa conversiones entre dimensiones distintas', () => {
    expect(convertir(1, 'litro', 'kg')).toBe(null)
    expect(convertir(1, 'paquete', 'unidad')).toBe(null)
    expect(compatibles('litro', 'ml')).toBe(true)
    expect(compatibles('litro', 'metro')).toBe(false)
  })

  it('un consumo en gramos sale del material que vive en kilos', () => {
    const materias = [
      mp({ id: 'mp1', unidad: 'kg', cantidad_inicial: 10, costo_unitario_inicial: 4000 }),
    ]
    const consumos: ConsumoMaterial[] = [
      { id: 'c1', orden_id: 'op1', materia_prima_id: 'mp1', fecha: '2026-01-05', documento: '', cantidad: 500, unidad: 'g', costo_unitario: null },
    ]
    const { tarjetas } = construirTarjetas(materias, [], consumos)

    expect(tarjetas.mp1.saldo_cantidad).toBeCloseTo(9.5, 10)
    expect(tarjetas.mp1.filas[1].salida_cantidad).toBeCloseTo(0.5, 10)
    expect(tarjetas.mp1.filas[1].salida_total).toBeCloseTo(2000, 6)
  })

  it('un consumo con unidad incompatible no mueve el saldo y se reporta', () => {
    const materias = [
      mp({ id: 'mp1', unidad: 'kg', cantidad_inicial: 10, costo_unitario_inicial: 4000 }),
    ]
    const consumos: ConsumoMaterial[] = [
      { id: 'c1', orden_id: 'op1', materia_prima_id: 'mp1', fecha: '2026-01-05', documento: '', cantidad: 2, unidad: 'litro' as UnidadMedida, costo_unitario: null },
    ]
    const { tarjetas, alertas } = construirTarjetas(materias, [], consumos)

    expect(tarjetas.mp1.saldo_cantidad).toBe(10)
    expect(alertas.some((a) => a.clase === 'unidad_incompatible')).toBe(true)
  })
})

// =====================================================================
// 7. CASOS RAROS
// =====================================================================

describe('movimientos mal formados', () => {
  it('una cantidad en cero o negativa no se aplica', () => {
    const t = historialKardex('mp1', [
      mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
      mov('entrada_compra', '2026-01-06', 0, 1000, { id: 'e2' }),
      mov('salida_consumo', '2026-01-07', -5, null, { id: 's1' }),
    ])
    expect(t.saldo_cantidad).toBe(100)
    expect(t.alertas.filter((a) => a.clase === 'cantidad_invalida')).toHaveLength(2)
  })

  it('una compra sin costo se valora al promedio vigente y se avisa', () => {
    const t = historialKardex('mp1', [
      mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
      mov('entrada_compra', '2026-01-06', 50, null, { id: 'e2' }),
    ])
    expect(t.saldo_cantidad).toBe(150)
    expect(t.costo_promedio).toBe(1000)
    expect(t.alertas.some((a) => a.clase === 'entrada_sin_costo')).toBe(true)
  })

  it('una devolución de producción vuelve al promedio, sin avisar', () => {
    const t = historialKardex('mp1', [
      mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
      mov('salida_consumo', '2026-01-06', 40, null, { id: 's1' }),
      mov('devolucion_de_produccion', '2026-01-07', 10, null, { id: 'd1' }),
    ])
    expect(t.saldo_cantidad).toBe(70)
    expect(t.saldo_total).toBe(70_000)
    expect(t.costo_promedio).toBe(1000)
    expect(t.alertas).toEqual([])
  })

  it('una devolución a proveedor sale al promedio', () => {
    const t = historialKardex('mp1', [
      mov('entrada_compra', '2026-01-05', 100, 1000, { id: 'e1' }),
      mov('entrada_compra', '2026-01-06', 100, 1400, { id: 'e2' }),
      mov('devolucion_a_proveedor', '2026-01-07', 20, null, { id: 'd1' }),
    ])
    expect(t.saldo_cantidad).toBe(180)
    expect(t.saldo_total).toBe(216_000)
    expect(t.costo_promedio).toBe(1200)
  })

  it('clasifica bien entradas y salidas', () => {
    expect(esEntrada('entrada_compra')).toBe(true)
    expect(esEntrada('saldo_inicial')).toBe(true)
    expect(esEntrada('devolucion_de_produccion')).toBe(true)
    expect(esEntrada('ajuste_entrada')).toBe(true)
    expect(esEntrada('salida_consumo')).toBe(false)
    expect(esEntrada('devolucion_a_proveedor')).toBe(false)
    expect(esEntrada('ajuste_salida')).toBe(false)
  })
})

// =====================================================================
// 8. MÉTODO DE VALORACIÓN
// =====================================================================

describe('método de valoración', () => {
  it('promedio ponderado es el único implementado', () => {
    expect(metodoEfectivo('promedio_ponderado')).toBe('promedio_ponderado')
  })

  it('PEPS y UEPS caen a promedio ponderado, sin mezclar criterios', () => {
    expect(metodoEfectivo('peps')).toBe('promedio_ponderado')
    expect(metodoEfectivo('ueps')).toBe('promedio_ponderado')
  })

  it('la tarjeta dice con qué método se valoró de verdad', () => {
    const t = historialKardex('mp1', [], { metodo: 'peps' })
    expect(t.metodo).toBe('promedio_ponderado')
  })
})

// =====================================================================
// 9. COSTO DE LA RECETA
// =====================================================================

describe('costo de la receta', () => {
  const materias = [
    mp({ id: 'a', nombre: 'Tablero', unidad: 'm2', cantidad_inicial: 100, costo_unitario_inicial: 20_000 }),
    mp({ id: 'b', nombre: 'Tornillos', unidad: 'unidad', cantidad_inicial: 1000, costo_unitario_inicial: 150 }),
  ]
  const { tarjetas } = construirTarjetas(materias, [], [])

  const receta: Receta = {
    id: 'r1',
    producto_id: 'p1',
    version: 1,
    rendimiento: 2,
    items: [
      { materia_prima_id: 'a', cantidad: 3, unidad: 'm2', desperdicio_pct: 0 },
      { materia_prima_id: 'b', cantidad: 40, unidad: 'unidad', desperdicio_pct: 0 },
    ],
    horas_mo_estandar: 0,
    horas_maquina_estandar: 0,
    vigente: true,
  }

  it('suma el lote y lo divide por el rendimiento', () => {
    // 3 m2 x $20.000 = $60.000 ; 40 x $150 = $6.000 ; lote = $66.000 ; /2 = $33.000
    const c = costoReceta(receta, materias, tarjetas)
    expect(c.total_lote).toBe(66_000)
    expect(c.por_unidad).toBe(33_000)
    expect(c.faltantes).toEqual([])
  })

  it('el desperdicio encarece la unidad buena', () => {
    const con = costoReceta(
      { ...receta, items: [{ materia_prima_id: 'a', cantidad: 3, unidad: 'm2', desperdicio_pct: 10 }] },
      materias,
      tarjetas,
    )
    // 3 x 1,10 = 3,3 m2 x $20.000 = $66.000
    expect(con.total_lote).toBeCloseTo(66_000, 6)
  })

  it('convierte la unidad de la receta a la del material', () => {
    const materiasKg = [
      mp({ id: 'x', unidad: 'kg', cantidad_inicial: 100, costo_unitario_inicial: 8000 }),
    ]
    const { tarjetas: tk } = construirTarjetas(materiasKg, [], [])
    const c = costoReceta(
      {
        ...receta,
        rendimiento: 1,
        items: [{ materia_prima_id: 'x', cantidad: 250, unidad: 'g', desperdicio_pct: 0 }],
      },
      materiasKg,
      tk,
    )
    // 250 g = 0,25 kg x $8.000 = $2.000
    expect(c.por_unidad).toBeCloseTo(2000, 6)
  })

  it('usa el promedio del Kardex cuando ya hay movimientos', () => {
    const conCompra = construirTarjetas(
      materias,
      [mov('entrada_compra', '2026-01-10', 100, 30_000, { id: 'ea', materia_prima_id: 'a' })],
      [],
    )
    // 100 a $20.000 + 100 a $30.000 = promedio $25.000
    expect(conCompra.tarjetas.a.costo_promedio).toBe(25_000)
    const c = costoReceta(receta, materias, conCompra.tarjetas)
    // 3 x $25.000 = $75.000 ; + $6.000 = $81.000 ; /2
    expect(c.total_lote).toBe(81_000)
    expect(c.por_unidad).toBe(40_500)
  })

  it('reporta los materiales que no pudo costear', () => {
    const c = costoReceta(
      { ...receta, items: [{ materia_prima_id: 'no-existe', cantidad: 1, unidad: 'unidad', desperdicio_pct: 0 }] },
      materias,
      tarjetas,
    )
    expect(c.total_lote).toBe(0)
    expect(c.faltantes).toHaveLength(1)
  })
})
