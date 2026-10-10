import { useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  Cifra,
  InputTexto,
  Pildora,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Columna } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cop } from '../../lib/formato'
import type { ID, PeriodoNomina } from '../../lib/tipos'

const ESTADOS: ReadonlyArray<{ valor: PeriodoNomina['estado']; texto: string }> = [
  { valor: 'abierto', texto: 'Abierto' },
  { valor: 'cerrado', texto: 'Cerrado' },
]

function mesActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Primer y último día del mes 'YYYY-MM'. */
function limitesDelMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number)
  if (!a || !m) return { desde: '', hasta: '' }
  const ultimo = new Date(a, m, 0).getDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

const VACIO: Omit<PeriodoNomina, 'id'> = {
  nombre: '',
  mes: mesActual(),
  ...limitesDelMes(mesActual()),
  estado: 'abierto',
}

export function Periodos() {
  const { nomina, calculado, crearPeriodoNomina, actualizarPeriodoNomina, borrarPeriodoNomina } =
    useEstado()

  const [borrador, setBorrador] = useState<Omit<PeriodoNomina, 'id'>>(VACIO)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const periodos = nomina.periodos

  const set = <K extends keyof PeriodoNomina>(clave: K, valor: PeriodoNomina[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  /** Al cambiar el mes se recalculan las fechas, que es lo que uno espera. */
  const setMes = (mes: string) =>
    setBorrador((b) => ({ ...b, mes, ...(mes.length === 7 ? limitesDelMes(mes) : {}) }))

  const limpiar = () => {
    setBorrador(VACIO)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardar = () => {
    const nombre = borrador.nombre.trim() || `Nómina ${borrador.mes}`
    if (!/^\d{4}-\d{2}$/.test(borrador.mes)) return setError('El mes va en formato AAAA-MM.')
    if (!borrador.desde || !borrador.hasta) return setError('Faltan las fechas del período.')
    if (borrador.hasta < borrador.desde) return setError('La fecha de cierre es anterior a la de inicio.')
    const repetido = periodos.some(
      (p) => p.id !== editando && p.nombre.trim().toLowerCase() === nombre.toLowerCase(),
    )
    if (repetido) return setError(`Ya hay un período llamado «${nombre}».`)

    if (editando) actualizarPeriodoNomina(editando, { ...borrador, nombre })
    else crearPeriodoNomina({ ...borrador, nombre })
    limpiar()
  }

  const editar = (p: PeriodoNomina) => {
    const { id: _id, ...resto } = p
    setBorrador(resto)
    setEditando(p.id)
    setAbierto(true)
    setError(null)
  }

  const eliminar = (p: PeriodoNomina) => {
    const motivo = borrarPeriodoNomina(p.id)
    setError(motivo ? `No se pudo borrar «${p.nombre}»: ${motivo}` : null)
  }

  const columnas: Columna<PeriodoNomina>[] = [
    {
      clave: 'nombre',
      titulo: 'Período',
      valor: (p) => p.nombre,
      render: (p) => (
        <div>
          <p className="font-medium">{p.nombre}</p>
          <p className="cifra text-xs text-tenue">
            {p.desde} → {p.hasta}
          </p>
        </div>
      ),
    },
    {
      clave: 'mes',
      titulo: 'Mes',
      soloAncho: true,
      valor: (p) => p.mes,
      render: (p) => <span className="cifra text-xs text-suave">{p.mes}</span>,
    },
    {
      clave: 'liquidaciones',
      titulo: 'Liquidaciones',
      alineacion: 'der',
      valor: (p) => calculado.resumenesNomina[p.id]?.liquidaciones ?? 0,
      render: (p) => (
        <span className="cifra tabular-nums">{calculado.resumenesNomina[p.id]?.liquidaciones ?? 0}</span>
      ),
    },
    {
      clave: 'neto',
      titulo: 'Neto a pagar',
      alineacion: 'der',
      valor: (p) => calculado.resumenesNomina[p.id]?.total_neto ?? 0,
      render: (p) => (
        <span className="cifra tabular-nums">{cop(calculado.resumenesNomina[p.id]?.total_neto ?? 0)}</span>
      ),
    },
    {
      clave: 'costo',
      titulo: 'Costo empresa',
      alineacion: 'der',
      valor: (p) => calculado.resumenesNomina[p.id]?.total_costo_empresa ?? 0,
      render: (p) => (
        <span className="cifra tabular-nums text-acento">
          {cop(calculado.resumenesNomina[p.id]?.total_costo_empresa ?? 0)}
        </span>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (p) => p.estado,
      render: (p) =>
        p.estado === 'abierto' ? (
          <Pildora tono="positivo">Abierto</Pildora>
        ) : (
          <Pildora>Cerrado</Pildora>
        ),
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (p) => (
        <span className="inline-flex gap-1.5">
          <Boton variante="fantasma" onClick={() => editar(p)}>
            Editar
          </Boton>
          <BotonConfirmar variante="fantasma" onConfirmar={() => eliminar(p)}>
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
          nota="Un período es un mes o una quincena. Las horas y las novedades cuelgan de acá."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nuevo período
              </Boton>
            )
          }
        >
          Períodos de nómina
        </TituloSeccion>

        <Rejilla columnas={3}>
          <Cifra etiqueta="Períodos" valor={periodos.length} tamano="sm" />
          <Cifra
            etiqueta="Abiertos"
            valor={periodos.filter((p) => p.estado === 'abierto').length}
            tamano="sm"
          />
          <Cifra etiqueta="Registros de horas" valor={calculado.conteos.registrosHoras} tamano="sm" />
        </Rejilla>
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion nota="El mes define las fechas; se pueden ajustar a mano para una quincena.">
            {editando ? 'Editar período' : 'Nuevo período'}
          </TituloSeccion>
          <Rejilla columnas={4}>
            <Campo etiqueta="Mes (AAAA-MM)">
              {(id) => <InputTexto id={id} valor={borrador.mes} onChange={setMes} placeholder="2026-02" />}
            </Campo>
            <Campo etiqueta="Nombre" ayuda="Vacío = «Nómina AAAA-MM».">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Febrero 2026"
                />
              )}
            </Campo>
            <Campo etiqueta="Desde">
              {(id) => (
                <InputTexto id={id} tipo="date" valor={borrador.desde} onChange={(v) => set('desde', v)} />
              )}
            </Campo>
            <Campo etiqueta="Hasta">
              {(id) => (
                <InputTexto id={id} tipo="date" valor={borrador.hasta} onChange={(v) => set('hasta', v)} />
              )}
            </Campo>
            <Campo etiqueta="Estado" ayuda="Cerrado = ya no debería recibir horas nuevas.">
              {(id) => (
                <Selector id={id} valor={borrador.estado} onChange={(v) => set('estado', v)} opciones={ESTADOS} />
              )}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex gap-2">
            <Boton variante="primario" onClick={guardar}>
              {editando ? 'Guardar cambios' : 'Crear período'}
            </Boton>
            <Boton variante="fantasma" onClick={limpiar}>
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={periodos}
          claveFila={(p) => p.id}
          ordenInicial={{ clave: 'mes', asc: false }}
          vacio="Todavía no hay períodos. Creá el primero para poder registrar horas."
        />
      </Tarjeta>
    </div>
  )
}
