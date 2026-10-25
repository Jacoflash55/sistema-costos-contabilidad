import { useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  CeldaEditable,
  Cifra,
  InputCifra,
  Pestanas,
  Pildora,
  Rejilla,
  Selector,
  Tarjeta,
  TituloSeccion,
} from '../components/ui'
import { useEstado } from '../contexto'
import { CUENTAS_BALANCE, ETIQUETA_GRUPO_BALANCE } from '../lib/estados'
import type { CuentaBalance, EstadoResultados, EstadoSituacion, GrupoBalance } from '../lib/estados'
import { cop, pct } from '../lib/formato'
import type { Mes } from '../lib/tipos'

type Seccion = 'resultados' | 'situacion'

/**
 * Un renglón de estado financiero.
 *
 * Es la pieza que hace que los dos informes se vean como un estado financiero
 * de verdad y no como una tabla cualquiera: cuentas indentadas, subtotales con
 * línea arriba, totales en negrita y la cifra siempre a la derecha, alineada
 * por la coma.
 */
function Renglon({
  concepto,
  monto,
  nivel = 0,
  tipo = 'detalle',
  margen,
  nota,
  resta,
  derecha,
}: {
  concepto: string
  monto: number
  nivel?: 0 | 1
  tipo?: 'detalle' | 'subtotal' | 'total'
  margen?: number
  nota?: string
  resta?: boolean
  derecha?: React.ReactNode
}) {
  const esFuerte = tipo !== 'detalle'

  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        tipo === 'subtotal' ? 'mt-1 border-t border-borde' : ''
      } ${tipo === 'total' ? 'mt-1 border-t-2 border-borde-fuerte' : ''}`}
    >
      <div className={nivel === 1 ? 'pl-5' : ''}>
        <p className={esFuerte ? 'text-sm font-semibold' : 'text-sm text-suave'}>
          {resta && <span className="text-tenue">(−) </span>}
          {concepto}
        </p>
        {nota && <p className="text-xs text-tenue">{nota}</p>}
      </div>

      <div className="flex items-baseline gap-3">
        {margen != null && (
          <span className="cifra w-16 shrink-0 text-right text-xs text-tenue tabular-nums">
            {pct(margen * 100, 1)}
          </span>
        )}
        {derecha ?? (
          <span
            className={`cifra w-36 shrink-0 text-right tabular-nums ${
              esFuerte ? 'text-base font-semibold' : 'text-sm'
            } ${tipo === 'total' && monto < 0 ? 'text-negativo' : ''}`}
          >
            {cop(monto)}
          </span>
        )}
      </div>
    </div>
  )
}

/** El encabezado que llevan los dos informes al imprimirse. */
function Encabezado({
  empresa,
  nit,
  titulo,
  periodo,
}: {
  empresa: string
  nit: string
  titulo: string
  periodo: Mes
}) {
  return (
    <div className="mb-4 border-b border-borde pb-3 text-center">
      <p className="text-base font-semibold tracking-tight">{empresa}</p>
      {nit && <p className="text-xs text-tenue">NIT {nit}</p>}
      <p className="mt-1 text-sm font-medium uppercase tracking-wider">{titulo}</p>
      <p className="text-xs text-suave">Período {periodo}</p>
    </div>
  )
}

export function Informes() {
  const { calculado } = useEstado()
  const [seccion, setSeccion] = useState<Seccion>('resultados')

  const periodos = calculado.periodosCIF
  const [periodo, setPeriodo] = useState<Mes>('')
  const periodoActivo = periodos.includes(periodo) ? periodo : (periodos[periodos.length - 1] ?? '')

  const informe = periodoActivo ? calculado.informesPorPeriodo[periodoActivo] : undefined

  if (!informe) {
    return (
      <Tarjeta>
        <TituloSeccion nota="Hace falta al menos un período con órdenes o con CIF registrados.">
          Informes
        </TituloSeccion>
        <Aviso tono="aviso">
          Todavía no hay nada que informar. Cargá órdenes de producción y los CIF del período, o importá
          un respaldo desde Configuración.
        </Aviso>
      </Tarjeta>
    )
  }

  return (
    <div className="space-y-5">
      <Tarjeta className="no-imprimir" compacta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Informes financieros</h2>
            <p className="text-sm text-suave">
              Se arman solos con lo que ya registraste. Las cuentas que el sistema no puede saber las
              escribís vos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periodos.length > 1 && (
              <Selector<Mes>
                valor={periodoActivo}
                onChange={setPeriodo}
                opciones={periodos.map((p) => ({ valor: p, texto: p }))}
              />
            )}
            <Boton variante="secundario" onClick={() => window.print()}>
              🖨 Imprimir
            </Boton>
          </div>
        </div>
      </Tarjeta>

      <div className="no-imprimir">
        <Pestanas<Seccion>
          valor={seccion}
          onChange={setSeccion}
          opciones={[
            { valor: 'resultados', texto: 'Estado de resultados' },
            { valor: 'situacion', texto: 'Situación financiera' },
          ]}
        />
      </div>

      {seccion === 'resultados' ? (
        <Resultados periodo={periodoActivo} informe={informe.resultados} />
      ) : (
        <Situacion periodo={periodoActivo} informe={informe.situacion} />
      )}

      <p className="no-imprimir text-xs text-tenue">
        Informes <strong>académicos</strong>: tienen la estructura de un estado financiero para resolver
        el taller, no un juego completo bajo NIIF. No hay notas, ni comparativo con el período anterior,
        ni estado de flujos de efectivo.
      </p>
    </div>
  )
}

// =====================================================================
// Estado de resultados
// =====================================================================

function Resultados({ periodo, informe: r }: { periodo: Mes; informe: EstadoResultados }) {
  const { comercial, fijarValorInforme } = useEstado()

  const valor = (clave: string) =>
    (comercial.valores_informe ?? []).find((v) => v.periodo === periodo && v.clave === clave)?.monto ?? 0

  return (
    <div className="space-y-4">
      {r.advertencias.map((a, i) => (
        <Aviso key={i} tono="aviso" className="no-imprimir">
          {a}
        </Aviso>
      ))}

      {r.faltantes.length > 0 && (
        <Aviso tono="negativo" className="no-imprimir" titulo="Datos que faltan">
          <ul className="list-disc space-y-0.5 pl-4">
            {r.faltantes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Aviso>
      )}

      <Tarjeta className="no-imprimir" compacta>
        <Rejilla columnas={3}>
          <Campo etiqueta="Tasa de impuesto de renta" ayuda="Solo se cobra sobre ganancia">
            {(id) => (
              <InputCifra
                id={id}
                valor={valor('er_tasa_impuesto')}
                paso={1}
                sufijo="%"
                onChange={(n) => fijarValorInforme(periodo, 'er_tasa_impuesto', n)}
              />
            )}
          </Campo>
          <Campo etiqueta="Ingresos financieros" ayuda="Rendimientos, intereses ganados">
            {(id) => (
              <InputCifra
                id={id}
                valor={valor('er_ingresos_financieros')}
                paso={100_000}
                onChange={(n) => fijarValorInforme(periodo, 'er_ingresos_financieros', n)}
              />
            )}
          </Campo>
          <Campo etiqueta="Gastos financieros" ayuda="Se suman a los de categoría financiera">
            {(id) => (
              <InputCifra
                id={id}
                valor={valor('er_gastos_financieros')}
                paso={100_000}
                onChange={(n) => fijarValorInforme(periodo, 'er_gastos_financieros', n)}
              />
            )}
          </Campo>
        </Rejilla>
      </Tarjeta>

      <Tarjeta className="hoja-imprimible">
        <Encabezado
          empresa={r.empresa}
          nit={r.nit}
          titulo="Estado de resultados"
          periodo={periodo}
        />

        <Renglon concepto="Ventas" monto={r.ventas} tipo="subtotal" margen={1} />
        {r.lineas_ventas.map((l, i) => (
          <Renglon
            key={i}
            concepto={l.producto}
            monto={l.total}
            nivel={1}
            nota={
              l.unidades > 0
                ? `${l.unidades.toLocaleString('es-CO')} × ${cop(l.precio_unitario)}${
                    l.origen === 'hoja' ? ' · precio sugerido de la hoja' : ''
                  }`
                : undefined
            }
          />
        ))}

        <Renglon concepto="Costo de ventas" monto={r.costo_ventas} resta tipo="subtotal" />
        <Renglon concepto="Material directo" monto={r.costo_materiales} nivel={1} />
        <Renglon concepto="Mano de obra directa" monto={r.costo_mano_obra} nivel={1} />
        <Renglon concepto="CIF aplicados" monto={r.costo_cif} nivel={1} />
        {r.costo_otros !== 0 && (
          <Renglon concepto="Otros costos directos" monto={r.costo_otros} nivel={1} />
        )}

        <Renglon
          concepto="UTILIDAD BRUTA"
          monto={r.utilidad_bruta}
          tipo="total"
          margen={r.margen_bruto}
        />

        <Renglon
          concepto="Gastos operacionales"
          monto={r.total_gastos_operacionales}
          resta
          tipo="subtotal"
        />
        <Renglon concepto="De administración" monto={r.gastos_administracion} nivel={1} />
        <Renglon concepto="De ventas" monto={r.gastos_ventas} nivel={1} />

        <Renglon
          concepto="UTILIDAD OPERACIONAL"
          monto={r.utilidad_operacional}
          tipo="total"
          margen={r.margen_operacional}
        />

        <Renglon concepto="Resultado financiero" monto={r.resultado_financiero} tipo="subtotal" />
        <Renglon concepto="Ingresos financieros" monto={r.ingresos_financieros} nivel={1} />
        <Renglon concepto="Gastos financieros" monto={r.gastos_financieros} nivel={1} resta />

        <Renglon
          concepto="UTILIDAD ANTES DE IMPUESTOS"
          monto={r.utilidad_antes_impuestos}
          tipo="total"
          margen={r.margen_antes_impuestos}
        />

        <Renglon
          concepto={`Impuesto de renta (${pct(r.tasa_impuesto, 0)})`}
          monto={r.impuesto}
          resta
          tipo="subtotal"
          nota={r.utilidad_antes_impuestos > 0 ? undefined : 'Sin ganancia no se tributa'}
        />

        <Renglon
          concepto="UTILIDAD NETA DEL EJERCICIO"
          monto={r.utilidad_neta}
          tipo="total"
          margen={r.margen_neto}
        />

        {r.ventas_supuestas && (
          <p className="mt-4 border-t border-borde pt-2 text-xs text-tenue">
            <strong>Supuesto:</strong> no hay ventas registradas, así que el informe asume que todo lo
            producido se vendió al precio sugerido de cada hoja de costos.
          </p>
        )}
      </Tarjeta>

      <Rejilla columnas={4}>
        <Cifra etiqueta="Ventas" valor={cop(r.ventas)} tamano="sm" />
        <Cifra etiqueta="Margen bruto" valor={pct(r.margen_bruto * 100, 1)} tamano="sm" />
        <Cifra etiqueta="Margen operacional" valor={pct(r.margen_operacional * 100, 1)} tamano="sm" />
        <Cifra
          etiqueta="Utilidad neta"
          valor={cop(r.utilidad_neta)}
          tono={r.utilidad_neta >= 0 ? 'positivo' : 'negativo'}
          tamano="sm"
        />
      </Rejilla>
    </div>
  )
}

// =====================================================================
// Estado de situación financiera
// =====================================================================

const ORDEN_GRUPOS: readonly GrupoBalance[] = [
  'activo_corriente',
  'activo_no_corriente',
  'pasivo_corriente',
  'pasivo_no_corriente',
  'patrimonio',
]

function Situacion({ periodo, informe: b }: { periodo: Mes; informe: EstadoSituacion }) {
  const { fijarValorInforme, limpiarValoresInforme } = useEstado()

  const delGrupo = (g: GrupoBalance) => b.cuentas.filter((c) => c.grupo === g)

  const subtotal: Record<GrupoBalance, number> = {
    activo_corriente: b.activo_corriente,
    activo_no_corriente: b.activo_no_corriente,
    pasivo_corriente: b.pasivo_corriente,
    pasivo_no_corriente: b.pasivo_no_corriente,
    patrimonio: b.patrimonio,
  }

  const cuenta = (c: CuentaBalance) => (
    <Renglon
      key={c.id}
      concepto={c.nombre}
      monto={c.monto}
      nivel={1}
      resta={c.resta}
      nota={c.ayuda}
      derecha={
        c.derivada ? (
          <span className="flex items-center gap-2">
            <Pildora tono="neutro">Derivado</Pildora>
            <span className="cifra w-36 shrink-0 text-right text-sm tabular-nums">{cop(c.monto)}</span>
          </span>
        ) : (
          <span className="no-imprimir-inline flex items-center gap-2">
            <span className="w-36 shrink-0">
              <CeldaEditable
                valor={c.monto}
                formato={(n) => cop(n)}
                paso={100_000}
                onChange={(n) => fijarValorInforme(periodo, c.id, n)}
              />
            </span>
          </span>
        )
      }
    />
  )

  return (
    <div className="space-y-4">
      {b.advertencias.map((a, i) => (
        <Aviso key={i} tono={b.cuadra ? 'aviso' : 'negativo'} className="no-imprimir">
          {a}
        </Aviso>
      ))}

      <Tarjeta className="no-imprimir" compacta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-suave">
            Las cuentas marcadas <strong>Derivado</strong> las calcula el sistema. Las demás se escriben
            con un clic en la cifra.
          </p>
          <BotonConfirmar
            variante="fantasma"
            textoConfirmar="Sí, borrar las cuentas"
            onConfirmar={() => limpiarValoresInforme(periodo)}
          >
            Vaciar lo escrito
          </BotonConfirmar>
        </div>
      </Tarjeta>

      <Tarjeta className="hoja-imprimible">
        <Encabezado
          empresa={b.empresa}
          nit={b.nit}
          titulo="Estado de situación financiera"
          periodo={periodo}
        />

        {ORDEN_GRUPOS.map((g) => (
          <div key={g} className={g === 'pasivo_corriente' ? 'mt-5' : ''}>
            <Renglon concepto={ETIQUETA_GRUPO_BALANCE[g]} monto={subtotal[g]} tipo="subtotal" />
            {delGrupo(g).map(cuenta)}
          </div>
        ))}

        <div className="mt-5">
          <Renglon concepto="TOTAL ACTIVO" monto={b.total_activo} tipo="total" />
          <Renglon
            concepto="TOTAL PASIVO + PATRIMONIO"
            monto={b.total_pasivo_patrimonio}
            tipo="total"
          />
        </div>

        <div
          className={`mt-4 rounded-lg border p-3 ${
            b.cuadra ? 'border-positivo/40 bg-positivo/8' : 'border-negativo/40 bg-negativo/8'
          }`}
        >
          {b.cuadra ? (
            <p className="text-sm font-semibold text-positivo">
              ✓ El balance cuadra: Activo = Pasivo + Patrimonio
            </p>
          ) : (
            <div>
              <p className="text-sm font-semibold text-negativo">
                ✕ El balance NO cuadra · descuadre de {cop(Math.abs(b.descuadre))}
              </p>
              <p className="mt-1 text-xs opacity-90">
                {b.descuadre > 0
                  ? 'El activo es mayor: falta registrar una deuda o un aporte.'
                  : 'Pasivo más patrimonio es mayor: falta registrar un bien o sobra una deuda.'}
              </p>
            </div>
          )}
        </div>
      </Tarjeta>

      <Rejilla columnas={3}>
        <Cifra etiqueta="Total activo" valor={cop(b.total_activo)} tamano="sm" />
        <Cifra etiqueta="Total pasivo" valor={cop(b.total_pasivo)} tamano="sm" />
        <Cifra
          etiqueta="Patrimonio"
          valor={cop(b.patrimonio)}
          tono={b.patrimonio >= 0 ? 'neutro' : 'negativo'}
          tamano="sm"
        />
      </Rejilla>

      <p className="no-imprimir text-xs text-tenue">
        <strong>Por qué no cuadra solo.</strong> El sistema nunca mete la diferencia en una cuenta para
        forzar el cierre. Un balance que cuadra a la fuerza esconde justamente el error que había que
        encontrar; uno que no cuadra te dice que falta registrar algo. Las cuentas derivadas{' '}
        {CUENTAS_BALANCE.filter((c) => c.derivada).length} salen del Kardex y del estado de resultados.
      </p>
    </div>
  )
}
