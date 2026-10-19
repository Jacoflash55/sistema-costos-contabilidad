import { useState } from 'react'

import {
  Aviso,
  Boton,
  Campo,
  Cifra,
  Pildora,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Columna, Tono } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cantidad as fmtCantidad, cop, copPreciso, pct } from '../../lib/formato'
import { ETIQUETA_GRUPO, ETIQUETA_HORA, factorGlobal } from '../../lib/nomina'
import type { ClasificacionMO, ID, Liquidacion as Liq, PeriodoNomina } from '../../lib/tipos'

const TONO_CLASIFICACION: Record<ClasificacionMO, Tono> = {
  directa: 'acento',
  indirecta: 'aviso',
  administracion: 'neutro',
  ventas: 'neutro',
}

export function Liquidacion({
  periodo,
  setPeriodoId,
}: {
  periodo: PeriodoNomina | undefined
  setPeriodoId: (id: ID) => void
}) {
  const { nomina, config, calculado } = useEstado()
  const [abierta, setAbierta] = useState<ID | null>(null)

  const periodos = nomina.periodos
  const nombreDe = (id: ID) => nomina.trabajadores.find((t) => t.id === id)?.nombre ?? '—'

  if (periodos.length === 0) {
    return (
      <Aviso tono="aviso" titulo="Primero hace falta un período">
        La liquidación se hace por período. Creá uno en la pestaña «Períodos».
      </Aviso>
    )
  }

  const liquidaciones = periodo ? (calculado.liquidacionesPorPeriodo[periodo.id] ?? []) : []
  const resumen = periodo ? calculado.resumenesNomina[periodo.id] : undefined
  const moIndirecta = periodo ? (calculado.moIndirectaPorPeriodo[periodo.id] ?? 0) : 0
  const gastos = periodo ? calculado.gastosNominaPorPeriodo[periodo.id] : undefined
  const cuadre = periodo ? calculado.cuadreMO.filter((c) => c.periodo_id === periodo.id) : []

  const columnas: Columna<Liq>[] = [
    {
      clave: 'trabajador',
      titulo: 'Trabajador',
      valor: (l) => nombreDe(l.trabajador_id),
      render: (l) => (
        <div>
          <p className="font-medium">{nombreDe(l.trabajador_id)}</p>
          <p className="text-xs text-tenue">
            {l.modalidad === 'mensual' ? 'Mensual' : 'Por hora'} · {copPreciso(l.valor_hora)}/h
          </p>
        </div>
      ),
    },
    {
      clave: 'clasificacion',
      titulo: 'Clas.',
      valor: (l) => l.clasificacion,
      render: (l) => (
        <Pildora tono={TONO_CLASIFICACION[l.clasificacion]}>
          {l.clasificacion === 'directa' ? 'MOD' : l.clasificacion === 'indirecta' ? 'MOI' : 'Gasto'}
        </Pildora>
      ),
    },
    {
      clave: 'horas',
      titulo: 'Horas',
      alineacion: 'der',
      soloAncho: true,
      valor: (l) => l.horas_pagadas,
      render: (l) => <span className="cifra tabular-nums">{fmtCantidad(l.horas_pagadas)}</span>,
    },
    {
      clave: 'base',
      titulo: 'Salario del período',
      alineacion: 'der',
      valor: (l) => l.salario_base_periodo,
      render: (l) => <span className="cifra tabular-nums">{cop(l.salario_base_periodo)}</span>,
    },
    {
      clave: 'extras',
      titulo: 'Extras y recargos',
      alineacion: 'der',
      valor: (l) => l.extras_y_recargos,
      render: (l) => (
        <span className="cifra tabular-nums">
          {l.extras_y_recargos === 0 ? '—' : cop(l.extras_y_recargos)}
        </span>
      ),
    },
    {
      clave: 'bonif',
      titulo: 'Otros devengados',
      alineacion: 'der',
      soloAncho: true,
      valor: (l) => l.bonificaciones,
      render: (l) => (
        <span className="cifra tabular-nums">{l.bonificaciones === 0 ? '—' : cop(l.bonificaciones)}</span>
      ),
    },
    {
      clave: 'devengado',
      titulo: 'Total devengado',
      alineacion: 'der',
      valor: (l) => l.total_devengado,
      render: (l) => <span className="cifra tabular-nums font-medium">{cop(l.total_devengado)}</span>,
    },
    {
      clave: 'deducciones',
      titulo: 'Deducciones',
      alineacion: 'der',
      valor: (l) => l.total_deducciones,
      render: (l) => (
        <span className="cifra tabular-nums text-negativo">
          {l.total_deducciones === 0 ? '—' : `−${cop(l.total_deducciones).slice(1)}`}
        </span>
      ),
    },
    {
      clave: 'neto',
      titulo: 'Neto a pagar',
      alineacion: 'der',
      valor: (l) => l.neto_pagar,
      render: (l) => (
        <span className="cifra tabular-nums font-semibold text-positivo">{cop(l.neto_pagar)}</span>
      ),
    },
    {
      clave: 'costo',
      titulo: 'Costo empresa',
      alineacion: 'der',
      valor: (l) => l.costo_empresa,
      render: (l) => (
        <span className="cifra tabular-nums font-semibold text-acento">{cop(l.costo_empresa)}</span>
      ),
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (l) => (
        <Boton
          variante="fantasma"
          onClick={() => setAbierta(abierta === l.trabajador_id ? null : l.trabajador_id)}
        >
          {abierta === l.trabajador_id ? 'Cerrar' : 'Detalle'}
        </Boton>
      ),
    },
  ]

  const detalle = liquidaciones.find((l) => l.trabajador_id === abierta)
  /** El factor que se muestra arriba es el de referencia: cada persona tiene el suyo. */
  const factorRef = factorGlobal(config.parametros)

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion nota="Se recalcula sola cada vez que cambian las horas, las novedades o los parámetros.">
          Liquidación del período
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
          <Cifra etiqueta="Total devengado" valor={cop(resumen?.total_devengado ?? 0)} tamano="sm" />
          <Cifra
            etiqueta="Neto a pagar"
            valor={cop(resumen?.total_neto ?? 0)}
            tono="positivo"
            tamano="sm"
            pie="Lo que reciben los trabajadores"
          />
          <Cifra
            etiqueta="Costo para la empresa"
            valor={cop(resumen?.total_costo_empresa ?? 0)}
            tono="acento"
            tamano="sm"
            pie={`Devengado + aportes · factor de referencia ${pct(factorRef * 100, 2)}`}
          />
        </Rejilla>
      </Tarjeta>

      <Aviso tono="acento" titulo="Las dos cifras no son la misma, y ninguna sustituye a la otra">
        El <strong>neto a pagar</strong> es lo que recibe la persona: devengado menos deducciones, así
        que es <em>menor</em> que el devengado. El <strong>costo para la empresa</strong> es devengado
        más los aportes del empleador sobre el IBC, así que es <em>mayor</em>. El que entra a la hoja de
        costos de una orden es el costo-empresa, nunca el neto.
      </Aviso>

      {/* ---------- a dónde va el costo ---------- */}
      {resumen && (
        <Tarjeta>
          <TituloSeccion nota="El reparto que evita el doble conteo: cada peso sale por una sola vía.">
            A dónde va este costo
          </TituloSeccion>
          <Rejilla columnas={4}>
            <Cifra
              etiqueta="MOD (nómina de los directos)"
              valor={cop(resumen.por_clasificacion.directa)}
              tono="acento"
              tamano="sm"
              pie="Se reparte entre órdenes y tiempo ocioso"
            />
            <Cifra
              etiqueta="MOI → CIF"
              valor={cop(moIndirecta)}
              tono="aviso"
              tamano="sm"
              pie="Insumo del módulo de CIF"
            />
            <Cifra
              etiqueta="Administración"
              valor={cop(gastos?.administracion ?? 0)}
              tamano="sm"
              pie="Gasto del período"
            />
            <Cifra
              etiqueta="Ventas"
              valor={cop(gastos?.ventas ?? 0)}
              tamano="sm"
              pie="Gasto del período"
            />
          </Rejilla>

          <p className="mt-3 text-xs text-tenue">
            La mano de obra indirecta <strong>no</strong> se imputa a órdenes: llega al producto por la
            tasa de CIF. Si se hicieran las dos cosas, el mismo costo entraría dos veces al producto.
          </p>
          <p className="mt-2 text-xs text-tenue">
            Ojo con la primera cifra: es la <strong>nómina completa</strong> de los directos del
            período, no lo que ya llegó a las órdenes. Lo que de verdad se cargó a cada orden se ve en
            la página de Órdenes, y lo que sobra es el tiempo ocioso de la tabla de abajo. Las dos
            cifras no tienen por qué coincidir al peso: la hora se imputa a su valor hora, mientras la
            nómina incluye además auxilios y el efecto de los recargos.
          </p>
        </Tarjeta>
      )}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={liquidaciones}
          claveFila={(l) => l.trabajador_id}
          filtrable
          placeholderFiltro="Buscar trabajador…"
          vacio="Nadie liquidado en este período. Registrá horas en la pestaña anterior."
          resaltarFila={(l) => (l.alertas.length > 0 ? 'aviso' : null)}
          pie={
            resumen && liquidaciones.length > 0 ? (
              <tr>
                <td className="px-2.5 py-2 text-xs uppercase tracking-wider text-tenue" colSpan={6}>
                  Totales del período
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums">{cop(resumen.total_devengado)}</td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums text-negativo">
                  {resumen.total_deducciones === 0 ? '—' : `−${cop(resumen.total_deducciones).slice(1)}`}
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums text-positivo">
                  {cop(resumen.total_neto)}
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums text-acento">
                  {cop(resumen.total_costo_empresa)}
                </td>
                <td />
              </tr>
            ) : undefined
          }
        />
      </Tarjeta>

      {/* ---------- detalle de una persona ---------- */}
      {detalle && (
        <Tarjeta className="border-acento/40">
          <TituloSeccion
            nota={`${detalle.modalidad === 'mensual' ? 'Mensual' : 'Por hora'} · valor hora ${copPreciso(detalle.valor_hora)} · hora cargada ${copPreciso(detalle.costo_hora_cargado)}`}
            acciones={
              <Boton variante="fantasma" onClick={() => setAbierta(null)}>
                Cerrar
              </Boton>
            }
          >
            Detalle de {nombreDe(detalle.trabajador_id)}
          </TituloSeccion>

          {detalle.alertas.length > 0 && (
            <div className="mb-4">
              <Aviso tono="aviso">
                <ul className="list-disc space-y-0.5 pl-4">
                  {detalle.alertas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Aviso>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* horas */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-tenue">Horas</p>

              {detalle.modalidad === 'mensual' && (
                <div className="mb-3 rounded-lg border border-borde bg-panel-alto p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-suave">Horas esperadas en el período</span>
                    <span className="cifra tabular-nums">
                      {fmtCantidad(detalle.horas_esperadas, 0)} h
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-suave">Horas trabajadas</span>
                    <span className="cifra tabular-nums">
                      {fmtCantidad(detalle.horas_por_tipo.ordinaria, 0)} h
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-suave">Horas descontadas</span>
                    <span
                      className={`cifra tabular-nums ${detalle.horas_descontadas > 0 ? 'text-aviso' : ''}`}
                    >
                      {fmtCantidad(detalle.horas_descontadas, 0)} h
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3 border-t border-borde pt-1 font-semibold">
                    <span>Descuento del salario</span>
                    <span
                      className={`cifra tabular-nums ${detalle.descuento_por_horas > 0 ? 'text-negativo' : ''}`}
                    >
                      {detalle.descuento_por_horas > 0
                        ? `−${cop(detalle.descuento_por_horas).slice(1)}`
                        : cop(0)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-tenue">
                    {detalle.descuento_por_horas > 0
                      ? 'El salario mensual bajó en proporción a las horas que no se trabajaron.'
                      : 'Sin descuentos: el salario del mes entra completo.'}
                  </p>
                </div>
              )}

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-borde text-xs uppercase tracking-wider text-tenue">
                    <th className="py-1.5 text-left">Clase</th>
                    <th className="py-1.5 text-right">Horas</th>
                    <th className="py-1.5 text-right">Recargo</th>
                    <th className="py-1.5 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.lineas_horas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-tenue">
                        Sin horas registradas.
                      </td>
                    </tr>
                  )}
                  {detalle.lineas_horas.map((h) => (
                    <tr key={h.tipo_hora} className="border-b border-borde/60">
                      <td className="py-1.5">
                        {ETIQUETA_HORA[h.tipo_hora]}
                        {!h.se_paga && (
                          <span className="ml-2 text-xs text-tenue">
                            {h.tipo_hora === 'ausencia' ? '(descuenta)' : '(ya va en el salario)'}
                          </span>
                        )}
                      </td>
                      <td className="cifra py-1.5 text-right tabular-nums">{fmtCantidad(h.horas)}</td>
                      <td className="cifra py-1.5 text-right tabular-nums text-tenue">
                        ×{h.recargo.toLocaleString('es-CO')}
                      </td>
                      <td className="cifra py-1.5 text-right tabular-nums">
                        {h.monto === 0 ? '—' : cop(h.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* conceptos */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-tenue">Conceptos</p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-borde text-xs uppercase tracking-wider text-tenue">
                    <th className="py-1.5 text-left">Concepto</th>
                    <th className="py-1.5 text-right">Base</th>
                    <th className="py-1.5 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.lineas.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-tenue">
                        Sin conceptos aplicados.
                      </td>
                    </tr>
                  )}
                  {detalle.lineas.map((l, i) => (
                    <tr key={`${l.concepto_id}-${i}`} className="border-b border-borde/60">
                      <td className="py-1.5">
                        {l.nombre}
                        <span className={`ml-2 text-xs ${l.tipo === 'deduccion' ? 'text-negativo' : 'text-positivo'}`}>
                          {l.tipo === 'deduccion' ? 'deducción' : 'devengado'}
                        </span>
                      </td>
                      <td className="cifra py-1.5 text-right tabular-nums text-tenue">
                        {l.base === 0 ? '—' : cop(l.base)}
                      </td>
                      <td
                        className={`cifra py-1.5 text-right tabular-nums ${l.tipo === 'deduccion' ? 'text-negativo' : ''}`}
                      >
                        {l.tipo === 'deduccion' ? `−${cop(l.monto).slice(1)}` : cop(l.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 space-y-1.5 border-t border-borde pt-3 text-sm">
                <Fila etiqueta="Salario del período" valor={cop(detalle.salario_base_periodo)} />
                <Fila etiqueta="Extras y recargos" valor={cop(detalle.extras_y_recargos)} />
                <Fila etiqueta="Otros devengados" valor={cop(detalle.bonificaciones)} />
                <Fila etiqueta="Total devengado" valor={cop(detalle.total_devengado)} fuerte />
                <Fila
                  etiqueta="Deducciones"
                  valor={`−${cop(detalle.total_deducciones).slice(1)}`}
                  clase="text-negativo"
                />
                <Fila etiqueta="Neto a pagar" valor={cop(detalle.neto_pagar)} fuerte clase="text-positivo" />
                <div className="pt-2">
                  <Fila
                    etiqueta={`Carga prestacional (${pct(detalle.factor_prestacional * 100, 3)})`}
                    valor={cop(detalle.carga_prestacional)}
                    clase="text-tenue"
                  />
                  <Fila
                    etiqueta="Costo para la empresa"
                    valor={cop(detalle.costo_empresa)}
                    fuerte
                    clase="text-acento"
                  />
                  <p className="mt-1 text-xs text-tenue">
                    = devengado + los aportes de abajo. El IBC fue{' '}
                    {cop(detalle.base_prestacional)}.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- aportes del empleador ---------- */}
          <div className="mt-5 border-t border-borde pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-tenue">
              Aportes del empleador · IBC {cop(detalle.base_prestacional)}
            </p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-borde text-xs uppercase tracking-wider text-tenue">
                  <th className="py-1.5 text-left">Concepto</th>
                  <th className="py-1.5 text-left">Grupo</th>
                  <th className="py-1.5 text-right">%</th>
                  <th className="py-1.5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {detalle.aportes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-tenue">
                      Sin aportes configurados.
                    </td>
                  </tr>
                )}
                {detalle.aportes.map((a) => (
                  <tr key={a.id} className="border-b border-borde/60">
                    <td className="py-1.5">
                      {a.nombre}
                      {a.origen === 'trabajador' && (
                        <span className="ml-2 text-xs text-aviso">propio</span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs text-suave">{ETIQUETA_GRUPO[a.grupo]}</td>
                    <td className="cifra py-1.5 text-right tabular-nums">{pct(a.pct, 3)}</td>
                    <td className="cifra py-1.5 text-right tabular-nums">{cop(a.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde-fuerte font-semibold">
                  <td className="py-1.5 text-xs uppercase tracking-wider" colSpan={2}>
                    Total de aportes
                  </td>
                  <td className="cifra py-1.5 text-right tabular-nums">
                    {pct(detalle.factor_prestacional * 100, 3)}
                  </td>
                  <td className="cifra py-1.5 text-right tabular-nums">
                    {cop(detalle.carga_prestacional)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Tarjeta>
      )}

      {/* ---------- horas pagadas vs. imputadas ---------- */}
      {cuadre.length > 0 && (
        <Tarjeta>
          <TituloSeccion nota="Solo los directos. Lo que se pagó y no se cargó a ninguna orden es tiempo ocioso.">
            Horas pagadas vs. horas imputadas
          </TituloSeccion>
          <Tabla
            columnas={[
              { clave: 'nombre', titulo: 'Trabajador', valor: (c) => c.nombre, render: (c) => c.nombre },
              {
                clave: 'pagadas',
                titulo: 'Pagadas',
                alineacion: 'der',
                valor: (c) => c.horas_pagadas,
                render: (c) => <span className="cifra tabular-nums">{fmtCantidad(c.horas_pagadas)}</span>,
              },
              {
                clave: 'imputadas',
                titulo: 'Imputadas a órdenes',
                alineacion: 'der',
                valor: (c) => c.horas_imputadas,
                render: (c) => <span className="cifra tabular-nums">{fmtCantidad(c.horas_imputadas)}</span>,
              },
              {
                clave: 'diferencia',
                titulo: 'Diferencia',
                alineacion: 'der',
                valor: (c) => c.diferencia,
                render: (c) => (
                  <span
                    className={`cifra tabular-nums ${c.diferencia < 0 ? 'text-negativo' : c.diferencia > 0 ? 'text-aviso' : ''}`}
                  >
                    {fmtCantidad(c.diferencia)}
                  </span>
                ),
              },
              {
                clave: 'ocioso',
                titulo: 'Costo del tiempo ocioso',
                alineacion: 'der',
                valor: (c) => c.costo_ocioso,
                render: (c) => (
                  <span className="cifra tabular-nums">
                    {c.costo_ocioso === 0 ? '—' : cop(c.costo_ocioso)}
                  </span>
                ),
              },
            ]}
            filas={cuadre}
            claveFila={(c) => c.trabajador_id}
            resaltarFila={(c) => (c.diferencia < 0 ? 'negativo' : null)}
            vacio="Sin trabajadores directos liquidados."
          />
          <p className="mt-3 text-xs text-tenue">
            El tiempo ocioso se mide pero <strong>no</strong> se reparte automáticamente: qué hacer con
            él (llevarlo a CIF o reconocerlo como pérdida del período) es una decisión del módulo de
            CIF. Acá queda a la vista para que no desaparezca sin que nadie lo note.
          </p>
        </Tarjeta>
      )}

      {calculado.alertasNomina.length > 0 && (
        <Aviso tono="aviso" titulo={`${calculado.alertasNomina.length} aviso(s) de mano de obra`}>
          <ul className="list-disc space-y-0.5 pl-4">
            {calculado.alertasNomina.slice(0, 8).map((a, i) => (
              <li key={`${a.clase}-${i}`}>{a.mensaje}</li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  fuerte,
  clase = '',
}: {
  etiqueta: string
  valor: string
  fuerte?: boolean
  clase?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${fuerte ? 'font-semibold' : ''}`}>
      <span className={fuerte ? '' : 'text-suave'}>{etiqueta}</span>
      <span className={`cifra tabular-nums ${clase}`}>{valor}</span>
    </div>
  )
}
