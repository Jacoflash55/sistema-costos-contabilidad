import { useMemo, useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  Casilla,
  Cifra,
  InputCifra,
  InputTexto,
  Pildora,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../components/ui'
import type { Columna, Tono } from '../components/ui'
import { useEstado } from '../contexto'
import { cantidad as fmtCantidad, cop, copPreciso } from '../lib/formato'
import { validarSalida } from '../lib/kardex'
import type {
  EstadoOrden,
  ID,
  LineaMaterialOrden,
  MateriaPrima,
  OrdenProduccion,
  UnidadMedida,
} from '../lib/tipos'
import { UNIDADES, compatibles, convertir, mensajeIncompatible, nombreUnidad, unidadCorta } from '../lib/unidades'
import { PanelManoObra } from './ordenes/PanelManoObra'

const ESTADOS: ReadonlyArray<{ valor: EstadoOrden; texto: string }> = [
  { valor: 'abierta', texto: 'Abierta' },
  { valor: 'en_proceso', texto: 'En proceso' },
  { valor: 'terminada', texto: 'Terminada' },
  { valor: 'anulada', texto: 'Anulada' },
]

const TONO_ESTADO: Record<EstadoOrden, Tono> = {
  abierta: 'acento',
  en_proceso: 'aviso',
  terminada: 'positivo',
  anulada: 'negativo',
}

const OPCIONES_UNIDAD = UNIDADES.map((u) => ({ valor: u, texto: nombreUnidad(u) }))

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const VACIA: Omit<OrdenProduccion, 'id'> = {
  numero: '',
  producto_id: '',
  cantidad_programada: 1,
  cantidad_terminada: null,
  fecha_inicio: hoyISO(),
  fecha_fin: null,
  estado: 'abierta',
  nota: '',
}

export function Ordenes() {
  const { produccion, inventario, comercial, calculado, crearOrden, actualizarOrden, borrarOrden } =
    useEstado()

  const [borrador, setBorrador] = useState<Omit<OrdenProduccion, 'id'>>(VACIA)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // la orden cuyos consumos se están viendo
  const [consumosDe, setConsumosDe] = useState<ID | null>(null)
  // la orden cuya mano de obra se está viendo
  const [manoObraDe, setManoObraDe] = useState<ID | null>(null)

  const ordenes = produccion.ordenes
  const productos = produccion.productos
  const materias = inventario.materias_primas
  const materiasActivas = materias.filter((m) => m.activo)

  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])
  const materiaPorId = useMemo(() => new Map(materias.map((m) => [m.id, m])), [materias])

  const set = <K extends keyof OrdenProduccion>(clave: K, valor: OrdenProduccion[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIA)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardarOrden = () => {
    const numero = borrador.numero.trim()
    if (!numero) return setError('El número de la orden es obligatorio.')
    if (!borrador.producto_id) return setError('Elegí el producto que se va a fabricar.')
    if (borrador.cantidad_programada <= 0) return setError('La cantidad planeada tiene que ser mayor que cero.')
    const repetido = ordenes.some(
      (o) => o.id !== editando && o.numero.trim().toLowerCase() === numero.toLowerCase(),
    )
    if (repetido) return setError(`Ya hay una orden con el número ${numero}.`)

    if (editando) actualizarOrden(editando, { ...borrador, numero })
    else crearOrden({ ...borrador, numero })
    limpiar()
  }

  const editar = (o: OrdenProduccion) => {
    const { id: _id, ...resto } = o
    setBorrador(resto)
    setEditando(o.id)
    setAbierto(true)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const eliminar = (o: OrdenProduccion) => {
    const motivo = borrarOrden(o.id)
    setError(motivo ? `No se pudo borrar la orden ${o.numero}: ${motivo}` : null)
  }

  const columnas: Columna<OrdenProduccion>[] = [
    {
      clave: 'numero',
      titulo: 'Orden',
      valor: (o) => o.numero,
      render: (o) => <span className="cifra font-medium">{o.numero}</span>,
    },
    {
      clave: 'producto',
      titulo: 'Producto',
      valor: (o) => productoPorId.get(o.producto_id)?.nombre ?? '',
      render: (o) => productoPorId.get(o.producto_id)?.nombre ?? <span className="text-tenue">—</span>,
    },
    {
      clave: 'planeada',
      titulo: 'Planeada',
      alineacion: 'der',
      valor: (o) => o.cantidad_programada,
      render: (o) => <span className="cifra tabular-nums">{fmtCantidad(o.cantidad_programada, 0)}</span>,
    },
    {
      clave: 'producida',
      titulo: 'Producida',
      alineacion: 'der',
      valor: (o) => o.cantidad_terminada ?? -1,
      render: (o) =>
        o.cantidad_terminada == null ? (
          <span className="text-tenue">—</span>
        ) : (
          <span
            className={`cifra tabular-nums ${o.cantidad_terminada < o.cantidad_programada ? 'text-aviso' : ''}`}
          >
            {fmtCantidad(o.cantidad_terminada, 0)}
          </span>
        ),
    },
    {
      clave: 'material',
      titulo: 'Material directo',
      alineacion: 'der',
      valor: (o) => calculado.materialesPorOrden[o.id]?.total ?? 0,
      render: (o) => (
        <span className="cifra tabular-nums">{cop(calculado.materialesPorOrden[o.id]?.total ?? 0)}</span>
      ),
    },
    {
      clave: 'mod',
      titulo: 'Mano de obra',
      alineacion: 'der',
      valor: (o) => calculado.manoObraPorOrden[o.id]?.total ?? 0,
      render: (o) => (
        <span className="cifra tabular-nums">{cop(calculado.manoObraPorOrden[o.id]?.total ?? 0)}</span>
      ),
    },
    {
      clave: 'primo',
      titulo: 'Costo primo',
      alineacion: 'der',
      valor: (o) =>
        (calculado.materialesPorOrden[o.id]?.total ?? 0) + (calculado.manoObraPorOrden[o.id]?.total ?? 0),
      render: (o) => {
        const primo =
          (calculado.materialesPorOrden[o.id]?.total ?? 0) +
          (calculado.manoObraPorOrden[o.id]?.total ?? 0)
        const base = o.cantidad_terminada ?? o.cantidad_programada
        return (
          <div className="text-right">
            <p className="cifra tabular-nums font-medium">{cop(primo)}</p>
            {base > 0 && (
              <p className="cifra text-xs tabular-nums text-tenue">{copPreciso(primo / base)} / un</p>
            )}
          </div>
        )
      },
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (o) => o.estado,
      render: (o) => (
        <Pildora tono={TONO_ESTADO[o.estado]}>
          {ESTADOS.find((e) => e.valor === o.estado)?.texto ?? o.estado}
        </Pildora>
      ),
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (o) => (
        <span className="inline-flex gap-1.5">
          <Boton variante="secundario" onClick={() => setConsumosDe(o.id)}>
            Materiales
          </Boton>
          <Boton variante="secundario" onClick={() => setManoObraDe(o.id)}>
            Mano de obra
          </Boton>
          <Boton variante="fantasma" onClick={() => editar(o)}>
            Editar
          </Boton>
          <BotonConfirmar variante="fantasma" onConfirmar={() => eliminar(o)}>
            Borrar
          </BotonConfirmar>
        </span>
      ),
    },
  ]

  const orden = consumosDe ? ordenes.find((o) => o.id === consumosDe) : null
  const ordenMO = manoObraDe ? ordenes.find((o) => o.id === manoObraDe) : null

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Cada orden es la unidad de costeo: lo que se le cargue es lo que va a su hoja de costos."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)} deshabilitado={productos.length === 0}>
                + Nueva orden
              </Boton>
            )
          }
        >
          Órdenes de producción
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Cifra etiqueta="Órdenes" valor={ordenes.length} tamano="sm" />
          <Cifra etiqueta="Abiertas" valor={calculado.conteos.ordenesAbiertas} tamano="sm" />
          <Cifra etiqueta="Consumos registrados" valor={calculado.conteos.consumos} tamano="sm" />
          <Cifra
            etiqueta="Material directo total"
            valor={cop(
              Object.values(calculado.materialesPorOrden).reduce((s, m) => s + m.total, 0),
            )}
            tamano="sm"
          />
          <Cifra
            etiqueta="Mano de obra directa total"
            valor={cop(Object.values(calculado.manoObraPorOrden).reduce((s, m) => s + m.total, 0))}
            tono="acento"
            tamano="sm"
          />
        </Rejilla>

        {productos.length === 0 && (
          <div className="mt-3">
            <Aviso tono="aviso">
              No hay productos todavía. Una orden fabrica un producto, así que creá primero el producto
              y su receta.
            </Aviso>
          </div>
        )}
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion>{editando ? `Editar orden ${borrador.numero}` : 'Nueva orden'}</TituloSeccion>
          <Rejilla columnas={4}>
            <Campo etiqueta="Número *">
              {(id) => (
                <InputTexto id={id} valor={borrador.numero} onChange={(v) => set('numero', v)} placeholder="OP-001" />
              )}
            </Campo>
            <Campo etiqueta="Producto *">
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.producto_id}
                  onChange={(v) => set('producto_id', v)}
                  opciones={productos.map((p) => ({ valor: p.id, texto: `${p.codigo} · ${p.nombre}` }))}
                  vacio="Elegí un producto…"
                />
              )}
            </Campo>
            <Campo etiqueta="Cantidad planeada">
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.cantidad_programada}
                  onChange={(n) => set('cantidad_programada', n)}
                  min={1}
                  paso={1}
                />
              )}
            </Campo>
            <Campo
              etiqueta="Cantidad producida"
              ayuda="Lo que de verdad salió bueno. 0 = todavía sin terminar."
            >
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.cantidad_terminada ?? 0}
                  onChange={(n) => set('cantidad_terminada', n > 0 ? n : null)}
                  paso={1}
                />
              )}
            </Campo>

            <Campo etiqueta="Fecha de inicio">
              {(id) => (
                <InputTexto id={id} tipo="date" valor={borrador.fecha_inicio} onChange={(v) => set('fecha_inicio', v)} />
              )}
            </Campo>
            <Campo etiqueta="Fecha de cierre">
              {(id) => (
                <InputTexto
                  id={id}
                  tipo="date"
                  valor={borrador.fecha_fin ?? ''}
                  onChange={(v) => set('fecha_fin', v || null)}
                />
              )}
            </Campo>
            <Campo etiqueta="Estado">
              {(id) => (
                <Selector id={id} valor={borrador.estado} onChange={(v) => set('estado', v)} opciones={ESTADOS} />
              )}
            </Campo>
            <Campo
              etiqueta="Cliente"
              ayuda={
                comercial.clientes.length === 0
                  ? 'Todavía no hay clientes cargados: el módulo comercial viene después.'
                  : 'Solo si la orden es contra pedido.'
              }
            >
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.cliente_id ?? ''}
                  onChange={(v) => set('cliente_id', v || undefined)}
                  opciones={comercial.clientes.map((c) => ({ valor: c.id, texto: c.nombre }))}
                  vacio="Sin cliente"
                />
              )}
            </Campo>

            <Campo etiqueta="Observaciones" className="sm:col-span-2 lg:col-span-4">
              {(id) => <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex gap-2">
            <Boton variante="primario" onClick={guardarOrden}>
              {editando ? 'Guardar cambios' : 'Crear orden'}
            </Boton>
            <Boton variante="fantasma" onClick={limpiar}>
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      )}

      {orden && (
        <PanelConsumos
          orden={orden}
          cerrar={() => setConsumosDe(null)}
          materias={materiasActivas}
          materiaPorId={materiaPorId}
        />
      )}

      {ordenMO && <PanelManoObra orden={ordenMO} cerrar={() => setManoObraDe(null)} />}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={ordenes}
          claveFila={(o) => o.id}
          filtrable
          placeholderFiltro="Buscar orden o producto…"
          ordenInicial={{ clave: 'numero', asc: true }}
          vacio="Todavía no hay órdenes de producción."
        />
      </Tarjeta>
    </div>
  )
}

