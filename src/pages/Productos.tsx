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
import type { Columna } from '../components/ui'
import { useEstado } from '../contexto'
import { cantidad as fmtCantidad, cop, copPreciso } from '../lib/formato'
import { costoReceta } from '../lib/kardex'
import type { ID, ItemReceta, Producto, Receta, UnidadMedida } from '../lib/tipos'
import { UNIDADES, compatibles, mensajeIncompatible, nombreUnidad, unidadCorta } from '../lib/unidades'

const VACIO: Omit<Producto, 'id'> = {
  codigo: '',
  nombre: '',
  unidad: 'unidad',
  margen_objetivo_pct: null,
  precio_referencia: null,
  activo: true,
  nota: '',
}

const OPCIONES_UNIDAD = UNIDADES.map((u) => ({ valor: u, texto: nombreUnidad(u) }))

export function Productos() {
  const {
    produccion,
    inventario,
    calculado,
    crearProducto,
    actualizarProducto,
    borrarProducto,
    guardarReceta,
  } = useEstado()

  const [borrador, setBorrador] = useState<Omit<Producto, 'id'>>(VACIO)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // la receta que se está editando, si alguna
  const [recetaDe, setRecetaDe] = useState<ID | null>(null)
  const [rendimiento, setRendimiento] = useState(1)
  const [items, setItems] = useState<ItemReceta[]>([])
  const [errorReceta, setErrorReceta] = useState<string | null>(null)

  const productos = produccion.productos
  const materias = inventario.materias_primas
  const materiasActivas = materias.filter((m) => m.activo)

  const opcionesMateria = useMemo(
    () => materiasActivas.map((m) => ({ valor: m.id, texto: `${m.codigo} · ${m.nombre}` })),
    [materiasActivas],
  )
  const materiaPorId = useMemo(() => new Map(materias.map((m) => [m.id, m])), [materias])

  // ---------------- producto ----------------
  const set = <K extends keyof Producto>(clave: K, valor: Producto[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIO)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardarProducto = () => {
    const codigo = borrador.codigo.trim()
    const nombre = borrador.nombre.trim()
    if (!codigo) return setError('El código es obligatorio.')
    if (!nombre) return setError('El nombre es obligatorio.')
    const repetido = productos.some(
      (p) => p.id !== editando && p.codigo.trim().toLowerCase() === codigo.toLowerCase(),
    )
    if (repetido) return setError(`Ya hay un producto con el código ${codigo}.`)

    if (editando) actualizarProducto(editando, { ...borrador, codigo, nombre })
    else crearProducto({ ...borrador, codigo, nombre })
    limpiar()
  }

  const editarProducto = (p: Producto) => {
    const { id: _id, ...resto } = p
    setBorrador(resto)
    setEditando(p.id)
    setAbierto(true)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ---------------- receta ----------------
  const abrirReceta = (p: Producto) => {
    const actual = calculado.recetaPorProducto[p.id]
    setRecetaDe(p.id)
    setRendimiento(actual?.rendimiento ?? 1)
    setItems(actual ? actual.items.map((i) => ({ ...i })) : [])
    setErrorReceta(null)
  }

  const agregarItem = () => {
    const primera = materiasActivas[0]
    if (!primera) {
      setErrorReceta('Primero creá materias primas: una receta es una lista de materiales.')
      return
    }
    setItems((xs) => [
      ...xs,
      { materia_prima_id: primera.id, cantidad: 1, unidad: primera.unidad, desperdicio_pct: 0 },
    ])
    setErrorReceta(null)
  }

  const cambiarItem = (i: number, parcial: Partial<ItemReceta>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...parcial } : x)))

  const quitarItem = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i))

  const guardarRecetaActual = () => {
    if (!recetaDe) return
    if (items.length === 0) return setErrorReceta('La receta necesita al menos un material.')
    if (rendimiento <= 0) return setErrorReceta('El rendimiento tiene que ser mayor que cero.')

    const vistos = new Set<ID>()
    for (const it of items) {
      const materia = materiaPorId.get(it.materia_prima_id)
      if (!materia) return setErrorReceta('Hay una línea sin material elegido.')
      if (vistos.has(it.materia_prima_id)) {
        return setErrorReceta(`${materia.nombre} está dos veces: juntá las cantidades en una línea.`)
      }
      vistos.add(it.materia_prima_id)
      if (it.cantidad <= 0) return setErrorReceta(`La cantidad de ${materia.nombre} tiene que ser mayor que cero.`)
      if (!compatibles(it.unidad, materia.unidad)) {
        return setErrorReceta(`${materia.nombre}: ${mensajeIncompatible(it.unidad, materia.unidad)}`)
      }
      if (it.desperdicio_pct < 0 || it.desperdicio_pct >= 100) {
        return setErrorReceta(`El desperdicio de ${materia.nombre} tiene que estar entre 0 y 99%.`)
      }
    }

    guardarReceta(recetaDe, rendimiento, items)
    setRecetaDe(null)
    setErrorReceta(null)
  }

  /**
   * El costo de la receta que se está editando, calculado en vivo sobre el
   * borrador. Usa la misma función pura que el resto del sistema, así que lo
   * que se ve aquí es exactamente lo que va a quedar guardado.
   */
  const costoBorrador = useMemo(() => {
    if (!recetaDe) return null
    const temporal: Receta = {
      id: 'borrador',
      producto_id: recetaDe,
      version: 0,
      rendimiento: rendimiento > 0 ? rendimiento : 1,
      items,
      horas_mo_estandar: 0,
      horas_maquina_estandar: 0,
      vigente: true,
    }
    return costoReceta(temporal, materias, calculado.tarjetas)
  }, [recetaDe, rendimiento, items, materias, calculado.tarjetas])

  const eliminar = (p: Producto) => {
    const motivo = borrarProducto(p.id)
    setError(motivo ? `No se pudo borrar ${p.nombre}: ${motivo}` : null)
  }

  const columnas: Columna<Producto>[] = [
    {
      clave: 'codigo',
      titulo: 'Código',
      valor: (p) => p.codigo,
      render: (p) => <span className="cifra text-xs text-suave">{p.codigo}</span>,
    },
    { clave: 'nombre', titulo: 'Producto', valor: (p) => p.nombre, render: (p) => <span className="font-medium">{p.nombre}</span> },
    {
      clave: 'unidad',
      titulo: 'Unidad',
      soloAncho: true,
      valor: (p) => p.unidad,
      render: (p) => <span className="text-xs text-suave">{nombreUnidad(p.unidad)}</span>,
    },
    {
      clave: 'receta',
      titulo: 'Receta',
      valor: (p) => calculado.recetaPorProducto[p.id]?.items.length ?? 0,
      render: (p) => {
        const r = calculado.recetaPorProducto[p.id]
        if (!r) return <Pildora tono="aviso">Sin receta</Pildora>
        return (
          <span className="text-xs text-suave">
            {r.items.length} material(es) · por {fmtCantidad(r.rendimiento, 0)} {unidadCorta(p.unidad)}
          </span>
        )
      },
    },
    {
      clave: 'costo',
      titulo: 'Material / unidad',
      alineacion: 'der',
      valor: (p) => {
        const r = calculado.recetaPorProducto[p.id]
        return r ? (calculado.costosReceta[r.id]?.por_unidad ?? 0) : 0
      },
      render: (p) => {
        const r = calculado.recetaPorProducto[p.id]
        if (!r) return <span className="text-tenue">—</span>
        const c = calculado.costosReceta[r.id]
        return (
          <span className="cifra tabular-nums">
            {copPreciso(c?.por_unidad ?? 0)}
            {c && c.faltantes.length > 0 && <span className="ml-1 text-aviso">⚠</span>}
          </span>
        )
      },
    },
    {
      clave: 'precio',
      titulo: 'Precio ref.',
      alineacion: 'der',
      soloAncho: true,
      valor: (p) => p.precio_referencia ?? 0,
      render: (p) =>
        p.precio_referencia == null ? (
          <span className="text-tenue">—</span>
        ) : (
          <span className="cifra tabular-nums">{cop(p.precio_referencia)}</span>
        ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (p) => (p.activo ? 'activo' : 'inactivo'),
      render: (p) => (p.activo ? <Pildora tono="positivo">Activo</Pildora> : <Pildora>Inactivo</Pildora>),
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (p) => (
        <span className="inline-flex gap-1.5">
          <Boton variante="secundario" onClick={() => abrirReceta(p)}>
            Receta
          </Boton>
          <Boton variante="fantasma" onClick={() => editarProducto(p)}>
            Editar
          </Boton>
          <BotonConfirmar variante="fantasma" onConfirmar={() => eliminar(p)}>
            Borrar
          </BotonConfirmar>
        </span>
      ),
    },
  ]

  const productoDeReceta = recetaDe ? productos.find((p) => p.id === recetaDe) : null

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Cada producto lleva una receta: la lista de materiales que consume."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nuevo producto
              </Boton>
            )
          }
        >
          Productos
        </TituloSeccion>

        <Rejilla columnas={3}>
          <Cifra etiqueta="Productos" valor={productos.length} tamano="sm" />
          <Cifra
            etiqueta="Con receta"
            valor={productos.filter((p) => calculado.recetaPorProducto[p.id]).length}
            tamano="sm"
          />
          <Cifra etiqueta="Materias primas disponibles" valor={materiasActivas.length} tamano="sm" />
        </Rejilla>
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion>{editando ? 'Editar producto' : 'Nuevo producto'}</TituloSeccion>
          <Rejilla columnas={3}>
            <Campo etiqueta="Código *">
              {(id) => (
                <InputTexto id={id} valor={borrador.codigo} onChange={(v) => set('codigo', v)} placeholder="PT-001" />
              )}
            </Campo>
            <Campo etiqueta="Nombre *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Mesa de comedor"
                />
              )}
            </Campo>
            <Campo etiqueta="Unidad">
              {(id) => (
                <Selector<UnidadMedida>
                  id={id}
                  valor={borrador.unidad}
                  onChange={(v) => set('unidad', v)}
                  opciones={OPCIONES_UNIDAD}
                />
              )}
            </Campo>
            <Campo etiqueta="Precio de referencia" ayuda="Lo que hoy se cobra. 0 = sin definir.">
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.precio_referencia ?? 0}
                  onChange={(n) => set('precio_referencia', n > 0 ? n : null)}
                  paso={1000}
                  sufijo="$"
                />
              )}
            </Campo>
            <Campo etiqueta="Margen objetivo" ayuda="0 = usar el margen por defecto de la configuración.">
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.margen_objetivo_pct ?? 0}
                  onChange={(n) => set('margen_objetivo_pct', n > 0 ? n : null)}
                  paso={1}
                  sufijo="%"
                />
              )}
            </Campo>
            <Campo etiqueta="Nota">
              {(id) => <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Casilla valor={borrador.activo} onChange={(v) => set('activo', v)} etiqueta="Activo" />
            <div className="flex gap-2">
              <Boton variante="primario" onClick={guardarProducto}>
                {editando ? 'Guardar cambios' : 'Agregar'}
              </Boton>
              <Boton variante="fantasma" onClick={limpiar}>
                Cancelar
              </Boton>
            </div>
          </div>
        </Tarjeta>
      )}

      {/* ---------- editor de receta ---------- */}
      {productoDeReceta && (
        <Tarjeta className="border-acento/40">
          <TituloSeccion
            nota={
              <>
                Las cantidades son por <strong>{fmtCantidad(rendimiento, 0)}</strong>{' '}
                {unidadCorta(productoDeReceta.unidad)} de producto. Poné 1 para una receta por unidad,
                o el tamaño del lote si así se fabrica.
              </>
            }
          >
            Receta de {productoDeReceta.nombre}
          </TituloSeccion>

          <Rejilla columnas={3}>
            <Campo etiqueta="Rendimiento del lote">
              {(id) => (
                <InputCifra
                  id={id}
                  valor={rendimiento}
                  onChange={setRendimiento}
                  min={1}
                  paso={1}
                  sufijo={unidadCorta(productoDeReceta.unidad)}
                />
              )}
            </Campo>
            <div className="rounded-lg border border-borde bg-panel-alto p-3">
              <Cifra
                etiqueta="Material por lote"
                valor={cop(costoBorrador?.total_lote ?? 0)}
                tamano="sm"
              />
            </div>
            <div className="rounded-lg border border-borde bg-panel-alto p-3">
              <Cifra
                etiqueta="Material por unidad"
                valor={copPreciso(costoBorrador?.por_unidad ?? 0)}
                tamano="sm"
                tono="acento"
                pie="Con los costos promedio de hoy"
              />
            </div>
          </Rejilla>

          <div className="mt-4 space-y-2">
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed border-borde px-3 py-6 text-center text-sm text-tenue">
                La receta está vacía. Agregá el primer material.
              </p>
            )}

            {items.map((it, i) => {
              const materia = materiaPorId.get(it.materia_prima_id)
              const malaUnidad = materia ? !compatibles(it.unidad, materia.unidad) : false
              return (
                <div
                  key={i}
                  className="grid grid-cols-1 items-end gap-2 rounded-lg border border-borde bg-panel-alto p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                >
                  <Campo etiqueta="Material">
                    {(id) => (
                      <Selector
                        id={id}
                        valor={it.materia_prima_id}
                        onChange={(v) => {
                          const m = materiaPorId.get(v)
                          // al cambiar de material, la unidad se alinea con la suya:
                          // así no queda una mezcla imposible por descuido
                          cambiarItem(i, { materia_prima_id: v, unidad: m?.unidad ?? it.unidad })
                        }}
                        opciones={opcionesMateria}
                      />
                    )}
                  </Campo>
                  <Campo etiqueta="Cantidad">
                    {(id) => (
                      <InputCifra
                        id={id}
                        valor={it.cantidad}
                        onChange={(n) => cambiarItem(i, { cantidad: n })}
                        paso={0.25}
                      />
                    )}
                  </Campo>
                  <Campo
                    etiqueta="Unidad"
                    error={malaUnidad && materia ? `Incompatible con ${unidadCorta(materia.unidad)}` : undefined}
                  >
                    {(id) => (
                      <Selector<UnidadMedida>
                        id={id}
                        valor={it.unidad}
                        onChange={(v) => cambiarItem(i, { unidad: v })}
                        opciones={OPCIONES_UNIDAD}
                      />
                    )}
                  </Campo>
                  <Campo etiqueta="Desperdicio">
                    {(id) => (
                      <InputCifra
                        id={id}
                        valor={it.desperdicio_pct}
                        onChange={(n) => cambiarItem(i, { desperdicio_pct: n })}
                        paso={1}
                        sufijo="%"
                      />
                    )}
                  </Campo>
                  <Boton variante="fantasma" onClick={() => quitarItem(i)} titulo="Quitar material">
                    ✕
                  </Boton>
                </div>
              )
            })}
          </div>

          {errorReceta && (
            <div className="mt-3">
              <Aviso tono="negativo">{errorReceta}</Aviso>
            </div>
          )}

          {costoBorrador && costoBorrador.faltantes.length > 0 && (
            <div className="mt-3">
              <Aviso tono="aviso" titulo="Hay materiales sin costear">
                {costoBorrador.faltantes.join(' ')}
              </Aviso>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={agregarItem}>
              + Agregar material
            </Boton>
            <Boton variante="primario" onClick={guardarRecetaActual}>
              Guardar receta
            </Boton>
            <Boton variante="fantasma" onClick={() => setRecetaDe(null)}>
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={productos}
          claveFila={(p) => p.id}
          filtrable
          placeholderFiltro="Buscar producto…"
          ordenInicial={{ clave: 'codigo', asc: true }}
          vacio="Todavía no hay productos."
        />
      </Tarjeta>
    </div>
  )
}
