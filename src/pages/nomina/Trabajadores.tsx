import { useState } from 'react'

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
} from '../../components/ui'
import type { Columna, Tono } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cop, copPreciso } from '../../lib/formato'
import { ETIQUETA_CLASIFICACION, costoHoraCargado, valorHora } from '../../lib/nomina'
import type {
  ClasificacionMO,
  ID,
  ModalidadRemuneracion,
  TipoContrato,
  Trabajador,
} from '../../lib/tipos'

const CLASIFICACIONES: ReadonlyArray<{ valor: ClasificacionMO; texto: string }> = [
  { valor: 'directa', texto: 'Mano de obra DIRECTA (va a la hoja de costos)' },
  { valor: 'indirecta', texto: 'Mano de obra INDIRECTA (va a los CIF)' },
  { valor: 'administracion', texto: 'Administración (gasto del período)' },
  { valor: 'ventas', texto: 'Ventas (gasto del período)' },
]

const TONO_CLASIFICACION: Record<ClasificacionMO, Tono> = {
  directa: 'acento',
  indirecta: 'aviso',
  administracion: 'neutro',
  ventas: 'neutro',
}

const MODALIDADES: ReadonlyArray<{ valor: ModalidadRemuneracion; texto: string }> = [
  { valor: 'mensual', texto: 'Mensual fijo' },
  { valor: 'por_hora', texto: 'Por hora' },
]

const CONTRATOS: ReadonlyArray<{ valor: TipoContrato; texto: string }> = [
  { valor: 'termino_indefinido', texto: 'Término indefinido' },
  { valor: 'termino_fijo', texto: 'Término fijo' },
  { valor: 'obra_labor', texto: 'Obra o labor' },
  { valor: 'aprendiz', texto: 'Aprendiz' },
]

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const VACIO: Omit<Trabajador, 'id'> = {
  codigo: '',
  nombre: '',
  documento: '',
  cargo: '',
  area: '',
  clasificacion: 'directa',
  modalidad: 'mensual',
  salario_basico: 1_423_500,
  tarifa_hora: 0,
  tiene_auxilio_transporte: true,
  tipo_contrato: 'termino_indefinido',
  fecha_ingreso: hoyISO(),
  activo: true,
  nota: '',
}

