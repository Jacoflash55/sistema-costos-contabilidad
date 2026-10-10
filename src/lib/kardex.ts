/**
 * EL KARDEX. Promedio ponderado perpetuo, en funciones PURAS.
 *
 * Entra la lista de movimientos de un material y sale la tarjeta: cada
 * movimiento con el saldo que queda despues de aplicarlo. Nada de React,
 * nada de localStorage, nada de reloj.
 *
 * LAS FORMULAS (promedio ponderado perpetuo)
 *
 *   Entrada:  qty'   = qty + q_ent
 *             valor' = valor + q_ent x cu_ent
 *             cu_prom = valor' / qty'                   (exige qty' > 0)
 *
 *   Salida:   valor_salida = q_sal x cu_prom
 *             qty'   = qty - q_sal
 *             valor' = valor - valor_salida
 *             cu_prom NO cambia
 *
 *   Valor del inventario = qty x cu_prom
 *
 * De ahi sale un invariante que vale la pena tener presente: mientras
 * qty > 0, valor / qty es siempre igual a cu_prom, porque una salida le quita
 * a los dos lados la misma proporcion. Por eso la columna de saldo de la
 * tarjeta y el promedio nunca se separan.
 *
 * UN SOLO METODO A LA VEZ. El metodo sale de la configuracion y hoy solo esta
 * implementado el promedio ponderado; ver `metodoEfectivo`. Nunca se combinan
 * dos metodos en el mismo calculo.
 */

import { divSegura } from './calc'
import type {
  AlertaKardex,
  ConsumoMaterial,
  CostoReceta,
  FilaKardex,
  ID,
  LineaMaterialOrden,
  MaterialesOrden,
  MateriaPrima,
  MetodoInventario,
  MovimientoKardex,
  OrdenProduccion,
  Receta,
  Tarjeta,
  TipoMovimientoKardex,
} from './tipos'
import { convertir, mensajeIncompatible, unidadCorta } from './unidades'

/**
 * Margen para las comparaciones de punto flotante. 0,000001 de una unidad no
 * es un faltante de bodega, es el error de redondeo de dividir y multiplicar.
 */
const EPS = 1e-9

// =====================================================================
// 1. TIPOS DE MOVIMIENTO
// =====================================================================

/** Los tipos que SUMAN al inventario. Lo que no esta aqui, resta. */
const ENTRADAS: readonly TipoMovimientoKardex[] = [
  'saldo_inicial',
  'entrada_compra',
  'devolucion_de_produccion',
  'ajuste_entrada',
]

export function esEntrada(tipo: TipoMovimientoKardex): boolean {
  return ENTRADAS.includes(tipo)
}

/** Como se llama cada tipo en la pantalla. */
export const ETIQUETA_TIPO: Record<TipoMovimientoKardex, string> = {
  saldo_inicial: 'Saldo inicial',
  entrada_compra: 'Compra',
  salida_consumo: 'Salida a producción',
  devolucion_a_proveedor: 'Devolución a proveedor',
  devolucion_de_produccion: 'Devolución de producción',
  ajuste_entrada: 'Ajuste (entrada)',
  ajuste_salida: 'Ajuste (salida)',
}

/**
 * En que orden se aplican los movimientos del MISMO dia.
 *
 * Primero todo lo que entra y despues todo lo que sale. Es como se diligencia
 * una tarjeta a mano, y evita un falso «saldo insuficiente» cuando la compra
 * y el consumo que paga esa compra se registran con la misma fecha.
 */
const RANGO: Record<TipoMovimientoKardex, number> = {
  saldo_inicial: 0,
  entrada_compra: 1,
  devolucion_de_produccion: 2,
  ajuste_entrada: 3,
  salida_consumo: 4,
  devolucion_a_proveedor: 5,
  ajuste_salida: 6,
}

// =====================================================================
// 2. METODO DE VALORACION
// =====================================================================

