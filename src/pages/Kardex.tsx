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
import { ETIQUETA_TIPO, esEntrada, validarSalida } from '../lib/kardex'
import type { FilaKardex, ID, TipoMovimientoKardex, UnidadMedida } from '../lib/tipos'
import { UNIDADES, compatibles, convertir, mensajeIncompatible, nombreUnidad, unidadCorta } from '../lib/unidades'

/** Los tipos que se registran a mano. Las salidas a producción salen de las órdenes. */
const TIPOS_MANUALES: ReadonlyArray<{ valor: TipoMovimientoKardex; texto: string }> = [
  { valor: 'entrada_compra', texto: ETIQUETA_TIPO.entrada_compra },
  { valor: 'devolucion_de_produccion', texto: ETIQUETA_TIPO.devolucion_de_produccion },
  { valor: 'ajuste_entrada', texto: ETIQUETA_TIPO.ajuste_entrada },
  { valor: 'devolucion_a_proveedor', texto: ETIQUETA_TIPO.devolucion_a_proveedor },
  { valor: 'ajuste_salida', texto: ETIQUETA_TIPO.ajuste_salida },
]

const OPCIONES_UNIDAD = UNIDADES.map((u) => ({ valor: u, texto: nombreUnidad(u) }))

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Kardex() {
  const { inventario, calculado, crearMovimiento, borrarMovimiento } = useEstado()

  const materias = inventario.materias_primas
  const [materiaId, setMateriaId] = useState<ID>('')

  const seleccionada = materias.find((m) => m.id === materiaId) ?? materias[0]
  const tarjeta = seleccionada ? calculado.tarjetas[seleccionada.id] : undefined

  // ---------------- formulario de movimiento ----------------
  const [tipo, setTipo] = useState<TipoMovimientoKardex>('entrada_compra')
  const [fecha, setFecha] = useState(hoyISO())
  const [documento, setDocumento] = useState('')
  const [concepto, setConcepto] = useState('')
  const [cant, setCant] = useState(0)
  const [unidad, setUnidad] = useState<UnidadMedida | null>(null)
  const [costo, setCosto] = useState(0)
  const [forzar, setForzar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const unidadUsada = unidad ?? seleccionada?.unidad ?? 'unidad'
  const entrada = esEntrada(tipo)

  /** La cantidad ya pasada a la unidad en la que vive el material. */
  const cantidadBase = useMemo(() => {
    if (!seleccionada) return null
    return convertir(cant, unidadUsada, seleccionada.unidad)
  }, [cant, unidadUsada, seleccionada])

  /**
   * El costo unitario, pasado a la unidad en la que vive el material.
   *
   * No basta con convertir la cantidad: si se compran 500 g a $2 el gramo, el
   * material que vive en kg entra como 0,5 kg a $2.000 el kg, no a $2. Lo que
   * no cambia al cambiar de unidad es el VALOR TOTAL, así que de ahí se
   * despeja el costo unitario en la unidad base.
   */
  const costoBase = useMemo(() => {
    if (cantidadBase == null || cantidadBase === 0) return costo
    return (cant * costo) / cantidadBase
  }, [cant, costo, cantidadBase])

  /** Si una salida de este tamaño cabe en el saldo. */
  const chequeoSalida = useMemo(() => {
    if (entrada || !seleccionada || cantidadBase == null) return { ok: true }
    return validarSalida(tarjeta, cantidadBase, unidadCorta(seleccionada.unidad))
  }, [entrada, seleccionada, cantidadBase, tarjeta])

  const limpiarFormulario = () => {
    setCant(0)
    setCosto(0)
    setDocumento('')
    setConcepto('')
    setForzar(false)
    setUnidad(null)
  }

  const guardar = () => {
    setOk(null)
    if (!seleccionada) return setError('Elegí una materia prima.')
    if (cant <= 0) return setError('La cantidad tiene que ser mayor que cero.')
    if (cantidadBase == null) {
      return setError(mensajeIncompatible(unidadUsada, seleccionada.unidad))
    }
    if (entrada && costo < 0) return setError('El costo unitario no puede ser negativo.')
    if (!entrada && !chequeoSalida.ok && !forzar) {
      return setError(
        `${chequeoSalida.mensaje} Si es un faltante real, marcá «forzar» para registrarlo como ajuste.`,
      )
    }

    crearMovimiento({
      fecha,
      materia_prima_id: seleccionada.id,
      tipo,
      concepto: concepto.trim() || ETIQUETA_TIPO[tipo],
      documento: documento.trim(),
      cantidad: cantidadBase,
      // Las salidas no llevan costo: lo pone el promedio ponderado vigente.
      costo_unitario: entrada ? costoBase : null,
      forzar: !entrada && forzar ? true : undefined,
    })

    setError(null)
    setOk(
      `Movimiento registrado: ${fmtCantidad(cantidadBase)} ${unidadCorta(seleccionada.unidad)} de ${seleccionada.nombre}.`,
    )
    limpiarFormulario()
  }

  const columnas: Columna<FilaKardex>[] = [
    { clave: 'fecha', titulo: 'Fecha', valor: (f) => f.fecha, render: (f) => <span className="cifra text-xs">{f.fecha}</span> },
    {
      clave: 'concepto',
      titulo: 'Concepto',
      valor: (f) => f.concepto,
      render: (f) => (
        <div>
          <p>{f.concepto}</p>
          <p className="text-xs text-tenue">{ETIQUETA_TIPO[f.tipo]}</p>
        </div>
      ),
    },
    {
      clave: 'documento',
      titulo: 'Doc.',
      soloAncho: true,
      valor: (f) => f.documento,
      render: (f) => <span className="cifra text-xs text-suave">{f.documento || '—'}</span>,
    },
    {
      clave: 'ent_cant',
      titulo: 'Ent. cant.',
      alineacion: 'der',
      render: (f) => (f.entrada_cantidad ? fmtCantidad(f.entrada_cantidad) : '—'),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'ent_cu',
      titulo: 'Ent. c.u.',
      alineacion: 'der',
      soloAncho: true,
      render: (f) => (f.entrada_cantidad ? copPreciso(f.costo_unitario_aplicado) : '—'),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'ent_total',
      titulo: 'Ent. total',
      alineacion: 'der',
      render: (f) => (f.entrada_cantidad ? cop(f.entrada_total) : '—'),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'sal_cant',
      titulo: 'Sal. cant.',
      alineacion: 'der',
      render: (f) => (f.salida_cantidad ? fmtCantidad(f.salida_cantidad) : '—'),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'sal_cu',
      titulo: 'Sal. c.u.',
      alineacion: 'der',
      soloAncho: true,
      render: (f) => (f.salida_cantidad ? copPreciso(f.costo_unitario_aplicado) : '—'),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'sal_total',
      titulo: 'Sal. total',
      alineacion: 'der',
      render: (f) => (f.salida_cantidad ? cop(f.salida_total) : '—'),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'saldo_cant',
      titulo: 'Saldo cant.',
      alineacion: 'der',
      render: (f) => fmtCantidad(f.saldo_cantidad),
      className: 'cifra tabular-nums font-medium',
    },
    {
      clave: 'saldo_cu',
      titulo: 'Saldo c.u.',
      alineacion: 'der',
      render: (f) => copPreciso(f.saldo_costo_unitario),
      className: 'cifra tabular-nums',
    },
    {
      clave: 'saldo_total',
      titulo: 'Saldo total',
      alineacion: 'der',
      render: (f) => cop(f.saldo_total),
      className: 'cifra tabular-nums font-medium',
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (f) => {
        if (f.id.startsWith('inicial:')) {
          return <span className="text-xs text-tenue">apertura</span>
        }
        if (f.id.startsWith('consumo:')) {
          return <span className="text-xs text-tenue">desde orden</span>
        }
        return (
          <BotonConfirmar variante="fantasma" onConfirmar={() => borrarMovimiento(f.id)}>
            ✕
          </BotonConfirmar>
        )
      },
    },
  ]

  const alertasDeEsta = seleccionada
    ? calculado.alertasKardex.filter((a) => a.materia_prima_id === seleccionada.id)
    : []

  if (materias.length === 0) {
    return (
      <Aviso tono="aviso" titulo="Todavía no hay materias primas">
        El Kardex es la tarjeta de un material. Creá al menos una materia prima para poder registrar
        movimientos.
      </Aviso>
    )
  }

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota={
            <>
              Promedio ponderado perpetuo. Una entrada recalcula el costo promedio; una salida baja
              las existencias <strong>sin cambiar el promedio</strong>.
            </>
          }
        >
          Kardex
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Campo etiqueta="Materia prima">
            {(id) => (
              <Selector
                id={id}
                valor={seleccionada?.id ?? ''}
                onChange={(v) => {
                  setMateriaId(v)
                  limpiarFormulario()
                  setError(null)
                  setOk(null)
                }}
                opciones={materias.map((m) => ({ valor: m.id, texto: `${m.codigo} · ${m.nombre}` }))}
              />
            )}
          </Campo>
          <Cifra
            etiqueta="Existencias"
            valor={`${fmtCantidad(tarjeta?.saldo_cantidad ?? 0)} ${seleccionada ? unidadCorta(seleccionada.unidad) : ''}`}
            tamano="sm"
          />
          <Cifra
            etiqueta="Costo promedio"
            valor={copPreciso(tarjeta?.costo_promedio ?? 0)}
            tamano="sm"
            tono="acento"
          />
          <Cifra etiqueta="Valor del saldo" valor={cop(tarjeta?.saldo_total ?? 0)} tamano="sm" />
        </Rejilla>

        {calculado.metodoPedido !== calculado.metodoInventario && (
          <div className="mt-3">
            <Aviso tono="aviso">
              La configuración pide <strong>{calculado.metodoPedido.toUpperCase()}</strong>, que
              todavía no está implementado. Esta tarjeta está valorada por promedio ponderado.
            </Aviso>
          </div>
        )}
      </Tarjeta>

      {/* ---------- nuevo movimiento ---------- */}
      <Tarjeta>
        <TituloSeccion nota="Las salidas a producción no se registran acá: salen de los consumos de cada orden.">
          Registrar movimiento
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Campo etiqueta="Tipo">
            {(id) => (
              <Selector
                id={id}
                valor={tipo}
                onChange={(v) => {
                  setTipo(v)
                  setForzar(false)
                  setError(null)
                }}
                opciones={TIPOS_MANUALES}
              />
            )}
          </Campo>
          <Campo etiqueta="Fecha">
            {(id) => <InputTexto id={id} tipo="date" valor={fecha} onChange={setFecha} />}
          </Campo>
          <Campo etiqueta="Documento" ayuda="Factura, remisión, acta.">
            {(id) => (
              <InputTexto id={id} valor={documento} onChange={setDocumento} placeholder="FC-1042" />
            )}
          </Campo>
          <Campo etiqueta="Concepto" ayuda="Si lo dejás vacío se usa el nombre del tipo.">
            {(id) => (
              <InputTexto
                id={id}
                valor={concepto}
                onChange={setConcepto}
                placeholder="Compra a Maderas El Roble"
              />
            )}
          </Campo>

          <Campo etiqueta="Cantidad">
            {(id) => <InputCifra id={id} valor={cant} onChange={setCant} paso={1} />}
          </Campo>
          <Campo
            etiqueta="Unidad"
            ayuda={
              seleccionada && unidadUsada !== seleccionada.unidad && cantidadBase != null
                ? `= ${fmtCantidad(cantidadBase, 4)} ${unidadCorta(seleccionada.unidad)}`
                : seleccionada
                  ? `El material vive en ${unidadCorta(seleccionada.unidad)}.`
                  : undefined
            }
            error={
              seleccionada && !compatibles(unidadUsada, seleccionada.unidad)
                ? `Incompatible con ${unidadCorta(seleccionada.unidad)}`
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

          {entrada ? (
            <Campo
              etiqueta="Costo unitario"
              ayuda={
                seleccionada && unidadUsada !== seleccionada.unidad && cantidadBase != null
                  ? `Por ${unidadCorta(unidadUsada)} = ${copPreciso(costoBase)} por ${unidadCorta(seleccionada.unidad)}`
                  : `Por ${unidadCorta(unidadUsada)}. Es lo que recalcula el promedio.`
              }
            >
              {(id) => <InputCifra id={id} valor={costo} onChange={setCosto} paso={100} sufijo="$" />}
            </Campo>
          ) : (
            <div className="rounded-lg border border-borde bg-panel-alto p-3">
              <Cifra
                etiqueta="Sale al promedio"
                valor={copPreciso(tarjeta?.costo_promedio ?? 0)}
                tamano="sm"
                pie="Las salidas no llevan costo propio."
              />
            </div>
          )}

          <div className="flex items-end">
            <Boton variante="primario" onClick={guardar} className="w-full">
              Registrar
            </Boton>
          </div>
        </Rejilla>

        {!entrada && !chequeoSalida.ok && (
          <div className="mt-3 space-y-2">
            <Aviso tono="negativo" titulo="No hay saldo suficiente">
              {chequeoSalida.mensaje} Un Kardex con saldo negativo no significa nada, así que el
              movimiento no se aplica salvo que lo registres a propósito como ajuste.
            </Aviso>
            <Casilla
              valor={forzar}
              onChange={setForzar}
              etiqueta="Forzar: es un faltante real y quiero dejar el saldo en negativo"
            />
          </div>
        )}

        {error && (
          <div className="mt-3">
            <Aviso tono="negativo">{error}</Aviso>
          </div>
        )}
        {ok && (
          <div className="mt-3">
            <Aviso tono="positivo">{ok}</Aviso>
          </div>
        )}
      </Tarjeta>

      {alertasDeEsta.length > 0 && (
        <Aviso tono="aviso" titulo={`Avisos de ${seleccionada?.nombre}`}>
          <ul className="list-disc space-y-0.5 pl-4">
            {alertasDeEsta.map((a) => (
              <li key={`${a.movimiento_id}-${a.clase}`}>{a.mensaje}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {/* ---------- la tarjeta ---------- */}
      <Tarjeta>
        <TituloSeccion
          nota={
            <>
              {tarjeta?.filas.length ?? 0} movimiento(s). Dentro del mismo día se aplican primero las
              entradas y después las salidas.
              {(tarjeta?.descartados.length ?? 0) > 0 && (
                <> {tarjeta?.descartados.length} id(s) repetidos se ignoraron.</>
              )}
            </>
          }
          acciones={
            seleccionada && (
              <Pildora tono="acento">
                {seleccionada.codigo} · {nombreUnidad(seleccionada.unidad)}
              </Pildora>
            )
          }
        >
          Tarjeta de {seleccionada?.nombre}
        </TituloSeccion>

        <Tabla
          columnas={columnas}
          filas={tarjeta?.filas ?? []}
          claveFila={(f) => f.id}
          resaltarFila={(f) => (f.aplicado ? null : 'negativo')}
          vacio="Sin movimientos. El saldo inicial se define en la ficha de la materia prima."
          pie={
            tarjeta && tarjeta.filas.length > 0 ? (
              <tr>
                <td className="px-2.5 py-2 text-xs uppercase tracking-wider text-tenue" colSpan={9}>
                  Saldo final
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums">
                  {fmtCantidad(tarjeta.saldo_cantidad)}
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums">
                  {copPreciso(tarjeta.costo_promedio)}
                </td>
                <td className="cifra px-2.5 py-2 text-right tabular-nums">{cop(tarjeta.saldo_total)}</td>
                <td />
              </tr>
            ) : undefined
          }
        />
      </Tarjeta>
    </div>
  )
}