export function Trabajadores() {
  const { nomina, config, crearTrabajador, actualizarTrabajador, borrarTrabajador } = useEstado()

  const [borrador, setBorrador] = useState<Omit<Trabajador, 'id'>>(VACIO)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trabajadores = nomina.trabajadores
  const parametros = config.parametros

  const set = <K extends keyof Trabajador>(clave: K, valor: Trabajador[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIO)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardar = () => {
    const codigo = borrador.codigo.trim()
    const nombre = borrador.nombre.trim()
    if (!codigo) return setError('El código es obligatorio.')
    if (!nombre) return setError('El nombre es obligatorio.')
    const repetido = trabajadores.some(
      (t) => t.id !== editando && t.codigo.trim().toLowerCase() === codigo.toLowerCase(),
    )
    if (repetido) return setError(`Ya hay un trabajador con el código ${codigo}.`)

    if (borrador.modalidad === 'mensual' && borrador.salario_basico <= 0) {
      return setError('Un trabajador mensual necesita un salario mayor que cero.')
    }
    if (borrador.modalidad === 'por_hora' && borrador.tarifa_hora <= 0) {
      return setError('Un trabajador por hora necesita una tarifa mayor que cero.')
    }

    if (editando) actualizarTrabajador(editando, { ...borrador, codigo, nombre })
    else crearTrabajador({ ...borrador, codigo, nombre })
    limpiar()
  }

  const editar = (t: Trabajador) => {
    const { id: _id, ...resto } = t
    setBorrador(resto)
    setEditando(t.id)
    setAbierto(true)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const eliminar = (t: Trabajador) => {
    const motivo = borrarTrabajador(t.id)
    setError(motivo ? `No se pudo borrar a ${t.nombre}: ${motivo}` : null)
  }

  /** El trabajador del borrador, para ver el valor hora mientras se escribe. */
  const vhBorrador = valorHora({ ...borrador, id: 'borrador' }, parametros)

  const columnas: Columna<Trabajador>[] = [
    {
      clave: 'codigo',
      titulo: 'Código',
      valor: (t) => t.codigo,
      render: (t) => <span className="cifra text-xs text-suave">{t.codigo}</span>,
    },
    {
      clave: 'nombre',
      titulo: 'Trabajador',
      valor: (t) => t.nombre,
      render: (t) => (
        <div>
          <p className="font-medium">{t.nombre}</p>
          <p className="text-xs text-tenue">
            {t.cargo}
            {t.area && ` · ${t.area}`}
          </p>
        </div>
      ),
    },
    {
      clave: 'clasificacion',
      titulo: 'Clasificación',
      valor: (t) => t.clasificacion,
      render: (t) => (
        <Pildora tono={TONO_CLASIFICACION[t.clasificacion]}>
          {t.clasificacion === 'directa'
            ? 'MOD'
            : t.clasificacion === 'indirecta'
              ? 'MOI'
              : ETIQUETA_CLASIFICACION[t.clasificacion]}
        </Pildora>
      ),
    },
    {
      clave: 'modalidad',
      titulo: 'Modalidad',
      soloAncho: true,
      valor: (t) => t.modalidad,
      render: (t) => (
        <span className="text-xs text-suave">{t.modalidad === 'mensual' ? 'Mensual' : 'Por hora'}</span>
      ),
    },
    {
      clave: 'remuneracion',
      titulo: 'Salario / tarifa',
      alineacion: 'der',
      valor: (t) => (t.modalidad === 'mensual' ? t.salario_basico : t.tarifa_hora),
      render: (t) => (
        <span className="cifra tabular-nums">
          {t.modalidad === 'mensual' ? cop(t.salario_basico) : `${copPreciso(t.tarifa_hora)}/h`}
        </span>
      ),
    },
    {
      clave: 'valor_hora',
      titulo: 'Valor hora',
      alineacion: 'der',
      valor: (t) => valorHora(t, parametros),
      render: (t) => <span className="cifra tabular-nums">{copPreciso(valorHora(t, parametros))}</span>,
    },
    {
      clave: 'costo_hora',
      titulo: 'Hora cargada',
      alineacion: 'der',
      soloAncho: true,
      valor: (t) => costoHoraCargado(t, parametros),
      render: (t) => (
        <span className="cifra tabular-nums text-acento">{copPreciso(costoHoraCargado(t, parametros))}</span>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (t) => (t.activo ? 'activo' : 'inactivo'),
      render: (t) => (t.activo ? <Pildora tono="positivo">Activo</Pildora> : <Pildora>Inactivo</Pildora>),
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (t) => (
        <span className="inline-flex gap-1.5">
          <Boton variante="fantasma" onClick={() => editar(t)}>
            Editar
          </Boton>
          <BotonConfirmar variante="fantasma" onConfirmar={() => eliminar(t)}>
            Borrar
          </BotonConfirmar>
        </span>
      ),
    },
  ]

  const activos = trabajadores.filter((t) => t.activo)
  const cuenta = (c: ClasificacionMO) => activos.filter((t) => t.clasificacion === c).length

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Sin límite: cada uno con su propio salario o tarifa."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nuevo trabajador
              </Boton>
            )
          }
        >
          Trabajadores
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Cifra etiqueta="Activos" valor={activos.length} tamano="sm" />
          <Cifra etiqueta="Directos (MOD)" valor={cuenta('directa')} tono="acento" tamano="sm" />
          <Cifra etiqueta="Indirectos (MOI)" valor={cuenta('indirecta')} tono="aviso" tamano="sm" />
          <Cifra
            etiqueta="Admin. y ventas"
            valor={cuenta('administracion') + cuenta('ventas')}
            tamano="sm"
          />
        </Rejilla>
      </Tarjeta>

      <Aviso tono="acento" titulo="La clasificación decide a dónde va el costo">
        <strong>Directa</strong> es la única que entra a la hoja de costos de una orden.{' '}
        <strong>Indirecta</strong> entra al pozo de CIF y de ahí se reparte. Administración y ventas
        son gasto del período y no son costo del producto. Un mismo costo no puede ir por dos vías:
        si clasificás a alguien como indirecto, el sistema no deja imputar sus horas a una orden.
      </Aviso>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion>{editando ? `Editar a ${borrador.nombre}` : 'Nuevo trabajador'}</TituloSeccion>

          <Rejilla columnas={4}>
            <Campo etiqueta="Código *">
              {(id) => (
                <InputTexto id={id} valor={borrador.codigo} onChange={(v) => set('codigo', v)} placeholder="T-001" />
              )}
            </Campo>
            <Campo etiqueta="Nombre *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Ana Gómez"
                />
              )}
            </Campo>
            <Campo etiqueta="Documento">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.documento ?? ''}
                  onChange={(v) => set('documento', v)}
                  placeholder="1.020.304.050"
                />
              )}
            </Campo>
            <Campo etiqueta="Fecha de ingreso">
              {(id) => (
                <InputTexto
                  id={id}
                  tipo="date"
                  valor={borrador.fecha_ingreso}
                  onChange={(v) => set('fecha_ingreso', v)}
                />
              )}
            </Campo>

            <Campo etiqueta="Cargo">
              {(id) => (
                <InputTexto id={id} valor={borrador.cargo} onChange={(v) => set('cargo', v)} placeholder="Ebanista" />
              )}
            </Campo>
            <Campo etiqueta="Área">
              {(id) => (
                <InputTexto id={id} valor={borrador.area} onChange={(v) => set('area', v)} placeholder="Planta" />
              )}
            </Campo>
            <Campo etiqueta="Tipo de vinculación">
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.tipo_contrato}
                  onChange={(v) => set('tipo_contrato', v)}
                  opciones={CONTRATOS}
                />
              )}
            </Campo>
            <Campo etiqueta="Clasificación *" ayuda="Decide a dónde va su costo.">
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.clasificacion}
                  onChange={(v) => set('clasificacion', v)}
                  opciones={CLASIFICACIONES}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Modalidad de remuneración *"
              ayuda={
                borrador.modalidad === 'mensual'
                  ? 'Las horas ordinarias ya van dentro del salario.'
                  : 'Las horas ordinarias se pagan una por una.'
              }
            >
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.modalidad}
                  onChange={(v) => set('modalidad', v)}
                  opciones={MODALIDADES}
                />
              )}
            </Campo>

            {borrador.modalidad === 'mensual' ? (
              <Campo
                etiqueta="Salario mensual"
                ayuda={`÷ ${parametros.horas_mes} h = ${copPreciso(vhBorrador)} la hora`}
              >
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={borrador.salario_basico}
                    onChange={(n) => set('salario_basico', n)}
                    paso={50_000}
                    sufijo="$"
                  />
                )}
              </Campo>
            ) : (
              <Campo etiqueta="Tarifa por hora">
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={borrador.tarifa_hora}
                    onChange={(n) => set('tarifa_hora', n)}
                    paso={500}
                    sufijo="$/h"
                  />
                )}
              </Campo>
            )}

            <div className="rounded-lg border border-borde bg-panel-alto p-3">
              <Cifra
                etiqueta="Hora cargada"
                valor={copPreciso(vhBorrador * (1 + parametros.factor_prestacional))}
                tamano="sm"
                tono="acento"
                pie={`Valor hora × ${parametros.factor_prestacional + 1} (factor prestacional)`}
              />
            </div>

            <Campo etiqueta="Nota">
              {(id) => <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4">
              <Casilla
                valor={borrador.tiene_auxilio_transporte}
                onChange={(v) => set('tiene_auxilio_transporte', v)}
                etiqueta="Recibe auxilio de transporte"
              />
              <Casilla valor={borrador.activo} onChange={(v) => set('activo', v)} etiqueta="Activo" />
            </div>
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
          filas={trabajadores}
          claveFila={(t) => t.id}
          filtrable
          placeholderFiltro="Buscar por código, nombre, cargo o área…"
          ordenInicial={{ clave: 'codigo', asc: true }}
          vacio="Todavía no hay trabajadores."
        />
      </Tarjeta>
    </div>
  )
}