/** Los metodos que de verdad estan escritos. */
export const METODOS_IMPLEMENTADOS: readonly MetodoInventario[] = ['promedio_ponderado']

export function metodoImplementado(m: MetodoInventario): boolean {
  return METODOS_IMPLEMENTADOS.includes(m)
}

/**
 * El metodo con el que se va a valorar de verdad.
 *
 * Si la configuracion pide PEPS o UEPS, que todavia no estan escritos, se
 * valora por promedio ponderado y la UI lo dice en voz alta. Se prefiere eso
 * a reventar la app o, peor, a mezclar criterios sin avisar. El enganche para
 * PEPS entra aqui: agregarlo a METODOS_IMPLEMENTADOS y ramificar en
 * `historialKardex`.
 */
export function metodoEfectivo(m: MetodoInventario): MetodoInventario {
  return metodoImplementado(m) ? m : 'promedio_ponderado'
}

// =====================================================================
// 3. LA TARJETA DE UN MATERIAL
// =====================================================================

export interface OpcionesKardex {
  /** De la configuracion. Por defecto, promedio ponderado. */
  metodo?: MetodoInventario
  /** El saldo de apertura, que no es un movimiento sino un dato del material. */
  apertura?: { cantidad: number; costo_unitario: number; fecha?: string }
  /**
   * Deja pasar TODA salida, aunque deje el saldo negativo. Es para ejercicios
   * y para la importacion de datos historicos; lo normal es dejarlo en false
   * y marcar `forzar` movimiento por movimiento.
   */
  permitirNegativo?: boolean
}

/**
 * Recorre los movimientos de UN material y devuelve la tarjeta.
 *
 * Tres cosas que hace antes de sumar nada:
 *
 *   1. IDEMPOTENCIA. Si el mismo id llega dos veces, la segunda se descarta.
 *      Un movimiento no se puede descontar dos veces, por construccion.
 *   2. ORDEN. Por fecha, y dentro del dia las entradas antes que las salidas.
 *   3. SALDO NEGATIVO. Una salida mayor al saldo NO se aplica: la fila queda
 *      con `aplicado: false` y se reporta como alerta. Solo pasa si el
 *      movimiento trae `forzar` o si la opcion `permitirNegativo` esta puesta.
 */
