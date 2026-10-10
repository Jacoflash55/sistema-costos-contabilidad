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
import type { ID, MateriaPrima, UnidadMedida } from '../lib/tipos'
import { UNIDADES, nombreUnidad, unidadCorta } from '../lib/unidades'

const VACIA: Omit<MateriaPrima, 'id'> = {
  codigo: '',
  nombre: '',
  descripcion: '',
  unidad: 'unidad',
  categoria: '',
  cantidad_inicial: 0,
  costo_unitario_inicial: 0,
  stock_minimo: 0,
  proveedor: '',
  activo: true,
  nota: '',
}

const OPCIONES_UNIDAD = UNIDADES.map((u) => ({ valor: u, texto: nombreUnidad(u) }))

export function MateriasPrimas() {
  const {
    inventario,
    calculado,
    crearMateriaPrima,
    actualizarMateriaPrima,
    borrarMateriaPrima,
  } = useEstado()

  const [borrador, setBorrador] = useState<Omit<MateriaPrima, 'id'>>(VACIA)
  const [editando, setEditando] = useState<ID | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  const materias = inventario.materias_primas
  const tarjetas = calculado.tarjetas

  const set = <K extends keyof MateriaPrima>(clave: K, valor: MateriaPrima[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIA)
    setEditando(null)
    setError(null)
    setAbierto(false)
  }

  const guardar = () => {
    const codigo = borrador.codigo.trim()
    const nombre = borrador.nombre.trim()

    if (!codigo) return setError('El código es obligatorio.')
    if (!nombre) return setError('El nombre es obligatorio.')

    const repetido = materias.some(
      (m) => m.id !== editando && m.codigo.trim().toLowerCase() === codigo.toLowerCase(),
    )
    if (repetido) return setError(`Ya hay una materia prima con el código ${codigo}.`)
    if (borrador.cantidad_inicial < 0) return setError('La cantidad inicial no puede ser negativa.')
    if (borrador.costo_unitario_inicial < 0) return setError('El costo inicial no puede ser negativo.')

    const limpio = { ...borrador, codigo, nombre }
    if (editando) actualizarMateriaPrima(editando, limpio)
    else crearMateriaPrima(limpio)
    limpiar()
  }

  const editar = (m: MateriaPrima) => {
    const { id: _id, ...resto } = m
    setBorrador(resto)
    setEditando(m.id)
    setError(null)
    setAbierto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const eliminar = (m: MateriaPrima) => {
    const motivo = borrarMateriaPrima(m.id)
    setError(motivo ? `No se pudo borrar ${m.nombre}: ${motivo}` : null)
  }

  /** Cuántos movimientos tiene cada material. Para avisar al editar la apertura. */
  const movimientosPorMateria = useMemo(() => {
    const out = new Map<ID, number>()
    for (const m of inventario.movimientos) {
      out.set(m.materia_prima_id, (out.get(m.materia_prima_id) ?? 0) + 1)
    }
    return out
  }, [inventario.movimientos])

  const columnas: Columna<MateriaPrima>[] = [
    {
      clave: 'codigo',
      titulo: 'Código',
      valor: (m) => m.codigo,
      render: (m) => <span className="cifra text-xs text-suave">{m.codigo}</span>,
    },
    {
      clave: 'nombre',
      titulo: 'Material',
      valor: (m) => m.nombre,
      render: (m) => (
        <div>
          <p className="font-medium">{m.nombre}</p>
          {m.descripcion && <p className="text-xs text-tenue">{m.descripcion}</p>}
        </div>
      ),
    },
    {
      clave: 'categoria',
      titulo: 'Categoría',
      valor: (m) => m.categoria,
      soloAncho: true,
      render: (m) => (m.categoria ? <Pildora>{m.categoria}</Pildora> : <span className="text-tenue">—</span>),
    },
    {
      clave: 'existencias',
      titulo: 'Existencias',
      alineacion: 'der',
      valor: (m) => tarjetas[m.id]?.saldo_cantidad ?? 0,
      render: (m) => {
        const saldo = tarjetas[m.id]?.saldo_cantidad ?? 0
        const bajo = m.stock_minimo > 0 && saldo < m.stock_minimo
        return (
          <span className={`cifra tabular-nums ${bajo ? 'text-aviso' : ''}`}>
            {fmtCantidad(saldo)} {unidadCorta(m.unidad)}
          </span>
        )
      },
    },
    {
      clave: 'promedio',
      titulo: 'Costo prom.',
      alineacion: 'der',
      valor: (m) => tarjetas[m.id]?.costo_promedio ?? 0,
      render: (m) => (
        <span className="cifra tabular-nums">{copPreciso(tarjetas[m.id]?.costo_promedio ?? 0)}</span>
      ),
    },
    {
      clave: 'valor',
      titulo: 'Valor',
      alineacion: 'der',
      valor: (m) => tarjetas[m.id]?.saldo_total ?? 0,
      render: (m) => <span className="cifra tabular-nums">{cop(tarjetas[m.id]?.saldo_total ?? 0)}</span>,
    },
    {
      clave: 'minimo',
      titulo: 'Mínimo',
      alineacion: 'der',
      soloAncho: true,
      valor: (m) => m.stock_minimo,
      render: (m) =>
        m.stock_minimo > 0 ? (
          <span className="cifra text-xs text-tenue">{fmtCantidad(m.stock_minimo)}</span>
        ) : (
          <span className="text-tenue">—</span>
        ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (m) => (m.activo ? 'activa' : 'inactiva'),
      render: (m) =>
        m.activo ? <Pildora tono="positivo">Activa</Pildora> : <Pildora>Inactiva</Pildora>,
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (m) => (
        <span className="inline-flex gap-1.5">
          <Boton variante="fantasma" onClick={() => editar(m)}>
            Editar
          </Boton>
          <BotonConfirmar variante="fantasma" onConfirmar={() => eliminar(m)} titulo="Borrar">
            Borrar
          </BotonConfirmar>
        </span>
      ),
    },
  ]

  const movsDelEditado = editando ? (movimientosPorMateria.get(editando) ?? 0) : 0

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Sin límite de cantidad: agregá todas las que necesite el taller."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nueva materia prima
              </Boton>
            )
          }
        >
          Materias primas
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Cifra etiqueta="Materiales" valor={materias.length} tamano="sm" />
          <Cifra
            etiqueta="Activos"
            valor={materias.filter((m) => m.activo).length}
            tamano="sm"
          />
          <Cifra etiqueta="Valor del inventario" valor={cop(calculado.valorInventario)} tamano="sm" />
          <Cifra
            etiqueta="Bajo el mínimo"
            valor={calculado.bajoMinimo.length}
            tono={calculado.bajoMinimo.length > 0 ? 'aviso' : 'neutro'}
            tamano="sm"
          />
        </Rejilla>
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {calculado.bajoMinimo.length > 0 && (
        <Aviso tono="aviso" titulo="Materiales por debajo del stock mínimo">
          {calculado.bajoMinimo
            .map((m) => `${m.nombre} (${fmtCantidad(tarjetas[m.id]?.saldo_cantidad ?? 0)} ${unidadCorta(m.unidad)})`)
            .join(' · ')}
        </Aviso>
      )}

      {abierto && (
        <Tarjeta>
          <TituloSeccion
            nota={editando ? 'Estás editando un material que ya existe.' : 'Los campos en blanco quedan vacíos, no en cero.'}
          >
            {editando ? 'Editar materia prima' : 'Nueva materia prima'}
          </TituloSeccion>

          <Rejilla columnas={3}>
            <Campo etiqueta="Código *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.codigo}
                  onChange={(v) => set('codigo', v)}
                  placeholder="MP-001"
                />
              )}
            </Campo>
            <Campo etiqueta="Nombre *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Madera de pino"
                />
              )}
            </Campo>
            <Campo etiqueta="Categoría">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.categoria}
                  onChange={(v) => set('categoria', v)}
                  placeholder="Maderas"
                />
              )}
            </Campo>

            <Campo etiqueta="Descripción" className="sm:col-span-2">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.descripcion}
                  onChange={(v) => set('descripcion', v)}
                  placeholder="Tabla cepillada de 2,40 m"
                />
              )}
            </Campo>
            <Campo etiqueta="Unidad de medida" ayuda="En esta unidad se guarda el saldo del Kardex.">
              {(id) => (
                <Selector<UnidadMedida>
                  id={id}
                  valor={borrador.unidad}
                  onChange={(v) => set('unidad', v)}
                  opciones={OPCIONES_UNIDAD}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Cantidad inicial"
              ayuda={`El saldo de apertura, en ${unidadCorta(borrador.unidad)}.`}
            >
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.cantidad_inicial}
                  onChange={(n) => set('cantidad_inicial', n)}
                  paso={1}
                  sufijo={unidadCorta(borrador.unidad)}
                />
              )}
            </Campo>
            <Campo etiqueta="Costo unitario inicial" ayuda="Con qué costo entró ese saldo.">
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.costo_unitario_inicial}
                  onChange={(n) => set('costo_unitario_inicial', n)}
                  paso={100}
                  sufijo="$"
                />
              )}
            </Campo>
            <Campo etiqueta="Stock mínimo" ayuda="0 = no avisar.">
              {(id) => (
                <InputCifra
                  id={id}
                  valor={borrador.stock_minimo}
                  onChange={(n) => set('stock_minimo', n)}
                  paso={1}
                  sufijo={unidadCorta(borrador.unidad)}
                />
              )}
            </Campo>

            <Campo etiqueta="Proveedor">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.proveedor}
                  onChange={(v) => set('proveedor', v)}
                  placeholder="Maderas El Roble"
                />
              )}
            </Campo>
            <Campo etiqueta="Nota" className="sm:col-span-2">
              {(id) => (
                <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />
              )}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Casilla
              valor={borrador.activo}
              onChange={(v) => set('activo', v)}
              etiqueta="Activa (se puede comprar y consumir)"
            />
            <div className="flex gap-2">
              <Boton variante="primario" onClick={guardar}>
                {editando ? 'Guardar cambios' : 'Agregar'}
              </Boton>
              <Boton variante="fantasma" onClick={limpiar}>
                Cancelar
              </Boton>
            </div>
          </div>

          {editando && movsDelEditado > 0 && (
            <div className="mt-3">
              <Aviso tono="aviso">
                Este material ya tiene {movsDelEditado} movimiento(s). Cambiar la cantidad o el costo
                inicial recalcula toda su tarjeta de Kardex desde el principio, porque la apertura es
                el primer renglón.
              </Aviso>
            </div>
          )}
        </Tarjeta>
      )}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={materias}
          claveFila={(m) => m.id}
          filtrable
          placeholderFiltro="Buscar por código, nombre o categoría…"
          ordenInicial={{ clave: 'codigo', asc: true }}
          resaltarFila={(m) =>
            m.stock_minimo > 0 && (tarjetas[m.id]?.saldo_cantidad ?? 0) < m.stock_minimo ? 'aviso' : null
          }
          vacio="Todavía no hay materias primas. Agregá la primera con el botón de arriba."
        />
      </Tarjeta>
    </div>
  )
}
