import { useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  Cifra,
  InputCifra,
  InputTexto,
  Pildora,
  Rejilla,
  Selector,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Tono } from '../../components/ui'
import { useEstado } from '../../contexto'
import { ETIQUETA_BASE } from '../../lib/cif'
import { cantidad as fmtCantidad, cop, copPreciso, pct } from '../../lib/formato'
import type { HojaCostos, HojaRegistro, MetodoMargen, RenglonHoja } from '../../lib/tipos'

const METODOS: ReadonlyArray<{ valor: MetodoMargen; texto: string }> = [
  { valor: 'sobre_costo', texto: 'Recargo sobre el costo' },
  { valor: 'sobre_precio', texto: 'Margen sobre la venta' },
]

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * La hoja de costos de una orden.
 *
 * Todo lo que se ve aquí sale de `calculado`: el material del Kardex, la mano
 * de obra de la nómina, los CIF de la tasa del período. Esta pantalla no suma
 * nada por su cuenta, solo lo presenta.
 */
export function VistaHoja({ registro, cerrar }: { registro: HojaRegistro; cerrar: () => void }) {
  const { calculado, produccion, actualizarHoja, finalizarHoja, reabrirHoja, crearOtroDirecto, borrarOtroDirecto } =
    useEstado()

  const hoja = calculado.hojasPorOrden[registro.orden_id]

  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verHistorial, setVerHistorial] = useState(false)

  // alta de otros costos directos
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState(0)
  const [fechaOtro, setFechaOtro] = useState(hoyISO())

  if (!hoja) {
    return (
      <Aviso tono="negativo" titulo="No se pudo armar la hoja">
        La orden de esta hoja ya no existe.
      </Aviso>
    )
  }

  const finalizada = hoja.estado === 'finalizada'
  const otros = produccion.otros_directos.filter((o) => o.orden_id === registro.orden_id)

  const agregarOtro = () => {
    if (!concepto.trim()) return setError('Escribí de qué se trata el costo.')
    if (monto <= 0) return setError('El monto tiene que ser mayor que cero.')
    crearOtroDirecto({
      orden_id: registro.orden_id,
      fecha: fechaOtro,
      concepto: concepto.trim(),
      monto,
    })
    setConcepto('')
    setMonto(0)
    setError(null)
  }

  const finalizar = () => {
    const problema = finalizarHoja(registro.id, motivo)
    setError(problema)
    if (!problema) setMotivo('')
  }

  return (
    <div className="space-y-5">
      {/* ---------- barra de acciones: no se imprime ---------- */}
      <Tarjeta className="no-imprimir" compacta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pildora tono={finalizada ? 'positivo' : 'aviso'}>
              {finalizada ? `Finalizada · v${hoja.version}` : 'Borrador'}
            </Pildora>
            {hoja.completa ? (
              <Pildora tono="positivo">Completa</Pildora>
            ) : (
              <Pildora tono="negativo">Falta información</Pildora>
            )}
            {registro.historial.length > 0 && (
              <Boton variante="fantasma" onClick={() => setVerHistorial((v) => !v)}>
                {registro.historial.length} corrección(es)
              </Boton>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={() => window.print()}>
              🖨 Imprimir / PDF
            </Boton>
            {finalizada ? (
              <BotonConfirmar
                variante="secundario"
                textoConfirmar="Sí, reabrir"
                onConfirmar={() => {
                  reabrirHoja(registro.id)
                  setError(null)
                }}
              >
                Reabrir para corregir
              </BotonConfirmar>
            ) : (
              <Boton variante="primario" onClick={finalizar} deshabilitado={!hoja.completa}>
                Finalizar hoja
              </Boton>
            )}
            <Boton variante="fantasma" onClick={cerrar}>
              Cerrar
            </Boton>
          </div>
        </div>

        {!finalizada && registro.congelada && (
          <div className="mt-3">
            <Campo
              etiqueta="Motivo de la corrección"
              ayuda="Queda en el historial de la hoja, junto con lo que cambió."
            >
              {(id) => (
                <InputTexto
                  id={id}
                  valor={motivo}
                  onChange={setMotivo}
                  placeholder="Se corrigió la cantidad producida"
                />
              )}
            </Campo>
          </div>
        )}

        {error && (
          <div className="mt-3">
            <Aviso tono="negativo">{error}</Aviso>
          </div>
        )}
      </Tarjeta>

      {finalizada && (
        <Aviso tono="positivo" titulo="Esta hoja está congelada" className="no-imprimir">
          Lo que se ve es la foto del momento en que se finalizó, versión {hoja.version}. Si después
          cambió un costo de material, una hora o un CIF, esta hoja <strong>no se movió</strong>. Para
          actualizarla hay que reabrirla, y eso queda registrado.
        </Aviso>
      )}

      {!finalizada && (
        <Aviso tono="aviso" titulo="Borrador: se recalcula sola" className="no-imprimir">
          Cada vez que cambie un consumo, una hora imputada, un CIF del período o la cantidad
          producida, esta hoja se vuelve a armar con los datos de hoy. Al finalizarla se congela.
        </Aviso>
      )}

      {!hoja.completa && (
        <Aviso tono="negativo" titulo="No se puede finalizar todavía" className="no-imprimir">
          <ul className="list-disc space-y-0.5 pl-4">
            {hoja.faltantes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-90">
            Mientras falte algo esencial la hoja queda en borrador y no se muestra como definitiva.
          </p>
        </Aviso>
      )}

      {verHistorial && registro.historial.length > 0 && (
        <Tarjeta className="no-imprimir">
          <TituloSeccion nota="Cada corrección de una hoja ya finalizada, con lo que cambió.">
            Historial de versiones
          </TituloSeccion>
          <div className="space-y-3">
            {[...registro.historial].reverse().map((h) => (
              <div key={h.version} className="rounded-lg border border-borde bg-panel-alto p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">Versión {h.version}</p>
                  <p className="cifra text-xs text-tenue">{h.fecha.slice(0, 16).replace('T', ' ')}</p>
                </div>
                <p className="mt-1 text-sm text-suave">{h.motivo}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm">
                  {h.diferencias.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <p className="cifra mt-2 text-xs text-tenue">
                  Costo unitario: {copPreciso(h.costo_unitario_antes)} →{' '}
                  {copPreciso(h.costo_unitario_despues)}
                </p>
              </div>
            ))}
          </div>
        </Tarjeta>
      )}

      {/* ================= LA HOJA, lo que se imprime ================= */}
      <Tarjeta className="hoja-imprimible">
        <Encabezado hoja={hoja} />

        <Bloque
          letra="A"
          titulo="Materia prima directa"
          origen="Leída del Kardex, al costo promedio vigente en cada salida"
          renglones={hoja.materiales}
          total={hoja.total_materiales}
          etiquetaCantidad="Cantidad"
        />

        <Bloque
          letra="B"
          titulo="Mano de obra directa"
          origen="Leída de la nómina, a la tarifa cargada de cada trabajador"
          renglones={hoja.mano_obra}
          total={hoja.total_mano_obra}
          etiquetaCantidad="Horas"
        />

        <Bloque
          letra="C"
          titulo="Costos indirectos de fabricación"
          origen={
            hoja.cif_detalle
              ? `Aplicados con la tasa del período ${hoja.cif_detalle.periodo}, base: ${ETIQUETA_BASE[hoja.cif_detalle.base].toLowerCase()}`
              : 'Sin CIF aplicados'
          }
          renglones={hoja.cif}
          total={hoja.total_cif}
          etiquetaCantidad="Nivel de actividad"
        />

        <Bloque
          letra="D"
          titulo="Otros costos directos"
          origen="Lo que no pasa por el Kardex ni por la nómina"
          renglones={hoja.otros}
          total={hoja.total_otros}
          etiquetaCantidad="Cant."
        />

        <Resumen hoja={hoja} />
        <Precio hoja={hoja} />

        {hoja.observaciones && (
          <div className="mt-6 border-t border-borde pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-tenue">Observaciones</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{hoja.observaciones}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-borde pt-4 text-xs text-tenue">
          <div>
            <p>
              Hoja {hoja.numero} · {hoja.estado === 'finalizada' ? `finalizada v${hoja.version}` : 'BORRADOR'}
            </p>
            <p className="mt-0.5">{hoja.empresa}</p>
          </div>
          <div className="text-right">
            <p className="mb-6">_______________________________</p>
            <p>Elaborada por</p>
          </div>
        </div>
      </Tarjeta>

      {/* ---------- edición: no se imprime ---------- */}
      {!finalizada && (
        <>
          <Tarjeta className="no-imprimir">
            <TituloSeccion nota="Lo propio de la hoja. Los costos no se escriben: se leen de los otros módulos.">
              Datos de la hoja
            </TituloSeccion>
            <Rejilla columnas={4}>
              <Campo etiqueta="N° de hoja">
                {(id) => (
                  <InputTexto
                    id={id}
                    valor={registro.numero}
                    onChange={(v) => actualizarHoja(registro.id, { numero: v })}
                  />
                )}
              </Campo>
              <Campo etiqueta="Fecha de elaboración">
                {(id) => (
                  <InputTexto
                    id={id}
                    tipo="date"
                    valor={registro.fecha_elaboracion}
                    onChange={(v) => actualizarHoja(registro.id, { fecha_elaboracion: v })}
                  />
                )}
              </Campo>
              <Campo etiqueta="Método de margen" ayuda="Vacío = el de la configuración.">
                {(id) => (
                  <Selector
                    id={id}
                    valor={registro.margen_metodo ?? ''}
                    onChange={(v) =>
                      actualizarHoja(registro.id, { margen_metodo: (v || null) as MetodoMargen | null })
                    }
                    opciones={METODOS}
                    vacio="El de configuración"
                  />
                )}
              </Campo>
              <Campo etiqueta="Margen de esta hoja" ayuda="0 = el del producto o el de configuración.">
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={registro.margen_pct ?? 0}
                    onChange={(n) => actualizarHoja(registro.id, { margen_pct: n > 0 ? n : null })}
                    paso={1}
                    sufijo="%"
                  />
                )}
              </Campo>
              <Campo etiqueta="Observaciones" className="sm:col-span-2 lg:col-span-4">
                {(id) => (
                  <InputTexto
                    id={id}
                    valor={registro.observaciones}
                    onChange={(v) => actualizarHoja(registro.id, { observaciones: v })}
                  />
                )}
              </Campo>
            </Rejilla>
          </Tarjeta>

          <Tarjeta className="no-imprimir">
            <TituloSeccion nota="Bloque (D). Solo lo que NO pasó por el Kardex ni por la nómina.">
              Otros costos directos
            </TituloSeccion>

            <Aviso tono="aviso">
              <strong>Ojo con duplicar.</strong> Si un material ya se consumió como requisición, ya está
              en el bloque (A); si una hora ya se imputó, ya está en (B). Acá van cosas como un flete de
              entrega, el alquiler de una herramienta para esta orden o un troquel.
            </Aviso>

            <div className="mt-4">
              <Rejilla columnas={4}>
                <Campo etiqueta="Concepto">
                  {(id) => (
                    <InputTexto
                      id={id}
                      valor={concepto}
                      onChange={setConcepto}
                      placeholder="Flete de entrega"
                    />
                  )}
                </Campo>
                <Campo etiqueta="Monto">
                  {(id) => <InputCifra id={id} valor={monto} onChange={setMonto} paso={10_000} sufijo="$" />}
                </Campo>
                <Campo etiqueta="Fecha">
                  {(id) => <InputTexto id={id} tipo="date" valor={fechaOtro} onChange={setFechaOtro} />}
                </Campo>
                <div className="flex items-end">
                  <Boton variante="primario" onClick={agregarOtro} className="w-full">
                    Agregar
                  </Boton>
                </div>
              </Rejilla>
            </div>

            {otros.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {otros.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-borde bg-panel-alto px-3 py-2 text-sm"
                  >
                    <span>
                      {o.concepto} <span className="text-xs text-tenue">· {o.fecha}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="cifra tabular-nums">{cop(o.monto)}</span>
                      <BotonConfirmar variante="fantasma" onConfirmar={() => borrarOtroDirecto(o.id)}>
                        ✕
                      </BotonConfirmar>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {hoja.advertencias.length > 0 && (
        <Aviso tono="aviso" titulo="Para mirar" className="no-imprimir">
          <ul className="list-disc space-y-0.5 pl-4">
            {hoja.advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  )
}

// =====================================================================
// Las partes de la hoja
// =====================================================================

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-tenue">{etiqueta}</p>
      <p className="text-sm">{valor}</p>
    </div>
  )
}

function Encabezado({ hoja }: { hoja: HojaCostos }) {
  return (
    <div className="border-b-2 border-borde-fuerte pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">HOJA DE COSTOS</h2>
          <p className="text-sm text-suave">{hoja.empresa}</p>
          {hoja.empresa_nit && <p className="cifra text-xs text-tenue">NIT {hoja.empresa_nit}</p>}
        </div>
        <div className="text-right">
          <p className="cifra text-lg font-semibold">{hoja.numero}</p>
          <p className="text-xs text-tenue">
            {hoja.estado === 'finalizada' ? `Finalizada · versión ${hoja.version}` : 'BORRADOR'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Dato etiqueta="Orden de producción" valor={hoja.orden_numero} />
        <Dato etiqueta="Cliente" valor={hoja.cliente} />
        <Dato etiqueta="Fecha de elaboración" valor={hoja.fecha_elaboracion} />
        <Dato
          etiqueta="Producción"
          valor={`${hoja.fecha_inicio} → ${hoja.fecha_fin ?? 'en curso'}`}
        />
        <Dato etiqueta="Producto" valor={`${hoja.producto_codigo} · ${hoja.producto}`} />
        <Dato etiqueta="Unidad" valor={hoja.unidad} />
        <Dato
          etiqueta="Cantidad solicitada"
          valor={fmtCantidad(hoja.cantidad_solicitada, 0)}
        />
        <Dato
          etiqueta="Cantidad producida"
          valor={hoja.cantidad_producida > 0 ? fmtCantidad(hoja.cantidad_producida, 0) : 'sin definir'}
        />
      </div>
    </div>
  )
}

function Bloque({
  letra,
  titulo,
  origen,
  renglones,
  total,
  etiquetaCantidad,
}: {
  letra: string
  titulo: string
  origen: string
  renglones: RenglonHoja[]
  total: number
  etiquetaCantidad: string
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <span className="text-tenue">({letra})</span> {titulo}
        </h3>
        <p className="text-xs text-tenue">{origen}</p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borde text-[10px] uppercase tracking-wider text-tenue">
              <th className="py-1.5 pr-3 text-left">Concepto</th>
              <th className="px-3 py-1.5 text-right">{etiquetaCantidad}</th>
              <th className="px-3 py-1.5 text-left">Unidad</th>
              <th className="px-3 py-1.5 text-right">Costo unitario</th>
              <th className="py-1.5 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {renglones.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-tenue">
                  Sin movimientos en este bloque.
                </td>
              </tr>
            )}
            {renglones.map((r, i) => (
              <tr key={`${r.concepto}-${i}`} className="border-b border-borde/60">
                <td className="py-1.5 pr-3">
                  {r.concepto}
                  {r.detalle && <p className="text-xs text-tenue">{r.detalle}</p>}
                </td>
                <td className="cifra px-3 py-1.5 text-right tabular-nums">{fmtCantidad(r.cantidad)}</td>
                <td className="px-3 py-1.5 text-left text-xs text-suave">{r.unidad}</td>
                <td className="cifra px-3 py-1.5 text-right tabular-nums">{copPreciso(r.costo_unitario)}</td>
                <td className="cifra py-1.5 pl-3 text-right tabular-nums">{cop(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-borde-fuerte font-semibold">
              <td className="py-1.5 pr-3 text-xs uppercase tracking-wider" colSpan={4}>
                Total ({letra})
              </td>
              <td className="cifra py-1.5 pl-3 text-right tabular-nums">{cop(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Linea({
  etiqueta,
  valor,
  fuerte,
  grande,
  tono,
}: {
  etiqueta: string
  valor: string
  fuerte?: boolean
  grande?: boolean
  tono?: Tono
}) {
  const color =
    tono === 'acento'
      ? 'text-acento'
      : tono === 'positivo'
        ? 'text-positivo'
        : tono === 'negativo'
          ? 'text-negativo'
          : ''
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${fuerte ? 'font-semibold' : ''} ${grande ? 'text-base' : 'text-sm'}`}
    >
      <span className={fuerte ? '' : 'text-suave'}>{etiqueta}</span>
      <span className={`cifra tabular-nums ${color}`}>{valor}</span>
    </div>
  )
}

function Resumen({ hoja }: { hoja: HojaCostos }) {
  return (
    <div className="mt-8 border-t-2 border-borde-fuerte pt-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">Resumen del costo</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Linea etiqueta="(A) Materia prima directa" valor={cop(hoja.total_materiales)} />
          <Linea etiqueta="(B) Mano de obra directa" valor={cop(hoja.total_mano_obra)} />
          <div className="border-t border-borde pt-1.5">
            <Linea etiqueta="Costo primo (A + B)" valor={cop(hoja.costo_primo)} fuerte />
          </div>
          <Linea etiqueta="(C) Costos indirectos de fabricación" valor={cop(hoja.total_cif)} />
          <div className="border-t border-borde pt-1.5">
            <Linea etiqueta="Costo de conversión (B + C)" valor={cop(hoja.costo_conversion)} fuerte />
          </div>
          {hoja.total_otros !== 0 && (
            <Linea etiqueta="(D) Otros costos directos" valor={cop(hoja.total_otros)} />
          )}
        </div>

        <div className="space-y-1.5 rounded-lg border border-borde-fuerte bg-panel-alto p-4">
          <Linea etiqueta="COSTO TOTAL" valor={cop(hoja.costo_total)} fuerte grande />
          <Linea
            etiqueta="Cantidad producida"
            valor={`${fmtCantidad(hoja.cantidad_producida, 0)} ${hoja.unidad}`}
          />
          <div className="border-t border-borde-fuerte pt-2">
            <Linea
              etiqueta="COSTO UNITARIO"
              valor={hoja.cantidad_producida > 0 ? copPreciso(hoja.costo_unitario) : 'sin definir'}
              fuerte
              grande
              tono="acento"
            />
          </div>
          {hoja.cantidad_producida <= 0 && (
            <p className="pt-1 text-xs text-negativo">
              Sin cantidad producida no hay costo unitario que mostrar.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Precio({ hoja }: { hoja: HojaCostos }) {
  const origen = {
    hoja: 'definido en esta hoja',
    producto: 'del producto',
    configuracion: 'de la configuración',
  }[hoja.margen_origen]

  const formula =
    hoja.margen_metodo === 'sobre_costo'
      ? `PV = costo unitario × (1 + ${hoja.margen_pct}%)`
      : `PV = costo unitario ÷ (1 − ${hoja.margen_pct}%)`

  return (
    <div className="mt-6 border-t border-borde pt-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">Margen y precio de venta</h3>

      <Rejilla columnas={4}>
        <Cifra etiqueta="Costo de referencia" valor={copPreciso(hoja.costo_unitario)} tamano="sm" />
        <Cifra
          etiqueta="Método"
          valor={hoja.margen_metodo === 'sobre_costo' ? 'Sobre el costo' : 'Sobre la venta'}
          tamano="sm"
          pie={origen}
        />
        <Cifra etiqueta="Porcentaje aplicado" valor={pct(hoja.margen_pct, 2)} tamano="sm" pie={formula} />
        <Cifra
          etiqueta="Precio de venta sugerido"
          valor={hoja.precio_sugerido == null ? 'no calculable' : cop(hoja.precio_sugerido)}
          tono={hoja.precio_sugerido == null ? 'negativo' : 'acento'}
          tamano="sm"
          pie={
            hoja.utilidad_unitaria == null
              ? undefined
              : `Utilidad por unidad: ${cop(hoja.utilidad_unitaria)}`
          }
        />
      </Rejilla>

      {hoja.precio_sugerido == null && hoja.costo_unitario > 0 && (
        <div className="mt-3">
          <Aviso tono="negativo" titulo="No se puede calcular el precio">
            {hoja.margen_metodo === 'sobre_precio' && hoja.margen_pct >= 100 ? (
              <>
                Un margen sobre la venta del {pct(hoja.margen_pct, 0)} es imposible: el margen tiene que
                ser <strong>menor que 100%</strong>. Con 100% el precio tendría que ser infinito para que
                el costo fuera cero. Bajá el porcentaje o pasá a recargo sobre el costo.
              </>
            ) : (
              'Revisá el porcentaje de margen.'
            )}
          </Aviso>
        </div>
      )}
    </div>
  )
}