export function historialKardex(
  materiaPrimaId: ID,
  movimientos: readonly MovimientoKardex[],
  opciones: OpcionesKardex = {},
): Tarjeta {
  const metodo = metodoEfectivo(opciones.metodo ?? 'promedio_ponderado')
  const alertas: AlertaKardex[] = []
  const filas: FilaKardex[] = []

  // --- 1. idempotencia: un id, una vez ---
  const vistos = new Set<ID>()
  const descartados: ID[] = []
  const unicos: MovimientoKardex[] = []
  for (const m of movimientos) {
    if (vistos.has(m.id)) {
      descartados.push(m.id)
      alertas.push({
        materia_prima_id: materiaPrimaId,
        movimiento_id: m.id,
        fecha: m.fecha,
        clase: 'duplicado',
        mensaje: `El movimiento ${m.id} llegó repetido: se aplicó una sola vez.`,
      })
      continue
    }
    vistos.add(m.id)
    unicos.push(m)
  }

  // --- 2. orden estable ---
  const ordenados = unicos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      if (a.m.fecha !== b.m.fecha) return a.m.fecha < b.m.fecha ? -1 : 1
      const ra = RANGO[a.m.tipo] ?? 9
      const rb = RANGO[b.m.tipo] ?? 9
      if (ra !== rb) return ra - rb
      return a.i - b.i
    })
    .map((x) => x.m)

  // --- 3. apertura: un dato del material, no un movimiento ---
  const apertura = opciones.apertura
  let qty = Math.max(0, apertura?.cantidad ?? 0)
  let prom = Math.max(0, apertura?.costo_unitario ?? 0)
  let valor = qty * prom

  if (apertura && apertura.cantidad < 0) {
    alertas.push({
      materia_prima_id: materiaPrimaId,
      movimiento_id: `inicial:${materiaPrimaId}`,
      fecha: apertura.fecha ?? '',
      clase: 'cantidad_invalida',
      mensaje: 'La cantidad inicial es negativa: se tomó como cero.',
    })
  }

  if (qty > 0) {
    filas.push({
      id: `inicial:${materiaPrimaId}`,
      fecha: apertura?.fecha ?? ordenados[0]?.fecha ?? '',
      materia_prima_id: materiaPrimaId,
      tipo: 'saldo_inicial',
      concepto: 'Saldo inicial',
      documento: '',
      cantidad: qty,
      costo_unitario: prom,
      costo_unitario_aplicado: prom,
      entrada_cantidad: qty,
      entrada_total: valor,
      salida_cantidad: 0,
      salida_total: 0,
      saldo_cantidad: qty,
      saldo_total: valor,
      saldo_costo_unitario: prom,
      aplicado: true,
    })
  }

  // --- 4. el recorrido ---
  for (const m of ordenados) {
    const base = {
      ...m,
      costo_unitario_aplicado: 0,
      entrada_cantidad: 0,
      entrada_total: 0,
      salida_cantidad: 0,
      salida_total: 0,
    }

    if (!Number.isFinite(m.cantidad) || m.cantidad <= 0) {
      alertas.push({
        materia_prima_id: materiaPrimaId,
        movimiento_id: m.id,
        fecha: m.fecha,
        clase: 'cantidad_invalida',
        mensaje: `La cantidad del movimiento ${m.documento || m.id} no es un número mayor que cero: no se aplicó.`,
      })
      filas.push({
        ...base,
        saldo_cantidad: qty,
        saldo_total: valor,
        saldo_costo_unitario: qty > 0 ? prom : 0,
        aplicado: false,
        alerta: 'Cantidad inválida',
      })
      continue
    }

    if (esEntrada(m.tipo)) {
      /*
        El costo de la entrada. Una devolucion de produccion normalmente no
        trae costo propio: el material vuelve al promedio con el que salio, y
        ese promedio es el vigente. Una compra sin costo si es raro, y se
        avisa, pero se aplica igual para que la CANTIDAD quede bien.
      */
      let cu = m.costo_unitario
      if (cu == null || !Number.isFinite(cu) || cu < 0) {
        cu = prom
        if (m.tipo === 'entrada_compra' || m.tipo === 'ajuste_entrada') {
          alertas.push({
            materia_prima_id: materiaPrimaId,
            movimiento_id: m.id,
            fecha: m.fecha,
            clase: 'entrada_sin_costo',
            mensaje: `La entrada ${m.documento || m.id} no trae costo unitario: se valoró al promedio vigente.`,
          })
        }
      }

      const total = m.cantidad * cu
      qty += m.cantidad
      valor += total
      // qty > 0 siempre aqui: venia >= 0 y se le sumo algo > 0
      prom = divSegura(valor, qty)

      filas.push({
        ...base,
        costo_unitario_aplicado: cu,
        entrada_cantidad: m.cantidad,
        entrada_total: total,
        saldo_cantidad: qty,
        saldo_total: valor,
        saldo_costo_unitario: prom,
        aplicado: true,
      })
      continue
    }

    // ----- salida -----
    const excede = m.cantidad > qty + EPS
    const forzada = m.forzar === true || opciones.permitirNegativo === true

    if (excede && !forzada) {
      alertas.push({
        materia_prima_id: materiaPrimaId,
        movimiento_id: m.id,
        fecha: m.fecha,
        clase: 'saldo_insuficiente',
        mensaje:
          `Se intentó sacar ${m.cantidad} con un saldo de ${qty}. ` +
          'El movimiento quedó registrado pero NO se aplicó.',
      })
      /*
        Las columnas de salida quedan en cero, no en la cantidad intentada:
        asi la tarjeta siempre cuadra si se suman las columnas, y la fila se
        pinta aparte por `aplicado: false`.
      */
      filas.push({
        ...base,
        saldo_cantidad: qty,
        saldo_total: valor,
        saldo_costo_unitario: qty > 0 ? prom : 0,
        aplicado: false,
        alerta: 'Saldo insuficiente',
      })
      continue
    }

    const cu = prom
    const total = m.cantidad * cu
    qty -= m.cantidad
    valor -= total

    // El residuo de punto flotante no es inventario: si la cantidad llego a
    // cero, el valor tambien.
    if (Math.abs(qty) < EPS) {
      qty = 0
      valor = 0
    }

    if (excede) {
      alertas.push({
        materia_prima_id: materiaPrimaId,
        movimiento_id: m.id,
        fecha: m.fecha,
        clase: 'saldo_negativo',
        mensaje: `El movimiento ${m.documento || m.id} se forzó y dejó el saldo en ${qty}.`,
      })
    }

    filas.push({
      ...base,
      costo_unitario_aplicado: cu,
      salida_cantidad: m.cantidad,
      salida_total: total,
      saldo_cantidad: qty,
      saldo_total: valor,
      saldo_costo_unitario: qty > 0 ? prom : 0,
      aplicado: true,
      alerta: excede ? 'Saldo negativo (forzado)' : undefined,
    })
  }

  return {
    materia_prima_id: materiaPrimaId,
    metodo,
    filas,
    saldo_cantidad: qty,
    saldo_total: valor,
    costo_promedio: prom,
    alertas,
    descartados,
  }
}

