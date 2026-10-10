import { useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  Casilla,
  Cifra,
  InputTexto,
  Pildora,
  Rejilla,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Columna } from '../../components/ui'
import { useEstado } from '../../contexto'
import type { Cliente, ID } from '../../lib/tipos'

const VACIO: Omit<Cliente, 'id'> = {
  nombre: '',
  nit: '',
  contacto: '',
  ciudad: '',
  activo: true,
  nota: '',
}

/**
 * Clientes reutilizables.
 *
 * Se registran una vez y se eligen desde cada orden; la hoja de costos lee el
 * nombre de ahí. Nunca se vuelven a escribir los datos de un cliente que ya
 * existe: editarlo acá lo actualiza en todas las órdenes y hojas en borrador
 * que lo usen.
 */
export function Clientes() {
  const { comercial, produccion, crearCliente, actualizarCliente, borrarCliente } = useEstado()

  const [borrador, setBorrador] = useState<Omit<Cliente, 'id'>>(VACIO)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientes = comercial.clientes

  const set = <K extends keyof Cliente>(clave: K, valor: Cliente[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIO)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardar = () => {
    const nombre = borrador.nombre.trim()
    if (!nombre) return setError('El nombre es obligatorio.')
    const repetido = clientes.some(
      (c) => c.id !== editando && c.nombre.trim().toLowerCase() === nombre.toLowerCase(),
    )
    if (repetido) {
      return setError(
        `Ya hay un cliente llamado «${nombre}». Usalo en vez de crear otro, o editalo si cambiaron sus datos.`,
      )
    }

    if (editando) actualizarCliente(editando, { ...borrador, nombre })
    else crearCliente({ ...borrador, nombre })
    limpiar()
  }

  const editar = (c: Cliente) => {
    const { id: _id, ...resto } = c
    setBorrador(resto)
    setEditando(c.id)
    setAbierto(true)
    setError(null)
  }

  const eliminar = (c: Cliente) => {
    const motivo = borrarCliente(c.id)
    setError(motivo ? `No se pudo borrar a ${c.nombre}: ${motivo}` : null)
  }

  const ordenesDe = (id: ID) => produccion.ordenes.filter((o) => o.cliente_id === id).length

  const columnas: Columna<Cliente>[] = [
    {
      clave: 'nombre',
      titulo: 'Cliente',
      valor: (c) => c.nombre,
      render: (c) => (
        <div>
          <p className="font-medium">{c.nombre}</p>
          {c.nit && <p className="cifra text-xs text-tenue">NIT {c.nit}</p>}
        </div>
      ),
    },
    {
      clave: 'contacto',
      titulo: 'Contacto',
      soloAncho: true,
      valor: (c) => c.contacto ?? '',
      render: (c) => <span className="text-xs text-suave">{c.contacto || '—'}</span>,
    },
    {
      clave: 'ciudad',
      titulo: 'Ciudad',
      valor: (c) => c.ciudad ?? '',
      render: (c) => <span className="text-xs text-suave">{c.ciudad || '—'}</span>,
    },
    {
      clave: 'ordenes',
      titulo: 'Órdenes',
      alineacion: 'der',
      valor: (c) => ordenesDe(c.id),
      render: (c) => <span className="cifra tabular-nums">{ordenesDe(c.id)}</span>,
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (c) => (c.activo ? 'activo' : 'inactivo'),
      render: (c) => (c.activo ? <Pildora tono="positivo">Activo</Pildora> : <Pildora>Inactivo</Pildora>),
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (c) => (
        <span className="inline-flex gap-1.5">
          <Boton variante="fantasma" onClick={() => editar(c)}>
            Editar
          </Boton>
          <BotonConfirmar variante="fantasma" onConfirmar={() => eliminar(c)}>
            Borrar
          </BotonConfirmar>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Se registran una vez y se eligen desde cada orden. La hoja de costos lee el nombre de acá."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nuevo cliente
              </Boton>
            )
          }
        >
          Clientes
        </TituloSeccion>

        <Rejilla columnas={3}>
          <Cifra etiqueta="Clientes" valor={clientes.length} tamano="sm" />
          <Cifra etiqueta="Activos" valor={clientes.filter((c) => c.activo).length} tamano="sm" />
          <Cifra
            etiqueta="Órdenes con cliente"
            valor={produccion.ordenes.filter((o) => o.cliente_id).length}
            tamano="sm"
          />
        </Rejilla>
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion>{editando ? `Editar a ${borrador.nombre}` : 'Nuevo cliente'}</TituloSeccion>
          <Rejilla columnas={4}>
            <Campo etiqueta="Nombre *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Muebles del Norte S.A.S."
                />
              )}
            </Campo>
            <Campo etiqueta="NIT">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nit ?? ''}
                  onChange={(v) => set('nit', v)}
                  placeholder="900.111.222-3"
                />
              )}
            </Campo>
            <Campo etiqueta="Contacto">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.contacto ?? ''}
                  onChange={(v) => set('contacto', v)}
                  placeholder="Carolina Ríos · 300 123 4567"
                />
              )}
            </Campo>
            <Campo etiqueta="Ciudad">
              {(id) => (
                <InputTexto id={id} valor={borrador.ciudad ?? ''} onChange={(v) => set('ciudad', v)} />
              )}
            </Campo>
            <Campo etiqueta="Nota" className="sm:col-span-2">
              {(id) => <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Casilla valor={borrador.activo} onChange={(v) => set('activo', v)} etiqueta="Activo" />
            <div className="flex gap-2">
              <Boton variante="primario" onClick={guardar}>
                {editando ? 'Guardar cambios' : 'Agregar'}
              </Boton>
              <Boton variante="fantasma" onClick={limpiar}>
                Cancelar
              </Boton>
            </div>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={clientes}
          claveFila={(c) => c.id}
          filtrable
          placeholderFiltro="Buscar cliente…"
          ordenInicial={{ clave: 'nombre', asc: true }}
          vacio="Todavía no hay clientes. Una orden puede ir sin cliente, pero la hoja queda más completa con él."
        />
      </Tarjeta>
    </div>
  )
}