// =====================================================================
// El panel de consumos de una orden
// =====================================================================

/**
 * Registrar un consumo es lo que de verdad mueve el inventario: cada consumo
 * se convierte en una salida del Kardex del material.
 *
 * Por eso el formulario valida el saldo ANTES de guardar. Si no alcanza, no
 * deja pasar salvo que se marque como ajuste a proposito.
 */
function PanelConsumos({
  orden,
  cerrar,
  materias,
  materiaPorId,
}: {
  orden: OrdenProduccion
  cerrar: () => void
  materias: MateriaPrima[]
  materiaPorId: Map<ID, MateriaPrima>
}) {
  const { produccion, calculado, crearConsumo, borrarConsumo } = useEstado()

  const [materiaId, setMateriaId] = useState<ID>(materias[0]?.id ?? '')
  const [cant, setCant] = useState(0)
  const [unidad, setUnidad] = useState<UnidadMedida | null>(null)
  const [fecha, setFecha] = useState(hoyISO())
  const [documento, setDocumento] = useState('')
  const [forzar, setForzar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const materia = materiaPorId.get(materiaId)
  const unidadUsada = unidad ?? materia?.unidad ?? 'unidad'
  const tarjeta = materia ? calculado.tarjetas[materia.id] : undefined

  const cantidadBase = materia ? convertir(cant, unidadUsada, materia.unidad) : null
  const chequeo =
    materia && cantidadBase != null
      ? validarSalida(tarjeta, cantidadBase, unidadCorta(materia.unidad))
      : { ok: true as boolean, mensaje: undefined as string | undefined }

  const materiales = calculado.materialesPorOrden[orden.id]
  const receta = calculado.recetaPorProducto[orden.producto_id]

  const guardar = () => {
    setAviso(null)
    if (!materia) return setError('Elegí un material.')
    if (cant <= 0) return setError('La cantidad tiene que ser mayor que cero.')
    if (cantidadBase == null) return setError(mensajeIncompatible(unidadUsada, materia.unidad))
    if (!chequeo.ok && !forzar) {
      return setError(`${chequeo.mensaje} Marcá «forzar» solo si de verdad querés dejar el saldo negativo.`)
    }

    crearConsumo({
      orden_id: orden.id,
      materia_prima_id: materia.id,
      fecha,
      documento: documento.trim(),
      cantidad: cant,
      unidad: unidadUsada,
      costo_unitario: null,
      forzar: forzar ? true : undefined,
    })
    setError(null)
    setCant(0)
    setDocumento('')
    setForzar(false)
  }

  /**
   * Carga los consumos que pide la receta para la cantidad de la orden.
   *
   * Se valida material por material contra el saldo de hoy, descontando lo que
   * ya se repartio en esta misma tanda: si no alcanza para alguno, ese se
   * deja por fuera y se dice cual.
   */
  const cargarDesdeReceta = () => {
    setError(null)
    if (!receta) {
      setError('El producto de esta orden no tiene receta vigente.')
      return
    }
    const cantidadObjetivo = orden.cantidad_terminada ?? orden.cantidad_programada
    const veces = cantidadObjetivo / (receta.rendimiento > 0 ? receta.rendimiento : 1)

    const sinSaldo: string[] = []
    let creados = 0
    // cuanto se va comprometiendo de cada material dentro de esta tanda
    const comprometido = new Map<ID, number>()

    for (const item of receta.items) {
      const m = materiaPorId.get(item.materia_prima_id)
      if (!m) continue

      const enUnidadBase = convertir(item.cantidad, item.unidad, m.unidad)
      if (enUnidadBase == null) {
        sinSaldo.push(`${m.nombre} (unidades incompatibles)`)
        continue
      }

      const necesaria = enUnidadBase * veces * (1 + (item.desperdicio_pct || 0) / 100)
      const saldo = (calculado.tarjetas[m.id]?.saldo_cantidad ?? 0) - (comprometido.get(m.id) ?? 0)

      if (necesaria > saldo) {
        sinSaldo.push(
          `${m.nombre} (faltan ${fmtCantidad(necesaria - saldo)} ${unidadCorta(m.unidad)})`,
        )
        continue
      }

      comprometido.set(m.id, (comprometido.get(m.id) ?? 0) + necesaria)
      crearConsumo({
        orden_id: orden.id,
        materia_prima_id: m.id,
        fecha,
        documento: documento.trim() || `Receta ${orden.numero}`,
        cantidad: necesaria,
        unidad: m.unidad,
        costo_unitario: null,
      })
      creados++
    }

    const partes: string[] = []
    if (creados > 0) partes.push(`${creados} consumo(s) cargados desde la receta.`)
    if (sinSaldo.length > 0) partes.push(`Sin saldo suficiente: ${sinSaldo.join(', ')}.`)
    setAviso(partes.join(' ') || 'La receta no tiene materiales.')
  }

  const columnas: Columna<LineaMaterialOrden>[] = [
    {
      clave: 'codigo',
      titulo: 'Código',
      valor: (l) => l.codigo,
      render: (l) => <span className="cifra text-xs text-suave">{l.codigo}</span>,
    },
    { clave: 'nombre', titulo: 'Material', valor: (l) => l.nombre, render: (l) => l.nombre },
    {
      clave: 'cantidad',
      titulo: 'Cantidad',
      alineacion: 'der',
      valor: (l) => l.cantidad,
      render: (l) => (
        <span className="cifra tabular-nums">
          {fmtCantidad(l.cantidad)} {unidadCorta(l.unidad)}
        </span>
      ),
    },
    {
      clave: 'cu',
      titulo: 'Costo unitario',
      alineacion: 'der',
      valor: (l) => l.costo_unitario,
      render: (l) => <span className="cifra tabular-nums">{copPreciso(l.costo_unitario)}</span>,
    },
    {
      clave: 'total',
      titulo: 'Costo total',
      alineacion: 'der',
      valor: (l) => l.costo_total,
      render: (l) => <span className="cifra tabular-nums font-medium">{cop(l.costo_total)}</span>,
    },
    {
      clave: 'estado',
      titulo: '',
      render: (l) =>
        l.aplicado ? null : <Pildora tono="negativo">Sin aplicar: saldo insuficiente</Pildora>,
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (l) => (
        <BotonConfirmar variante="fantasma" onConfirmar={() => borrarConsumo(l.consumo_id)} titulo="Borrar consumo">
          ✕
        </BotonConfirmar>
      ),
    },
  ]

  const base = orden.cantidad_terminada ?? orden.cantidad_programada

  return (
    <Tarjeta className="border-acento/40">
      <TituloSeccion
        nota={`${produccion.consumos.filter((c) => c.orden_id === orden.id).length} consumo(s). Borrar un consumo devuelve el material al inventario.`}
        acciones={
          <>
            {receta && (
              <Boton variante="secundario" onClick={cargarDesdeReceta}>
                Cargar desde la receta
              </Boton>
            )}
            <Boton variante="fantasma" onClick={cerrar}>
              Cerrar
            </Boton>
          </>
        }
      >
        Consumos de la orden {orden.numero}
      </TituloSeccion>

      <Rejilla columnas={3}>
        <Cifra
          etiqueta="Material directo"
          valor={cop(materiales?.total ?? 0)}
          tono="acento"
          tamano="sm"
        />
        <Cifra
          etiqueta="Por unidad"
          valor={base > 0 ? copPreciso((materiales?.total ?? 0) / base) : '—'}
          tamano="sm"
          pie={`Sobre ${fmtCantidad(base, 0)} unidad(es)`}
        />
        <Cifra
          etiqueta="Líneas"
          valor={materiales?.lineas.length ?? 0}
          tamano="sm"
          pie={receta ? `La receta pide ${receta.items.length} material(es)` : 'El producto no tiene receta'}
        />
      </Rejilla>

      {/* ---------- nuevo consumo ---------- */}
      <div className="mt-5 rounded-lg border border-borde bg-panel-alto p-3">
        <Rejilla columnas={4}>
          <Campo etiqueta="Material">
            {(id) => (
              <Selector
                id={id}
                valor={materiaId}
                onChange={(v) => {
                  setMateriaId(v)
                  setUnidad(null)
                  setForzar(false)
                  setError(null)
                }}
                opciones={materias.map((m) => ({ valor: m.id, texto: `${m.codigo} · ${m.nombre}` }))}
                vacio="Elegí un material…"
              />
            )}
          </Campo>
          <Campo etiqueta="Cantidad">
            {(id) => <InputCifra id={id} valor={cant} onChange={setCant} paso={0.25} />}
          </Campo>
          <Campo
            etiqueta="Unidad"
            ayuda={
              materia
                ? `Saldo: ${fmtCantidad(tarjeta?.saldo_cantidad ?? 0)} ${unidadCorta(materia.unidad)}`
                : undefined
            }
            error={
              materia && !compatibles(unidadUsada, materia.unidad)
                ? `Incompatible con ${unidadCorta(materia.unidad)}`
                : undefined
            }
          >
            {(id) => (
              <Selector<UnidadMedida>
                id={id}
                valor={unidadUsada}
                onChange={setUnidad}
                opciones={OPCIONES_UNIDAD}
              />
            )}
          </Campo>
          <Campo etiqueta="Fecha">
            {(id) => <InputTexto id={id} tipo="date" valor={fecha} onChange={setFecha} />}
          </Campo>

          <Campo etiqueta="Documento" ayuda="Requisición o vale de bodega.">
            {(id) => <InputTexto id={id} valor={documento} onChange={setDocumento} placeholder="REQ-012" />}
          </Campo>
          <div className="flex items-end">
            <Boton variante="primario" onClick={guardar} className="w-full">
              Registrar consumo
            </Boton>
          </div>
        </Rejilla>

        {!chequeo.ok && (
          <div className="mt-3 space-y-2">
            <Aviso tono="negativo" titulo="No hay saldo suficiente">
              {chequeo.mensaje}
            </Aviso>
            <Casilla
              valor={forzar}
              onChange={setForzar}
              etiqueta="Forzar: registrar el consumo y dejar el saldo en negativo"
            />
          </div>
        )}

        {error && (
          <div className="mt-3">
            <Aviso tono="negativo">{error}</Aviso>
          </div>
        )}
        {aviso && (
          <div className="mt-3">
            <Aviso tono="aviso">{aviso}</Aviso>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Tabla
          columnas={columnas}
          filas={materiales?.lineas ?? []}
          claveFila={(l) => l.consumo_id}
          resaltarFila={(l) => (l.aplicado ? null : 'negativo')}
          vacio="Esta orden todavía no consumió materiales."
          pie={
            materiales && materiales.lineas.length > 0 ? (
              <tr>
                <td className="px-2.5 py-2 text-xs uppercase tracking-wider text-tenue" colSpan={4}>
                  Materia prima directa
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums">{cop(materiales.total)}</td>
                <td colSpan={2} />
              </tr>
            ) : undefined
          }
        />
      </div>
    </Tarjeta>
  )
}