/** La tarjeta de una materia prima, tomando la apertura de sus propios campos. */
export function tarjetaDeMateria(
  materia: MateriaPrima,
  movimientos: readonly MovimientoKardex[],
  opciones: Omit<OpcionesKardex, 'apertura'> = {},
): Tarjeta {
  return historialKardex(materia.id, movimientos, {
    ...opciones,
    apertura: { cantidad: materia.cantidad_inicial, costo_unitario: materia.costo_unitario_inicial },
  })
}

// =====================================================================
// 4. LOS CONSUMOS DE PRODUCCION, COMO SALIDAS DE KARDEX
// =====================================================================

/**
 * El id del movimiento que representa un consumo.
 *
 * Derivarlo del id del consumo es lo que hace imposible el doble descuento:
 * el mismo consumo siempre produce el mismo id, y la tarjeta descarta ids
 * repetidos.
 */
export function idMovimientoConsumo(consumoId: ID): ID {
  return `consumo:${consumoId}`
}

/**
 * Convierte los consumos de produccion en movimientos de salida.
 *
 * Aqui se resuelven las unidades: el consumo puede estar pedido en gramos y
 * el material vivir en kilos. Si las unidades no son compatibles el consumo NO
 * entra al Kardex y se reporta, en vez de mover el saldo con un numero que no
 * significa nada.
 */
export function movimientosDeConsumos(
  consumos: readonly ConsumoMaterial[],
  materias: readonly MateriaPrima[],
): { movimientos: MovimientoKardex[]; alertas: AlertaKardex[] } {
  const porId = new Map(materias.map((m) => [m.id, m]))
  const movimientos: MovimientoKardex[] = []
  const alertas: AlertaKardex[] = []

  for (const c of consumos) {
    const materia = porId.get(c.materia_prima_id)
    if (!materia) continue // material borrado: no hay saldo que mover

    const cantidad = convertir(c.cantidad, c.unidad, materia.unidad)
    if (cantidad == null) {
      alertas.push({
        materia_prima_id: c.materia_prima_id,
        movimiento_id: idMovimientoConsumo(c.id),
        fecha: c.fecha,
        clase: 'unidad_incompatible',
        mensaje: `${materia.nombre}: ${mensajeIncompatible(c.unidad, materia.unidad)} El consumo no se aplicó.`,
      })
      continue
    }

    movimientos.push({
      id: idMovimientoConsumo(c.id),
      fecha: c.fecha,
      materia_prima_id: c.materia_prima_id,
      tipo: 'salida_consumo',
      concepto: 'Consumo de producción',
      documento: c.documento,
      cantidad,
      costo_unitario: c.costo_unitario,
      orden_id: c.orden_id,
      forzar: c.forzar,
      nota: c.nota,
    })
  }

  return { movimientos, alertas }
}

