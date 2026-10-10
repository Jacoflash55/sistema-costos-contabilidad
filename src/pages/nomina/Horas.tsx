import { useMemo, useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  CeldaEditable,
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
import type { Columna } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cantidad as fmtCantidad, cop } from '../../lib/formato'
import { ETIQUETA_HORA, TIPOS_HORA_REGISTRO } from '../../lib/nomina'
import type {
  ClasificacionMO,
  ID,
  Novedad,
  PeriodoNomina,
  TipoHoraRegistro,
  Trabajador,
} from '../../lib/tipos'

/** Lo corto, para que quepa debajo del nombre. */
const ABREVIATURA_CLASIFICACION: Record<ClasificacionMO, string> = {
  directa: 'MOD',
  indirecta: 'MOI',
  administracion: 'administración',
  ventas: 'ventas',
}

/** Una fila de la vista consolidada: un trabajador con sus horas del período. */
interface FilaHoras {
  trabajador: Trabajador
  horas: Record<TipoHoraRegistro, number>
  total_pagadas: number
}

export function Horas({
  periodo,
  setPeriodoId,
}: {
  periodo: PeriodoNomina | undefined
  setPeriodoId: (id: ID) => void
}) {
  const { nomina, calculado, fijarHoras, borrarHorasDe, crearNovedad, borrarNovedad } = useEstado()

  const [trabajadorNovedad, setTrabajadorNovedad] = useState<ID>('')
  const [conceptoNovedad, setConceptoNovedad] = useState<ID>('')
  const [montoNovedad, setMontoNovedad] = useState(0)
  const [notaNovedad, setNotaNovedad] = useState('')
  const [error, setError] = useState<string | null>(null)

  const periodos = nomina.periodos
  const conceptosManuales = nomina.conceptos.filter((c) => c.activo && !c.automatico)

  /** Las horas del período, indexadas por trabajador y clase. */
  const indice = useMemo(() => {
    const out = new Map<string, number>()
    if (!periodo) return out
    for (const r of nomina.registros_horas) {
      if (r.periodo_id !== periodo.id) continue
      const clave = `${r.trabajador_id}|${r.tipo_hora}`
      out.set(clave, (out.get(clave) ?? 0) + r.horas)
    }
    return out
  }, [nomina.registros_horas, periodo])

  /*
    Quién sale en la tabla: los activos, más cualquier inactivo que ya tenga
    horas en este período (a alguien que se retiró a mitad de mes igual hay
    que pagarle lo que trabajó).
  */
  const filas: FilaHoras[] = useMemo(() => {
    if (!periodo) return []
    const conHoras = new Set(
      nomina.registros_horas.filter((r) => r.periodo_id === periodo.id).map((r) => r.trabajador_id),
    )
    return nomina.trabajadores
      .filter((t) => t.activo || conHoras.has(t.id))
      .map((trabajador) => {
        const horas = {} as Record<TipoHoraRegistro, number>
        let total_pagadas = 0
        for (const tipo of TIPOS_HORA_REGISTRO) {
          const v = indice.get(`${trabajador.id}|${tipo}`) ?? 0
          horas[tipo] = v
          if (tipo !== 'ausencia') total_pagadas += v
        }
        return { trabajador, horas, total_pagadas }
      })
  }, [nomina.trabajadores, nomina.registros_horas, periodo, indice])

  const novedadesDelPeriodo = periodo
    ? nomina.novedades.filter((n) => n.periodo_id === periodo.id)
    : []

  const agregarNovedad = () => {
    if (!periodo) return setError('Elegí un período.')
    if (!trabajadorNovedad) return setError('Elegí a quién se le registra la novedad.')
    if (!conceptoNovedad) return setError('Elegí el concepto.')
    if (montoNovedad <= 0) return setError('El monto tiene que ser mayor que cero.')

    crearNovedad({
      trabajador_id: trabajadorNovedad,
      periodo_id: periodo.id,
      concepto_id: conceptoNovedad,
      monto: montoNovedad,
      nota: notaNovedad.trim() || undefined,
    })
    setMontoNovedad(0)
    setNotaNovedad('')
    setError(null)
  }

  const columnas: Columna<FilaHoras>[] = [
    {
      clave: 'trabajador',
      titulo: 'Trabajador',
      valor: (f) => f.trabajador.nombre,
      render: (f) => (
        <div>
          <p className="font-medium">{f.trabajador.nombre}</p>
          <p className="text-xs text-tenue">
            {f.trabajador.codigo} ·{' '}
            {f.trabajador.modalidad === 'mensual' ? 'mensual' : 'por hora'} ·{' '}
            {ABREVIATURA_CLASIFICACION[f.trabajador.clasificacion]}
          </p>
        </div>
      ),
    },
    ...TIPOS_HORA_REGISTRO.map(
      (tipo): Columna<FilaHoras> => ({
        clave: tipo,
        titulo: ETIQUETA_HORA[tipo],
        alineacion: 'der',
        valor: (f) => f.horas[tipo],
        render: (f) => (
          <CeldaEditable
            valor={f.horas[tipo]}
            paso={1}
            formato={(n) => (n === 0 ? '—' : fmtCantidad(n))}
            onChange={(n) => periodo && fijarHoras(f.trabajador.id, periodo.id, tipo, n)}
          />
        ),
      }),
    ),
    {
      clave: 'total',
      titulo: 'Horas pagadas',
      alineacion: 'der',
      valor: (f) => f.total_pagadas,
      render: (f) => <span className="cifra tabular-nums font-medium">{fmtCantidad(f.total_pagadas)}</span>,
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (f) =>
        f.total_pagadas + f.horas.ausencia > 0 ? (
          <BotonConfirmar
            variante="fantasma"
            onConfirmar={() => periodo && borrarHorasDe(f.trabajador.id, periodo.id)}
            titulo="Borrar todas sus horas del período"
          >
            ✕
          </BotonConfirmar>
        ) : null,
    },
  ]

  const columnasNovedades: Columna<Novedad>[] = [
    {
      clave: 'trabajador',
      titulo: 'Trabajador',
      valor: (n) => nomina.trabajadores.find((t) => t.id === n.trabajador_id)?.nombre ?? '',
      render: (n) => nomina.trabajadores.find((t) => t.id === n.trabajador_id)?.nombre ?? '—',
    },
    {
      clave: 'concepto',
      titulo: 'Concepto',
      valor: (n) => nomina.conceptos.find((c) => c.id === n.concepto_id)?.nombre ?? '',
      render: (n) => {
        const c = nomina.conceptos.find((x) => x.id === n.concepto_id)
        if (!c) return <span className="text-tenue">concepto borrado</span>
        return (
          <span className="inline-flex items-center gap-2">
            {c.nombre}
            <Pildora tono={c.tipo === 'deduccion' ? 'negativo' : 'positivo'}>
              {c.tipo === 'deduccion' ? 'Deducción' : 'Devengado'}
            </Pildora>
          </span>
        )
      },
    },
    {
      clave: 'nota',
      titulo: 'Nota',
      soloAncho: true,
      valor: (n) => n.nota ?? '',
      render: (n) => <span className="text-xs text-suave">{n.nota || '—'}</span>,
    },
    {
      clave: 'monto',
      titulo: 'Monto',
      alineacion: 'der',
      valor: (n) => n.monto ?? 0,
      render: (n) => <span className="cifra tabular-nums">{cop(n.monto ?? 0)}</span>,
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (n) => (
        <BotonConfirmar variante="fantasma" onConfirmar={() => borrarNovedad(n.id)}>
          ✕
        </BotonConfirmar>
      ),
    },
  ]

  if (periodos.length === 0) {
    return (
      <Aviso tono="aviso" titulo="Primero hace falta un período">
        Las horas se registran por período de nómina. Creá uno en la pestaña «Períodos».
      </Aviso>
    )
  }

  const totales = TIPOS_HORA_REGISTRO.map((tipo) => filas.reduce((s, f) => s + f.horas[tipo], 0))

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Vista consolidada del período. Clic en cualquier celda para escribir las horas."
          acciones={
            periodo && (
              <Pildora tono={periodo.estado === 'abierto' ? 'positivo' : 'neutro'}>
                {periodo.estado === 'abierto' ? 'Abierto' : 'Cerrado'}
              </Pildora>
            )
          }
        >
          Horas y novedades
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Campo etiqueta="Período">
            {(id) => (
              <Selector
                id={id}
                valor={periodo?.id ?? ''}
                onChange={setPeriodoId}
                opciones={periodos.map((p) => ({ valor: p.id, texto: p.nombre }))}
              />
            )}
          </Campo>
          <Cifra
            etiqueta="Horas pagadas"
            valor={fmtCantidad(filas.reduce((s, f) => s + f.total_pagadas, 0))}
            tamano="sm"
          />
          <Cifra
            etiqueta="Horas de ausencia"
            valor={fmtCantidad(filas.reduce((s, f) => s + f.horas.ausencia, 0))}
            tamano="sm"
          />
          <Cifra etiqueta="Novedades" valor={novedadesDelPeriodo.length} tamano="sm" />
        </Rejilla>
      </Tarjeta>

      <Aviso tono="acento" titulo="Cómo se cuentan las horas">
        Las <strong>ausencias</strong> son horas que no se trabajaron: a un trabajador mensual le
        descuentan salario, a uno por hora no le descuentan nada (esa hora simplemente no se
        registró). El <strong>recargo nocturno</strong> y el <strong>dominical</strong> son solo el
        adicional sobre la hora ordinaria, así que en un trabajador por hora esas horas también van
        anotadas como ordinarias para que la hora misma se pague.
      </Aviso>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.trabajador.id}
          filtrable
          placeholderFiltro="Buscar trabajador…"
          vacio="No hay trabajadores activos. Agregalos en la pestaña «Trabajadores»."
          pie={
            filas.length > 0 ? (
              <tr>
                <td className="px-2.5 py-2 text-xs uppercase tracking-wider text-tenue">Total</td>
                {totales.map((t, i) => (
                  <td key={i} className="cifra px-2.5 py-2 text-right tabular-nums">
                    {t === 0 ? '—' : fmtCantidad(t)}
                  </td>
                ))}
                <td className="cifra px-2.5 py-2 text-right tabular-nums">
                  {fmtCantidad(filas.reduce((s, f) => s + f.total_pagadas, 0))}
                </td>
                <td />
              </tr>
            ) : undefined
          }
        />
      </Tarjeta>

      {/* ---------- novedades ---------- */}
      <Tarjeta>
        <TituloSeccion
          nota="Bonificaciones y deducciones del período. Los conceptos salen del catálogo y son configurables."
        >
          Novedades
        </TituloSeccion>

        {conceptosManuales.length === 0 ? (
          <Aviso tono="aviso">
            No hay conceptos manuales activos en el catálogo. Agregalos en la pestaña «Conceptos».
          </Aviso>
        ) : (
          <Rejilla columnas={4}>
            <Campo etiqueta="Trabajador">
              {(id) => (
                <Selector
                  id={id}
                  valor={trabajadorNovedad}
                  onChange={setTrabajadorNovedad}
                  opciones={filas.map((f) => ({ valor: f.trabajador.id, texto: f.trabajador.nombre }))}
                  vacio="Elegí…"
                />
              )}
            </Campo>
            <Campo etiqueta="Concepto">
              {(id) => (
                <Selector
                  id={id}
                  valor={conceptoNovedad}
                  onChange={setConceptoNovedad}
                  opciones={conceptosManuales.map((c) => ({
                    valor: c.id,
                    texto: `${c.nombre} (${c.tipo === 'deduccion' ? 'deducción' : 'devengado'})`,
                  }))}
                  vacio="Elegí…"
                />
              )}
            </Campo>
            <Campo etiqueta="Monto">
              {(id) => (
                <InputCifra id={id} valor={montoNovedad} onChange={setMontoNovedad} paso={10_000} sufijo="$" />
              )}
            </Campo>
            <Campo etiqueta="Nota">
              {(id) => (
                <InputTexto id={id} valor={notaNovedad} onChange={setNotaNovedad} placeholder="Cuota 3 de 12" />
              )}
            </Campo>
            <div className="flex items-end">
              <Boton variante="primario" onClick={agregarNovedad} className="w-full">
                Agregar novedad
              </Boton>
            </div>
          </Rejilla>
        )}

        <div className="mt-4">
          <Tabla
            columnas={columnasNovedades}
            filas={novedadesDelPeriodo}
            claveFila={(n) => n.id}
            vacio="Sin novedades en este período."
          />
        </div>
      </Tarjeta>

      {calculado.conteos.periodosNomina > 0 && periodo && (
        <p className="text-xs text-tenue">
          Editar una celda <strong>reemplaza</strong> el total de esa clase de hora en el período: no
          suma. Si un respaldo trajo varias filas del mismo tipo, al escribir en la celda se
          consolidan en una.
        </p>
      )}
    </div>
  )
}
