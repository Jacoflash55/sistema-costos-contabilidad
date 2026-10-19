import { useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  Cifra,
  InputCifra,
  InputTexto,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Columna } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cantidad as fmtCantidad, cop, copPreciso } from '../../lib/formato'
import {
  ETIQUETA_HORA,
  TIPOS_HORA,
  factorPrestacionalDe,
  recargoDe,
  usaFactorEnMOD,
  valorHora,
} from '../../lib/nomina'
import type { ID, LineaMODOrden, OrdenProduccion, TipoHora } from '../../lib/tipos'

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Imputar horas de un trabajador a una orden de produccion.
 *
 * SOLO MANO DE OBRA DIRECTA. El selector ofrece unicamente trabajadores con
 * clasificacion 'directa': el costo de un indirecto llega al producto por la
 * tasa de CIF, y si entrara tambien por aqui el mismo peso se contaria dos
 * veces. Si alguien reclasifica a un trabajador despues de imputarle horas, el
 * motor deja esas lineas por fuera y las reporta como aviso.
 */
export function PanelManoObra({
  orden,
  cerrar,
}: {
  orden: OrdenProduccion
  cerrar: () => void
}) {
  const { nomina, config, calculado, crearAsignacionMO, borrarAsignacionMO } = useEstado()

  const directos = nomina.trabajadores.filter((t) => t.activo && t.clasificacion === 'directa')
  const periodos = nomina.periodos

  const [trabajadorId, setTrabajadorId] = useState<ID>('')
  const [periodoId, setPeriodoId] = useState<ID>('')
  const [tipoHora, setTipoHora] = useState<TipoHora>('ordinaria')
  const [horas, setHoras] = useState(0)
  const [fecha, setFecha] = useState(hoyISO())
  const [error, setError] = useState<string | null>(null)

  const trabajador = directos.find((t) => t.id === trabajadorId)
  const parametros = config.parametros
  const conFactor = usaFactorEnMOD(parametros)

  const mo = calculado.manoObraPorOrden[orden.id]
  const avisos = calculado.alertasNomina.filter((a) => a.orden_id === orden.id)

  /** Lo que va a costar esta imputación, antes de guardarla. */
  const vh = trabajador ? valorHora(trabajador, parametros) : 0
  const recargo = recargoDe(tipoHora, parametros)
  const previoSalario = horas * vh * recargo
  const factorTrabajador = trabajador ? factorPrestacionalDe(trabajador, parametros) : 0
  const previoEmpresa = previoSalario * (1 + factorTrabajador)

  const guardar = () => {
    if (!trabajador) return setError('Elegí un trabajador directo.')
    if (horas <= 0) return setError('Las horas tienen que ser mayores que cero.')

    crearAsignacionMO({
      orden_id: orden.id,
      trabajador_id: trabajador.id,
      periodo_id: periodoId || undefined,
      fecha,
      tipo_hora: tipoHora,
      horas,
      tarifa_hora: null,
    })
    setHoras(0)
    setError(null)
  }

  const columnas: Columna<LineaMODOrden>[] = [
    {
      clave: 'trabajador',
      titulo: 'Trabajador',
      valor: (l) => l.nombre,
      render: (l) => (
        <div>
          <p className="font-medium">{l.nombre}</p>
          <p className="text-xs text-tenue">{l.codigo}</p>
        </div>
      ),
    },
    {
      clave: 'tipo',
      titulo: 'Clase de hora',
      valor: (l) => l.tipo_hora,
      render: (l) => (
        <span className="text-xs text-suave">
          {ETIQUETA_HORA[l.tipo_hora]}
          {l.recargo !== 1 && (
            <span className="ml-1 text-tenue">×{l.recargo.toLocaleString('es-CO')}</span>
          )}
        </span>
      ),
    },
    {
      clave: 'horas',
      titulo: 'Horas',
      alineacion: 'der',
      valor: (l) => l.horas,
      render: (l) => <span className="cifra tabular-nums">{fmtCantidad(l.horas)}</span>,
    },
    {
      clave: 'vh',
      titulo: 'Valor hora',
      alineacion: 'der',
      valor: (l) => l.valor_hora,
      render: (l) => <span className="cifra tabular-nums">{copPreciso(l.valor_hora)}</span>,
    },
    {
      clave: 'salario',
      titulo: 'Costo salario',
      alineacion: 'der',
      soloAncho: true,
      valor: (l) => l.costo_salario,
      render: (l) => <span className="cifra tabular-nums text-tenue">{cop(l.costo_salario)}</span>,
    },
    {
      clave: 'total',
      titulo: conFactor ? 'Costo empresa' : 'Costo a la hoja',
      alineacion: 'der',
      valor: (l) => l.total,
      render: (l) => <span className="cifra tabular-nums font-medium text-acento">{cop(l.total)}</span>,
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (l) => (
        <BotonConfirmar variante="fantasma" onConfirmar={() => borrarAsignacionMO(l.asignacion_id)}>
          ✕
        </BotonConfirmar>
      ),
    },
  ]

  const base = orden.cantidad_terminada ?? orden.cantidad_programada

  return (
    <Tarjeta className="border-acento/40">
      <TituloSeccion
        nota={
          conFactor
            ? 'La hoja de costos se lleva el COSTO-EMPRESA de la hora, o sea con el factor prestacional aplicado.'
            : 'La hoja de costos se lleva solo el SALARIO de la hora: el factor prestacional está apagado en Configuración.'
        }
        acciones={
          <Boton variante="fantasma" onClick={cerrar}>
            Cerrar
          </Boton>
        }
      >
        Mano de obra directa de la orden {orden.numero}
      </TituloSeccion>

      <Rejilla columnas={4}>
        <Cifra etiqueta="Horas imputadas" valor={fmtCantidad(mo?.horas ?? 0)} tamano="sm" />
        <Cifra
          etiqueta="Costo salario"
          valor={cop(mo?.total_salario ?? 0)}
          tamano="sm"
          pie="Sin prestaciones"
        />
        <Cifra
          etiqueta="Costo empresa"
          valor={cop(mo?.total_con_factor ?? 0)}
          tamano="sm"
          pie={mo && mo.total_salario > 0 ? `× ${(mo.total_con_factor / mo.total_salario).toLocaleString('es-CO', { maximumFractionDigits: 4 })}` : 'Con prestaciones'}
        />
        <Cifra
          etiqueta="A la hoja de costos"
          valor={cop(mo?.total ?? 0)}
          tono="acento"
          tamano="sm"
          pie={base > 0 ? `${copPreciso((mo?.total ?? 0) / base)} por unidad` : undefined}
        />
      </Rejilla>

      {directos.length === 0 ? (
        <div className="mt-4">
          <Aviso tono="aviso" titulo="No hay trabajadores directos">
            Para imputar horas a una orden hace falta al menos un trabajador activo clasificado como
            mano de obra DIRECTA. Crealo o reclasificalo en Nómina.
          </Aviso>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-borde bg-panel-alto p-3">
          <Rejilla columnas={4}>
            <Campo etiqueta="Trabajador" ayuda="Solo los clasificados como MOD.">
              {(id) => (
                <Selector
                  id={id}
                  valor={trabajadorId}
                  onChange={(v) => {
                    setTrabajadorId(v)
                    setError(null)
                  }}
                  opciones={directos.map((t) => ({ valor: t.id, texto: `${t.codigo} · ${t.nombre}` }))}
                  vacio="Elegí…"
                />
              )}
            </Campo>
            <Campo etiqueta="Clase de hora">
              {(id) => (
                <Selector<TipoHora>
                  id={id}
                  valor={tipoHora}
                  onChange={setTipoHora}
                  opciones={TIPOS_HORA.map((t) => ({ valor: t, texto: ETIQUETA_HORA[t] }))}
                />
              )}
            </Campo>
            <Campo
              etiqueta="Horas"
              ayuda={
                trabajador
                  ? `${copPreciso(vh)}/h × ${recargo.toLocaleString('es-CO')} = ${cop(conFactor ? previoEmpresa : previoSalario)}`
                  : undefined
              }
            >
              {(id) => <InputCifra id={id} valor={horas} onChange={setHoras} paso={0.5} />}
            </Campo>
            <Campo etiqueta="Fecha">
              {(id) => <InputTexto id={id} tipo="date" valor={fecha} onChange={setFecha} />}
            </Campo>

            <Campo
              etiqueta="Período de nómina"
              ayuda={
                periodos.length === 0
                  ? 'Todavía no hay períodos de nómina.'
                  : 'Opcional, pero sirve para cuadrar horas pagadas contra imputadas.'
              }
            >
              {(id) => (
                <Selector
                  id={id}
                  valor={periodoId}
                  onChange={setPeriodoId}
                  opciones={periodos.map((p) => ({ valor: p.id, texto: p.nombre }))}
                  vacio="Sin período"
                />
              )}
            </Campo>
            <div className="flex items-end">
              <Boton variante="primario" onClick={guardar} className="w-full">
                Imputar horas
              </Boton>
            </div>
          </Rejilla>

          {error && (
            <div className="mt-3">
              <Aviso tono="negativo">{error}</Aviso>
            </div>
          )}
        </div>
      )}

      {avisos.length > 0 && (
        <div className="mt-4">
          <Aviso tono="negativo" titulo="Horas que NO se costearon">
            <ul className="list-disc space-y-0.5 pl-4">
              {avisos.map((a, i) => (
                <li key={`${a.clase}-${i}`}>{a.mensaje}</li>
              ))}
            </ul>
          </Aviso>
        </div>
      )}

      <div className="mt-4">
        <Tabla
          columnas={columnas}
          filas={mo?.lineas ?? []}
          claveFila={(l) => l.asignacion_id}
          vacio="Esta orden todavía no tiene horas imputadas."
          pie={
            mo && mo.lineas.length > 0 ? (
              <tr>
                <td className="px-2.5 py-2 text-xs uppercase tracking-wider text-tenue" colSpan={2}>
                  Mano de obra directa
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums">{fmtCantidad(mo.horas)}</td>
                <td />
                <td className="cifra hidden px-2.5 py-2 text-right tabular-nums text-tenue md:table-cell">
                  {cop(mo.total_salario)}
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums text-acento">{cop(mo.total)}</td>
                <td />
              </tr>
            ) : undefined
          }
        />
      </div>
    </Tarjeta>
  )
}