/**
 * Las tarjetas de TODAS las materias primas.
 *
 * Junta los movimientos registrados a mano (compras, devoluciones, ajustes)
 * con las salidas que salen de los consumos de produccion. Esa union es la
 * tarjeta completa: no hay un segundo libro.
 */
export function construirTarjetas(
  materias: readonly MateriaPrima[],
  movimientos: readonly MovimientoKardex[],
  consumos: readonly ConsumoMaterial[],
  opciones: Omit<OpcionesKardex, 'apertura'> = {},
): { tarjetas: Record<ID, Tarjeta>; alertas: AlertaKardex[] } {
  const deConsumos = movimientosDeConsumos(consumos, materias)
  const todos = [...movimientos, ...deConsumos.movimientos]

  const porMateria = new Map<ID, MovimientoKardex[]>()
  for (const m of todos) {
    const lista = porMateria.get(m.materia_prima_id)
    if (lista) lista.push(m)
    else porMateria.set(m.materia_prima_id, [m])
  }

  const tarjetas: Record<ID, Tarjeta> = {}
  const alertas: AlertaKardex[] = [...deConsumos.alertas]

  for (const materia of materias) {
    const t = tarjetaDeMateria(materia, porMateria.get(materia.id) ?? [], opciones)
    tarjetas[materia.id] = t
    alertas.push(...t.alertas)
  }

  return { tarjetas, alertas }
}

/** Si una salida de `cantidad` cabe en el saldo. Lo usa la UI para no dejar guardarla. */
export function validarSalida(
  tarjeta: Tarjeta | undefined,
  cantidad: number,
  unidadCortaMaterial: string,
): { ok: boolean; mensaje?: string } {
  const saldo = tarjeta?.saldo_cantidad ?? 0
  if (cantidad > saldo + EPS) {
    return {
      ok: false,
      mensaje: `No hay saldo: se piden ${cantidad} ${unidadCortaMaterial} y hay ${saldo} ${unidadCortaMaterial}.`,
    }
  }
  return { ok: true }
}

// =====================================================================
// 5. LO QUE LEE LA HOJA DE COSTOS (Prompt 4)
// =====================================================================

/**
 * El material directo de cada orden: el total y el detalle por linea.
 *
 * El costo unitario de cada linea NO se vuelve a calcular aqui: se lee de la
 * fila del Kardex que corresponde a ese consumo, o sea el promedio ponderado
 * vigente en el momento exacto en que el material salio de bodega. Es lo que
 * pide la regla «costo de material consumido = suma de q x cu_prom vigente al
 * consumir».
 */
export function materialesDeOrdenes(
  ordenes: readonly OrdenProduccion[],
  consumos: readonly ConsumoMaterial[],
  materias: readonly MateriaPrima[],
  tarjetas: Record<ID, Tarjeta>,
): Record<ID, MaterialesOrden> {
  // indice de filas por id de movimiento, para no recorrer las tarjetas una
  // vez por consumo
  const fila = new Map<ID, FilaKardex>()
  for (const t of Object.values(tarjetas)) {
    for (const f of t.filas) fila.set(f.id, f)
  }

  const materiaPorId = new Map(materias.map((m) => [m.id, m]))
  const out: Record<ID, MaterialesOrden> = {}

  for (const orden of ordenes) {
    out[orden.id] = { orden_id: orden.id, lineas: [], total: 0 }
  }

  for (const c of consumos) {
    const destino = out[c.orden_id]
    if (!destino) continue // consumo de una orden que ya no existe

    const materia = materiaPorId.get(c.materia_prima_id)
    const f = fila.get(idMovimientoConsumo(c.id))

    // Cantidad y unidad: las del Kardex (ya convertidas a la unidad del
    // material). Si el consumo no llego al Kardex, se muestra como pedido y
    // sin aplicar.
    const cantidad = f?.salida_cantidad || (f?.aplicado === false ? 0 : c.cantidad)
    const unidad = materia?.unidad ?? c.unidad
    const costoUnitario = f?.costo_unitario_aplicado ?? 0
    const aplicado = f?.aplicado === true

    const linea: LineaMaterialOrden = {
      consumo_id: c.id,
      materia_prima_id: c.materia_prima_id,
      codigo: materia?.codigo ?? '—',
      nombre: materia?.nombre ?? 'Material borrado',
      unidad,
      cantidad: aplicado ? cantidad : c.cantidad,
      costo_unitario: costoUnitario,
      costo_total: aplicado ? cantidad * costoUnitario : 0,
      aplicado,
    }

    destino.lineas.push(linea)
    destino.total += linea.costo_total
  }

  return out
}

// =====================================================================
// 6. COSTO DE LA RECETA
// =====================================================================

/**
 * Cuanto cuesta en materiales fabricar una unidad del producto, segun la
 * receta y los costos de hoy.
 *
 * Es una ESTIMACION, no un costo real: sirve para cotizar antes de producir.
 * El costo real sale de los consumos de la orden (`materialesDeOrdenes`).
 *
 * El costo de cada material es el promedio ponderado vigente; si todavia no
 * tiene movimientos, se cae al costo unitario inicial que se le cargo al
 * crearlo.
 */
export function costoReceta(
  receta: Receta,
  materias: readonly MateriaPrima[],
  tarjetas: Record<ID, Tarjeta>,
): CostoReceta {
  const porId = new Map(materias.map((m) => [m.id, m]))
  const lineas: CostoReceta['lineas'] = []
  const faltantes: string[] = []
  let total = 0

  for (const item of receta.items) {
    const materia = porId.get(item.materia_prima_id)
    if (!materia) {
      faltantes.push('Un material de la receta ya no existe.')
      continue
    }

    const cantidadBase = convertir(item.cantidad, item.unidad, materia.unidad)
    if (cantidadBase == null) {
      faltantes.push(`${materia.nombre}: ${mensajeIncompatible(item.unidad, materia.unidad)}`)
      continue
    }

    // El desperdicio encarece la unidad buena: si se pierde el 5%, hay que
    // comprar 100/95 por cada unidad que sale.
    const conDesperdicio = cantidadBase * (1 + (item.desperdicio_pct || 0) / 100)

    const t = tarjetas[materia.id]
    const cu = t && t.costo_promedio > 0 ? t.costo_promedio : materia.costo_unitario_inicial
    const costo = conDesperdicio * cu
    total += costo

    lineas.push({
      materia_prima_id: materia.id,
      nombre: materia.nombre,
      unidad: materia.unidad,
      cantidad: conDesperdicio,
      costo_unitario: cu,
      costo_total: costo,
    })
  }

  return {
    receta_id: receta.id,
    producto_id: receta.producto_id,
    lineas,
    total_lote: total,
    por_unidad: divSegura(total, receta.rendimiento),
    faltantes,
  }
}

/** Texto corto del saldo de un material, para las tablas: «12,5 kg». */
export function saldoLegible(tarjeta: Tarjeta | undefined, materia: MateriaPrima): string {
  const n = tarjeta?.saldo_cantidad ?? 0
  return `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} ${unidadCorta(materia.unidad)}`
}
