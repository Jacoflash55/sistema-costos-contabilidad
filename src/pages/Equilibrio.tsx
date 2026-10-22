import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  Aviso,
  Boton,
  Campo,
  CeldaEditable,
  Cifra,
  InputCifra,
  Pestanas,
  Pildora,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../components/ui'
import type { Columna } from '../components/ui'
import { useEstado } from '../contexto'
import {
  equilibrioMezcla,
  precioParaUtilidad,
  puntoEquilibrio,
  repartoFijos,
  tablaEscenarios,
  tiposDeUtilidad,
  unidadesParaUtilidad,
} from '../lib/equilibrio'
import type { FilaEscenario, ProductoEscenario } from '../lib/equilibrio'
import { cantidad as fmtCantidad, cop, copCorto, copPreciso, pct } from '../lib/formato'
import { precioSugerido } from '../lib/hoja'
import type { ID, Mes } from '../lib/tipos'
import { unidadCorta } from '../lib/unidades'

type Seccion = 'productos' | 'objetivo' | 'escenarios' | 'utilidad' | 'mezcla'

/** La marca de de dónde salió un número: del sistema, o de la mano del usuario. */
function Origen({ manual }: { manual: boolean }) {
  return <Pildora tono={manual ? 'aviso' : 'neutro'}>{manual ? 'A mano' : 'Derivado'}</Pildora>
}

export function Equilibrio() {
  const { calculado } = useEstado()
  const [seccion, setSeccion] = useState<Seccion>('productos')

  const periodos = calculado.periodosCIF
  const [periodo, setPeriodo] = useState<Mes>('')
  const periodoActivo = periodos.includes(periodo) ? periodo : (periodos[periodos.length - 1] ?? '')

  const escenario = periodoActivo ? calculado.escenariosEquilibrio[periodoActivo] : undefined

  if (!escenario) {
    return (
      <Tarjeta>
        <TituloSeccion nota="Hace falta al menos un período con órdenes o con CIF registrados.">
          Punto de equilibrio
        </TituloSeccion>
        <Aviso tono="aviso">
          Todavía no hay nada que analizar. Cargá órdenes de producción y los CIF del período, o importá
          un respaldo.
        </Aviso>
      </Tarjeta>
    )
  }

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion
          nota="Cuánto hay que vender para no perder, y qué precio deja la utilidad que se busca."
          acciones={
            periodos.length > 1 && (
              <Selector<Mes>
                valor={periodoActivo}
                onChange={setPeriodo}
                opciones={periodos.map((p) => ({ valor: p, texto: p }))}
              />
            )
          }
        >
          Punto de equilibrio · {periodoActivo}
        </TituloSeccion>

        <CostosFijos periodo={periodoActivo} />
      </Tarjeta>

      <Pestanas<Seccion>
        valor={seccion}
        onChange={setSeccion}
        opciones={[
          { valor: 'productos', texto: 'Por producto', insignia: escenario.productos.length || undefined },
          { valor: 'objetivo', texto: 'Utilidad objetivo' },
          { valor: 'escenarios', texto: 'Escenarios de ganancia' },
          { valor: 'utilidad', texto: 'Tipos de utilidad' },
          { valor: 'mezcla', texto: 'La empresa (mezcla)' },
        ]}
      />

      {seccion === 'productos' && <PorProducto periodo={periodoActivo} />}
      {seccion === 'objetivo' && <UtilidadObjetivo periodo={periodoActivo} />}
      {seccion === 'escenarios' && <Escenarios periodo={periodoActivo} />}
      {seccion === 'utilidad' && <TiposUtilidad periodo={periodoActivo} />}
      {seccion === 'mezcla' && <Mezcla periodo={periodoActivo} />}

      <p className="text-xs text-tenue">
        Modelo costo-volumen-utilidad ACADÉMICO, con sus supuestos: todo lo que se produce se vende, el
        precio no cambia con el volumen, los fijos son fijos en el rango relevante y los variables son
        proporcionales. Sirve para decidir y para el taller; no es una proyección financiera.
      </p>
    </div>
  )
}

// =====================================================================
// Los costos fijos del período
// =====================================================================

function CostosFijos({ periodo }: { periodo: Mes }) {
  const { calculado, fijarSupuestoEquilibrio, limpiarSupuestosEquilibrio } = useEstado()
  const escenario = calculado.escenariosEquilibrio[periodo]
  const { bases } = escenario

  const ETIQUETA_ORIGEN = {
    cif: 'CIF de planta',
    gasto: 'Gasto del período',
    nomina: 'Nómina',
  } as const

  return (
    <div className="space-y-4">
      <Rejilla columnas={4}>
        <div>
          <Cifra
            etiqueta="Costos fijos del período"
            valor={cop(escenario.costos_fijos)}
            tono={escenario.origen_costos_fijos === 'manual' ? 'aviso' : 'neutro'}
            pie={
              escenario.origen_costos_fijos === 'manual'
                ? `El sistema derivó ${cop(bases.costos_fijos)}`
                : `${bases.lineas_fijas.length} línea(s) clasificadas como fijas`
            }
          />
          <div className="mt-2 flex items-center gap-2">
            <InputCifra
              valor={escenario.costos_fijos}
              paso={100_000}
              onChange={(n) => fijarSupuestoEquilibrio(periodo, null, { costos_fijos: n })}
            />
            {escenario.origen_costos_fijos === 'manual' && (
              <Boton
                variante="fantasma"
                titulo="Volver a los costos fijos que el sistema deriva"
                onClick={() => fijarSupuestoEquilibrio(periodo, null, { costos_fijos: null })}
              >
                ↺
              </Boton>
            )}
          </div>
        </div>
        <Cifra
          etiqueta="CIF variable del período"
          valor={cop(bases.cif_variable)}
          tamano="sm"
          pie="Se reparte por unidad"
        />
        <Cifra
          etiqueta="Gasto variable del período"
          valor={cop(bases.gasto_variable)}
          tamano="sm"
          pie="Comisiones y demás gasto de categoría variable"
        />
        <Cifra
          etiqueta="Mano de obra variable"
          valor={cop(bases.mano_obra_variable)}
          tamano="sm"
          pie={`${fmtCantidad(bases.unidades_totales, 0)} unidades producidas en el mes`}
        />
      </Rejilla>

      <Tabla
        columnas={[
          { clave: 'concepto', titulo: 'Concepto fijo', valor: (l) => l.concepto, render: (l) => l.concepto },
          {
            clave: 'origen',
            titulo: 'De dónde sale',
            render: (l) => (
              <span className="text-xs text-suave">
                {ETIQUETA_ORIGEN[l.origen]}
                {l.detalle && <span className="text-tenue"> · {l.detalle}</span>}
              </span>
            ),
          },
          {
            clave: 'monto',
            titulo: 'Monto',
            alineacion: 'der',
            valor: (l) => l.monto,
            render: (l) => <span className="cifra tabular-nums">{cop(l.monto)}</span>,
          },
        ]}
        filas={bases.lineas_fijas}
        claveFila={(l, i) => `${l.origen}-${l.concepto}-${i}`}
        vacio="No hay ningún costo fijo clasificado en este período."
        pie={
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-suave">
              Total derivado
              {escenario.origen_costos_fijos === 'manual' && ' (reemplazado a mano arriba)'}
            </span>
            <span className="cifra font-semibold tabular-nums">{cop(bases.costos_fijos)}</span>
          </div>
        }
      />

      {bases.avisos.map((a, i) => (
        <Aviso key={i} tono="aviso">
          {a}
        </Aviso>
      ))}

      {escenario.hay_supuestos && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-aviso/40 px-3 py-2">
          <p className="text-xs text-suave">
            Hay números puestos a mano en este período. Los que están sin tocar se siguen derivando.
          </p>
          <Boton variante="fantasma" onClick={() => limpiarSupuestosEquilibrio(periodo)}>
            Volver todo a lo derivado
          </Boton>
        </div>
      )}

      <p className="text-xs text-tenue">
        <strong>Qué es fijo y qué es variable.</strong> Lo decide el campo «comportamiento» de cada
        categoría de CIF (se edita en la pantalla de CIF) y, en la nómina, el indicador de mano de obra
        fija de cada trabajador —por defecto, un mensual es fijo y uno por hora es variable—. Fijo o
        variable y costo o gasto son dos preguntas distintas: acá entran los dos, porque la pregunta es
        cuánto hay que vender para cubrir TODO.
      </p>
    </div>
  )
}

// =====================================================================
// Por producto
// =====================================================================

interface FilaProducto {
  p: ProductoEscenario
  pe: ReturnType<typeof puntoEquilibrio>
}

function PorProducto({ periodo }: { periodo: Mes }) {
  const { calculado, fijarSupuestoEquilibrio } = useEstado()
  const escenario = calculado.escenariosEquilibrio[periodo]

  const filas: FilaProducto[] = useMemo(
    () =>
      escenario.productos.map((p) => ({
        p,
        pe: puntoEquilibrio(escenario.costos_fijos, p.precio_usado, p.cvu_usado),
      })),
    [escenario],
  )

  const [verGrafica, setVerGrafica] = useState<ID | null>(null)

  const columnas: Columna<FilaProducto>[] = [
    {
      clave: 'producto',
      titulo: 'Producto',
      valor: (f) => f.p.nombre,
      render: (f) => (
        <div>
          <p className="font-medium">{f.p.nombre}</p>
          <p className="text-xs text-tenue">
            {f.p.codigo} · {fmtCantidad(f.p.unidades, 0)} {unidadCorta(f.p.unidad)} en el mes
          </p>
        </div>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio de venta',
      alineacion: 'der',
      valor: (f) => f.p.precio_usado,
      render: (f) => (
        <div>
          <CeldaEditable
            valor={f.p.precio_usado}
            formato={(n) => cop(n)}
            paso={1_000}
            onChange={(n) => fijarSupuestoEquilibrio(periodo, f.p.producto_id, { precio_venta: n })}
          />
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <Origen manual={f.p.origen_precio_usado === 'manual'} />
            {f.p.origen_precio_usado === 'manual' && (
              <button
                type="button"
                className="text-xs underline opacity-60"
                onClick={() => fijarSupuestoEquilibrio(periodo, f.p.producto_id, { precio_venta: null })}
              >
                volver
              </button>
            )}
          </div>
        </div>
      ),
    },
    {
      clave: 'cvu',
      titulo: 'Costo variable unitario',
      alineacion: 'der',
      valor: (f) => f.p.cvu_usado,
      render: (f) => (
        <div>
          <CeldaEditable
            valor={f.p.cvu_usado}
            formato={(n) => copPreciso(n)}
            paso={500}
            onChange={(n) =>
              fijarSupuestoEquilibrio(periodo, f.p.producto_id, { costo_variable_unitario: n })
            }
          />
          <p className="mt-0.5 text-right text-xs text-tenue">
            {copCorto(f.p.material_unitario)} material
            {f.p.cif_variable_unitario > 0 && ` + ${copCorto(f.p.cif_variable_unitario)} CIF`}
            {f.p.gasto_variable_unitario > 0 && ` + ${copCorto(f.p.gasto_variable_unitario)} gasto`}
            {f.p.mano_obra_variable_unitaria > 0 && ` + ${copCorto(f.p.mano_obra_variable_unitaria)} MO`}
          </p>
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <Origen manual={f.p.origen_cvu === 'manual'} />
            {f.p.origen_cvu === 'manual' && (
              <button
                type="button"
                className="text-xs underline opacity-60"
                onClick={() =>
                  fijarSupuestoEquilibrio(periodo, f.p.producto_id, { costo_variable_unitario: null })
                }
              >
                volver
              </button>
            )}
          </div>
        </div>
      ),
    },
    {
      clave: 'mc',
      titulo: 'Margen de contribución',
      alineacion: 'der',
      valor: (f) => f.pe.margen_contribucion,
      render: (f) => (
        <div>
          <p
            className={`cifra tabular-nums ${f.pe.margen_contribucion > 0 ? '' : 'text-negativo font-semibold'}`}
          >
            {copPreciso(f.pe.margen_contribucion)}
          </p>
          <p className="text-xs text-tenue">
            razón {pct(f.pe.razon_contribucion * 100, 1)}
          </p>
        </div>
      ),
    },
    {
      clave: 'pe',
      titulo: 'Punto de equilibrio',
      alineacion: 'der',
      valor: (f) => (f.pe.valido ? f.pe.unidades : Number.POSITIVE_INFINITY),
      render: (f) =>
        f.pe.valido ? (
          <div>
            <p className="cifra font-semibold tabular-nums">
              {fmtCantidad(f.pe.unidades_enteras, 0)} {unidadCorta(f.p.unidad)}
            </p>
            <p className="text-xs text-tenue">{cop(f.pe.pesos)}</p>
            <p className="text-xs text-suave">
              {f.p.unidades >= f.pe.unidades ? '✓ el mes lo superó' : `faltaron ${fmtCantidad(f.pe.unidades - f.p.unidades, 0)}`}
            </p>
          </div>
        ) : (
          <Pildora tono="negativo">Sin equilibrio</Pildora>
        ),
    },
    {
      clave: 'grafica',
      titulo: '',
      alineacion: 'centro',
      render: (f) => (
        <Boton
          variante="fantasma"
          onClick={() => setVerGrafica(verGrafica === f.p.producto_id ? null : f.p.producto_id)}
          titulo="Ver la gráfica de ingresos contra costo total"
        >
          {verGrafica === f.p.producto_id ? 'Ocultar' : '📈'}
        </Boton>
      ),
    },
  ]

  const conProblema = filas.filter((f) => !f.pe.valido)
  const elegida = filas.find((f) => f.p.producto_id === verGrafica)

  return (
    <div className="space-y-4">
      <Tarjeta>
        <TituloSeccion nota="El precio y el costo variable unitario se pueden escribir a mano: son los datos que provee la empresa.">
          Equilibrio por producto
        </TituloSeccion>

        <Tabla
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.p.producto_id}
          ordenInicial={{ clave: 'producto', asc: true }}
          resaltarFila={(f) => (f.pe.valido ? null : 'negativo')}
          vacio="Este período no tiene productos con unidades producidas."
        />
      </Tarjeta>

      {conProblema.map((f) => (
        <Aviso key={f.p.producto_id} tono="negativo" titulo={`${f.p.nombre}: no hay punto de equilibrio`}>
          <p>{f.pe.problema}</p>
          <p className="mt-1 text-xs opacity-80">
            Precio {cop(f.p.precio_usado)} contra un costo variable de {copPreciso(f.p.cvu_usado)} por
            unidad. No se muestra un número de unidades porque no existe: con ese precio, vender más
            agranda la pérdida.
          </p>
        </Aviso>
      ))}

      {escenario.productos.some((p) => p.faltantes.length > 0) && (
        <Aviso tono="aviso" titulo="Datos que faltan">
          <ul className="list-disc space-y-0.5 pl-4">
            {escenario.productos.flatMap((p) =>
              p.faltantes.map((f, i) => (
                <li key={`${p.producto_id}-${i}`}>
                  <strong>{p.nombre}:</strong> {f}
                </li>
              )),
            )}
          </ul>
        </Aviso>
      )}

      {elegida && elegida.pe.valido && <GraficaEquilibrio fila={elegida} />}
    </div>
  )
}

// =====================================================================
// La gráfica
// =====================================================================

function GraficaEquilibrio({ fila }: { fila: FilaProducto }) {
  const { p, pe } = fila

  /* Hasta el doble del equilibrio: así el cruce queda en la mitad y se ve. */
  const tope = Math.max(pe.unidades * 2, p.unidades * 1.2, 10)

  const datos = useMemo(() => {
    const pasos = 24
    return Array.from({ length: pasos + 1 }, (_, i) => {
      const q = (tope / pasos) * i
      return {
        q,
        ingresos: q * p.precio_usado,
        costo_total: pe.costos_fijos + q * p.cvu_usado,
        costos_fijos: pe.costos_fijos,
      }
    })
  }, [tope, p.precio_usado, p.cvu_usado, pe.costos_fijos])

  return (
    <Tarjeta>
      <TituloSeccion nota={`Donde se cruzan las dos líneas está el equilibrio: ${fmtCantidad(pe.unidades_enteras, 0)} ${unidadCorta(p.unidad)}.`}>
        {p.nombre} · ingresos contra costo total
      </TituloSeccion>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 24, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="var(--borde)" strokeDasharray="3 3" />
            <XAxis
              dataKey="q"
              type="number"
              domain={[0, tope]}
              tickFormatter={(v: number) => fmtCantidad(v, 0)}
              stroke="var(--tenue)"
              fontSize={11}
              label={{ value: `Unidades (${unidadCorta(p.unidad)})`, position: 'insideBottom', offset: -14, fill: 'var(--tenue)', fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v: number) => copCorto(v)}
              stroke="var(--tenue)"
              fontSize={11}
              width={70}
            />
            <Tooltip
              formatter={(v) => cop(Number(v))}
              labelFormatter={(v) => `${fmtCantidad(Number(v), 0)} ${unidadCorta(p.unidad)}`}
              contentStyle={{
                background: 'var(--panel)',
                border: '1px solid var(--borde)',
                borderRadius: 10,
                fontSize: 12,
              }}
            />
            <Legend verticalAlign="top" align="right" height={26} wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              x={pe.unidades}
              stroke="var(--acento)"
              strokeDasharray="4 4"
              label={{ value: 'equilibrio', fill: 'var(--acento)', fontSize: 11, position: 'top' }}
            />
            <Line
              type="monotone"
              dataKey="ingresos"
              name="Ingresos"
              stroke="var(--positivo)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="costo_total"
              name="Costo total"
              stroke="var(--negativo)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="costos_fijos"
              name="Costos fijos"
              stroke="var(--tenue)"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-tenue">
        A la izquierda del cruce, el costo total va por encima de los ingresos: pérdida. A la derecha,
        cada unidad deja {copPreciso(pe.margen_contribucion)} de margen de contribución.
      </p>
    </Tarjeta>
  )
}

// =====================================================================
// Utilidad objetivo
// =====================================================================

type ModoObjetivo = 'pesos' | 'margen'

function UtilidadObjetivo({ periodo }: { periodo: Mes }) {
  const { calculado, config } = useEstado()
  const escenario = calculado.escenariosEquilibrio[periodo]

  const [productoId, setProductoId] = useState<ID>('')
  const elegido = escenario.productos.find((p) => p.producto_id === productoId) ?? escenario.productos[0]

  const [modo, setModo] = useState<ModoObjetivo>('pesos')
  const [utilidad, setUtilidad] = useState(1_000_000)
  const [margen, setMargen] = useState(config.parametros.margen_por_defecto_pct)
  const [volumen, setVolumen] = useState(0)

  /* El volumen arranca en lo que se produjo en el mes: es el dato que hay. */
  const q = volumen > 0 ? volumen : (elegido?.unidades ?? 0)

  if (!elegido) {
    return (
      <Tarjeta>
        <Aviso tono="aviso">Este período no tiene productos con unidades producidas.</Aviso>
      </Tarjeta>
    )
  }

  const cf = escenario.costos_fijos
  const cvu = elegido.cvu_usado

  /* --- camino 1: la empresa dice la utilidad en pesos --- */
  const porPesos = precioParaUtilidad(cf, cvu, q, utilidad)

  /* --- camino 2: la empresa dice el margen sobre ventas --- */
  const costoUnitarioTotal = q > 0 ? cvu + cf / q : 0
  const porMargen = precioSugerido(
    costoUnitarioTotal,
    'sobre_precio',
    margen,
    config.parametros.redondeo_precio_multiplo,
  )
  const utilidadDelMargen =
    porMargen.precio != null ? q * (porMargen.precio - costoUnitarioTotal) : 0

  /* El precio y la utilidad que el resto de la pantalla va a usar. */
  const precioFinal = modo === 'pesos' ? porPesos.precio : (porMargen.precio ?? 0)
  const utilidadFinal = modo === 'pesos' ? utilidad : utilidadDelMargen
  const problema = modo === 'pesos' ? porPesos.problema : porMargen.problema

  /* Con el precio ya resuelto: cuántas unidades hacen falta y dónde queda el equilibrio. */
  const necesarias = unidadesParaUtilidad(cf, precioFinal, cvu, utilidadFinal)
  const equilibrio = puntoEquilibrio(cf, precioFinal, cvu)

  /*
    EL REDONDEO LO PONE `precioSugerido`, NO ESTA PANTALLA.

    En el modo «% sobre ventas» el precio ya viene de ahi, asi que ya esta
    redondeado al multiplo de Configuracion. En el modo «pesos» la formula
    devuelve el precio exacto, y se pasa por la misma funcion para ofrecer el
    redondeado al lado, sin reemplazarlo: el exacto es el que deja la utilidad
    pedida al peso.
  */
  const multiplo = config.parametros.redondeo_precio_multiplo
  const redondeado = precioSugerido(
    porPesos.costo_unitario_total,
    'sobre_precio',
    porPesos.margen_sobre_venta_pct,
    multiplo,
  )

  const pieDelPrecio =
    modo === 'margen'
      ? multiplo > 1
        ? `redondeado al múltiplo de ${cop(multiplo)}`
        : 'sin redondeo (Configuración)'
      : redondeado.precio != null && redondeado.precio !== porPesos.precio
        ? `redondeado quedaría en ${cop(redondeado.precio)}`
        : 'sin redondeo (Configuración)'

  return (
    <div className="space-y-4">
      <Tarjeta>
        <TituloSeccion nota="La pregunta al revés: no «cuánto gano con este precio», sino «qué precio necesito para ganar esto».">
          Precio por utilidad objetivo
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Campo etiqueta="Producto">
            {(id) => (
              <Selector<ID>
                id={id}
                valor={elegido.producto_id}
                onChange={setProductoId}
                opciones={escenario.productos.map((p) => ({ valor: p.producto_id, texto: p.nombre }))}
              />
            )}
          </Campo>

          <Campo etiqueta="La utilidad se pide en">
            {(id) => (
              <Selector<ModoObjetivo>
                id={id}
                valor={modo}
                onChange={setModo}
                opciones={[
                  { valor: 'pesos', texto: 'Pesos del período' },
                  { valor: 'margen', texto: '% sobre ventas' },
                ]}
              />
            )}
          </Campo>

          {modo === 'pesos' ? (
            <Campo etiqueta="Utilidad objetivo" ayuda="Del período completo, no por unidad">
              {(id) => <InputCifra id={id} valor={utilidad} paso={100_000} onChange={setUtilidad} />}
            </Campo>
          ) : (
            <Campo etiqueta="Margen sobre ventas" ayuda="PV = costo unitario total ÷ (1 − m)">
              {(id) => (
                <InputCifra id={id} valor={margen} paso={1} sufijo="%" onChange={setMargen} />
              )}
            </Campo>
          )}

          <Campo
            etiqueta="Volumen esperado"
            ayuda={volumen > 0 ? undefined : `En blanco usa lo del mes: ${fmtCantidad(elegido.unidades, 0)}`}
          >
            {(id) => (
              <InputCifra
                id={id}
                valor={volumen}
                paso={10}
                sufijo={unidadCorta(elegido.unidad)}
                onChange={setVolumen}
              />
            )}
          </Campo>
        </Rejilla>

        {problema ? (
          <Aviso tono="negativo" className="mt-4">
            {problema}
          </Aviso>
        ) : (
          <div className="mt-4 space-y-4">
            <Rejilla columnas={4}>
              <Cifra
                etiqueta="Costo unitario total"
                valor={copPreciso(modo === 'pesos' ? porPesos.costo_unitario_total : costoUnitarioTotal)}
                tamano="sm"
                pie={`${copPreciso(cvu)} variable + ${copPreciso(cf / q)} de fijos a ${fmtCantidad(q, 0)} unidades`}
              />
              <Cifra
                etiqueta="Precio sugerido"
                valor={cop(precioFinal)}
                tono="acento"
                pie={pieDelPrecio}
              />
              <Cifra
                etiqueta="Margen sobre la venta"
                valor={pct(
                  modo === 'pesos' ? porPesos.margen_sobre_venta_pct : margen,
                  2,
                )}
                tamano="sm"
                pie={`markup sobre el costo ${pct(
                  modo === 'pesos'
                    ? porPesos.markup_sobre_costo_pct
                    : costoUnitarioTotal > 0 && porMargen.precio != null
                      ? ((porMargen.precio - costoUnitarioTotal) / costoUnitarioTotal) * 100
                      : 0,
                  2,
                )}`}
              />
              <Cifra
                etiqueta={modo === 'pesos' ? 'Utilidad por unidad' : 'Utilidad del período'}
                valor={
                  modo === 'pesos' ? copPreciso(porPesos.utilidad_unitaria) : cop(utilidadDelMargen)
                }
                tono="positivo"
                tamano="sm"
                pie={
                  modo === 'pesos'
                    ? `${cop(utilidad)} entre ${fmtCantidad(q, 0)} unidades`
                    : `${pct(margen, 1)} de ${cop(q * (porMargen.precio ?? 0))} facturados`
                }
              />
            </Rejilla>

            <div className="rounded-lg border border-borde bg-panel-alto p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-tenue">
                Con ese precio
              </p>
              <Rejilla columnas={3}>
                <Cifra
                  etiqueta="Equilibrio"
                  valor={
                    equilibrio.valido
                      ? `${fmtCantidad(equilibrio.unidades_enteras, 0)} ${unidadCorta(elegido.unidad)}`
                      : '—'
                  }
                  tamano="sm"
                  pie={equilibrio.valido ? cop(equilibrio.pesos) : equilibrio.problema}
                />
                <Cifra
                  etiqueta="Unidades para la utilidad"
                  valor={
                    necesarias.valido
                      ? `${fmtCantidad(necesarias.unidades_enteras, 0)} ${unidadCorta(elegido.unidad)}`
                      : '—'
                  }
                  tamano="sm"
                  pie={necesarias.valido ? cop(necesarias.pesos) : necesarias.problema}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-tenue">
                    El volumen esperado
                  </p>
                  {equilibrio.valido ? (
                    <div className="mt-1">
                      <Pildora tono={q >= equilibrio.unidades ? 'positivo' : 'negativo'}>
                        {q >= equilibrio.unidades ? 'por encima del equilibrio' : 'por debajo del equilibrio'}
                      </Pildora>
                      <p className="mt-1 text-xs text-suave">
                        {q >= equilibrio.unidades
                          ? `${fmtCantidad(q - equilibrio.unidades, 0)} unidades de margen de seguridad (${pct(
                              ((q - equilibrio.unidades) / q) * 100,
                              1,
                            )} de las ventas)`
                          : `faltan ${fmtCantidad(equilibrio.unidades - q, 0)} unidades solo para no perder`}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-suave">—</p>
                  )}
                </div>
              </Rejilla>
            </div>
          </div>
        )}
      </Tarjeta>

      <p className="text-xs text-tenue">
        El precio no se calcula dos veces: el margen y el markup que salen de acá se pasan por la misma
        función que usa la hoja de costos (<code>precioSugerido</code>), y el redondeo es el de
        Configuración. Hay un test que compara los dos caminos.
      </p>
    </div>
  )
}

// =====================================================================
// =====================================================================
// Escenarios de ganancia
// =====================================================================

function Escenarios({ periodo }: { periodo: Mes }) {
  const { calculado } = useEstado()
  const escenario = calculado.escenariosEquilibrio[periodo]

  const [productoId, setProductoId] = useState<ID>('')
  const elegido = escenario.productos.find((p) => p.producto_id === productoId) ?? escenario.productos[0]

  const [volumen, setVolumen] = useState(0)

  if (!elegido) {
    return (
      <Tarjeta>
        <Aviso tono="aviso">Este período no tiene productos con unidades producidas.</Aviso>
      </Tarjeta>
    )
  }

  /* En blanco usa lo que se produjo en el mes: es el dato que hay. */
  const q = volumen > 0 ? volumen : elegido.unidades

  const filas = tablaEscenarios(escenario.costos_fijos, elegido.precio_usado, elegido.cvu_usado, {
    volumenEsperado: q,
  })

  const pe = puntoEquilibrio(escenario.costos_fijos, elegido.precio_usado, elegido.cvu_usado)

  const columnas: Columna<FilaEscenario>[] = [
    {
      clave: 'etiqueta',
      titulo: 'Escenario',
      valor: (f) => f.unidades,
      render: (f) => (
        <div>
          <p className={f.es_equilibrio ? 'font-semibold text-acento' : 'font-medium'}>{f.etiqueta}</p>
          <p className="text-xs text-tenue">
            {fmtCantidad(f.unidades, 0)} {unidadCorta(elegido.unidad)}
          </p>
        </div>
      ),
    },
    {
      clave: 'ventas',
      titulo: 'Ventas',
      alineacion: 'der',
      valor: (f) => f.ventas,
      render: (f) => <span className="cifra tabular-nums">{cop(f.ventas)}</span>,
    },
    {
      clave: 'cv',
      titulo: '− Costos variables',
      alineacion: 'der',
      valor: (f) => f.costos_variables,
      render: (f) => <span className="cifra tabular-nums text-suave">{cop(f.costos_variables)}</span>,
    },
    {
      clave: 'mc',
      titulo: '= Margen de contribución',
      alineacion: 'der',
      valor: (f) => f.margen_contribucion,
      render: (f) => <span className="cifra tabular-nums">{cop(f.margen_contribucion)}</span>,
    },
    {
      clave: 'cf',
      titulo: '− Costos fijos',
      alineacion: 'der',
      valor: (f) => f.costos_fijos,
      render: (f) => <span className="cifra tabular-nums text-suave">{cop(f.costos_fijos)}</span>,
    },
    {
      clave: 'utilidad',
      titulo: '= Utilidad operativa',
      alineacion: 'der',
      valor: (f) => f.utilidad_operativa,
      render: (f) => (
        <span
          className={`cifra font-semibold tabular-nums ${
            f.utilidad_operativa > 0 ? 'text-positivo' : f.utilidad_operativa < 0 ? 'text-negativo' : ''
          }`}
        >
          {cop(f.utilidad_operativa)}
        </span>
      ),
    },
    {
      clave: 'margen',
      titulo: '%',
      alineacion: 'der',
      valor: (f) => f.margen_operativo,
      render: (f) => (
        <span className="text-xs text-suave">
          {f.ventas > 0 ? pct(f.margen_operativo * 100, 1) : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Tarjeta>
        <TituloSeccion
          nota="El estado de resultados por costeo variable, repetido a varios volúmenes."
          acciones={
            <div className="flex flex-wrap items-end gap-3">
              <Campo etiqueta="Producto">
                {(id) => (
                  <Selector<ID>
                    id={id}
                    valor={elegido.producto_id}
                    onChange={setProductoId}
                    opciones={escenario.productos.map((p) => ({ valor: p.producto_id, texto: p.nombre }))}
                  />
                )}
              </Campo>
              <Campo
                etiqueta="Volumen esperado"
                ayuda={volumen > 0 ? undefined : `En blanco: ${fmtCantidad(elegido.unidades, 0)}`}
              >
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={volumen}
                    paso={10}
                    sufijo={unidadCorta(elegido.unidad)}
                    onChange={setVolumen}
                  />
                )}
              </Campo>
            </div>
          }
        >
          Escenarios de ganancia · {elegido.nombre}
        </TituloSeccion>

        <Tabla
          columnas={columnas}
          filas={filas}
          claveFila={(f, i) => `${f.etiqueta}-${i}`}
          resaltarFila={(f) => (f.es_equilibrio ? 'acento' : null)}
        />

        {pe.valido ? (
          <Aviso tono="neutro" className="mt-4" titulo="Por qué la utilidad crece más rápido que las ventas">
            <p>
              Los costos fijos son los mismos en todas las filas: {cop(escenario.costos_fijos)}. Hasta el
              equilibrio, cada unidad vendida se gasta su margen de contribución en cubrirlos. Pasado ese
              punto ya están cubiertos, así que{' '}
              <strong>cada unidad extra deja sus {copPreciso(pe.margen_contribucion)} completos</strong>.
              Por eso duplicar el volumen no duplica la utilidad: la multiplica mucho más. Eso se llama
              apalancamiento operativo.
            </p>
          </Aviso>
        ) : (
          <Aviso tono="negativo" className="mt-4">
            {pe.problema} Por eso la tabla no muestra múltiplos del equilibrio: no hay equilibrio del cual
            sacarlos.
          </Aviso>
        )}
      </Tarjeta>
    </div>
  )
}

// =====================================================================
// Los tres tipos de utilidad
// =====================================================================

function TiposUtilidad({ periodo }: { periodo: Mes }) {
  const { calculado } = useEstado()
  const escenario = calculado.escenariosEquilibrio[periodo]

  const [productoId, setProductoId] = useState<ID>('')
  const elegido = escenario.productos.find((p) => p.producto_id === productoId) ?? escenario.productos[0]

  const [volumen, setVolumen] = useState(0)
  const [tasa, setTasa] = useState(35)

  if (!elegido) {
    return (
      <Tarjeta>
        <Aviso tono="aviso">Este período no tiene productos con unidades producidas.</Aviso>
      </Tarjeta>
    )
  }

  const q = volumen > 0 ? volumen : elegido.unidades
  const reparto = repartoFijos(escenario.bases)

  /*
    OJO con el reparto de fijos: la pantalla usa los DERIVADOS, no el total que
    el usuario pudo haber escrito a mano. Si escribió un total propio, no hay
    forma de saber qué parte de ese número es de fábrica y qué parte es gasto,
    así que se avisa en vez de adivinar.
  */
  const hayFijosManuales = escenario.origen_costos_fijos === 'manual'

  const r = tiposDeUtilidad({
    unidades: q,
    precio: elegido.precio_usado,
    costo_variable_unitario: elegido.cvu_usado,
    costos_fijos_produccion: reparto.produccion,
    gastos_del_periodo: reparto.gastos,
    tasa_impuesto_pct: tasa,
  })

  const renglon = (
    etiqueta: string,
    valor: number,
    opciones: { resta?: boolean; fuerte?: boolean; margen?: number; nota?: string } = {},
  ) => (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 ${
        opciones.fuerte ? 'border-t border-borde' : ''
      }`}
    >
      <div>
        <p className={opciones.fuerte ? 'text-sm font-semibold' : 'text-sm text-suave'}>
          {opciones.resta && <span className="text-tenue">− </span>}
          {etiqueta}
        </p>
        {opciones.nota && <p className="text-xs text-tenue">{opciones.nota}</p>}
      </div>
      <div className="text-right">
        <p
          className={`cifra tabular-nums ${opciones.fuerte ? 'text-base font-semibold' : 'text-sm'} ${
            opciones.fuerte && valor < 0 ? 'text-negativo' : opciones.fuerte && valor > 0 ? 'text-positivo' : ''
          }`}
        >
          {cop(valor)}
        </p>
        {opciones.margen != null && (
          <p className="text-xs text-tenue">{pct(opciones.margen * 100, 1)} de las ventas</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Tarjeta>
        <TituloSeccion
          nota="«Utilidad» a secas no dice nada: hay tres, y cada una resta cosas distintas."
          acciones={
            <div className="flex flex-wrap items-end gap-3">
              <Campo etiqueta="Producto">
                {(id) => (
                  <Selector<ID>
                    id={id}
                    valor={elegido.producto_id}
                    onChange={setProductoId}
                    opciones={escenario.productos.map((p) => ({ valor: p.producto_id, texto: p.nombre }))}
                  />
                )}
              </Campo>
              <Campo
                etiqueta="Unidades vendidas"
                ayuda={volumen > 0 ? undefined : `En blanco: ${fmtCantidad(elegido.unidades, 0)}`}
              >
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={volumen}
                    paso={10}
                    sufijo={unidadCorta(elegido.unidad)}
                    onChange={setVolumen}
                  />
                )}
              </Campo>
              <Campo etiqueta="Tasa de impuesto" ayuda="Solo sobre ganancia">
                {(id) => <InputCifra id={id} valor={tasa} paso={1} sufijo="%" onChange={setTasa} />}
              </Campo>
            </div>
          }
        >
          Tipos de utilidad · {elegido.nombre}
        </TituloSeccion>

        {r.valido ? (
          <>
            <div className="rounded-lg border border-borde bg-panel-alto px-4 py-2">
              {renglon('Ventas', r.ventas, {
                nota: `${fmtCantidad(q, 0)} ${unidadCorta(elegido.unidad)} × ${cop(elegido.precio_usado)}`,
              })}
              {renglon('Costo de ventas', r.costo_ventas, {
                resta: true,
                nota: `${copPreciso(elegido.cvu_usado)} variable por unidad + ${cop(reparto.produccion)} de fijos de fábrica`,
              })}
              {renglon('Utilidad bruta', r.utilidad_bruta, { fuerte: true, margen: r.margen_bruto })}

              {renglon('Gastos del período', r.gastos_periodo, {
                resta: true,
                nota: 'Administración y ventas: no son costo del producto',
              })}
              {renglon('Utilidad operativa', r.utilidad_operativa, {
                fuerte: true,
                margen: r.margen_operativo,
              })}

              {renglon(`Impuesto (${pct(r.tasa_impuesto, 0)})`, r.impuesto, {
                resta: true,
                nota: r.utilidad_operativa > 0 ? undefined : 'Sin ganancia no se tributa',
              })}
              {renglon('Utilidad neta', r.utilidad_neta, { fuerte: true, margen: r.margen_neto })}
            </div>

            <Rejilla columnas={3}>
              <Cifra
                etiqueta="Margen bruto"
                valor={pct(r.margen_bruto * 100, 1)}
                tamano="sm"
                pie="Lo que deja el producto antes de la oficina"
              />
              <Cifra
                etiqueta="Margen operativo"
                valor={pct(r.margen_operativo * 100, 1)}
                tamano="sm"
                pie="Lo que deja el negocio operando"
              />
              <Cifra
                etiqueta="Margen neto"
                valor={pct(r.margen_neto * 100, 1)}
                tono={r.utilidad_neta > 0 ? 'positivo' : 'negativo'}
                tamano="sm"
                pie="Lo que queda al final"
              />
            </Rejilla>

            <p className="mt-3 text-xs text-tenue">
              <strong>Dónde cae la raya.</strong> El arriendo de la planta está <em>arriba</em>, dentro del
              costo de ventas, porque es costo del producto. El de la oficina está <em>abajo</em>, porque es
              gasto del período. Es la misma distinción por naturaleza de categoría que decide quién entra a
              la hoja de costos, así que los dos módulos no pueden contradecirse.
            </p>

            {hayFijosManuales && (
              <Aviso tono="aviso" className="mt-3" titulo="Los costos fijos están puestos a mano">
                Escribiste un total propio de {cop(escenario.costos_fijos)}, pero acá hay que separar lo de
                fábrica de lo de oficina y no hay forma de saber cómo partir ese número. Este cuadro usa el
                reparto <strong>derivado</strong>: {cop(reparto.produccion)} de fábrica y{' '}
                {cop(reparto.gastos)} de gastos. Las otras pestañas sí usan tu total.
              </Aviso>
            )}
          </>
        ) : (
          <Aviso tono="negativo">{r.problema}</Aviso>
        )}
      </Tarjeta>
    </div>
  )
}

// La mezcla: el equilibrio de la empresa
// =====================================================================

function Mezcla({ periodo }: { periodo: Mes }) {
  const { calculado, fijarSupuestoEquilibrio } = useEstado()
  const escenario = calculado.escenariosEquilibrio[periodo]

  const resultado = useMemo(
    () =>
      equilibrioMezcla(
        escenario.productos.map((p) => ({
          producto_id: p.producto_id,
          nombre: p.nombre,
          unidades_canasta: p.mezcla_unidades,
          precio: p.precio_usado,
          costo_variable_unitario: p.cvu_usado,
        })),
        escenario.costos_fijos,
      ),
    [escenario],
  )

  const unidadDe = (id: ID) => {
    const p = escenario.productos.find((x) => x.producto_id === id)
    return p ? unidadCorta(p.unidad) : 'un'
  }

  const manualDe = (id: ID) =>
    escenario.productos.find((x) => x.producto_id === id)?.origen_mezcla === 'manual'

  return (
    <div className="space-y-4">
      <Tarjeta>
        <TituloSeccion nota="Con varios productos los costos fijos son de la empresa, no de un producto: lo que se resuelve es cuántas «canastas» de la mezcla hay que vender.">
          Equilibrio de la empresa
        </TituloSeccion>

        <Tabla
          columnas={[
            {
              clave: 'producto',
              titulo: 'Producto',
              valor: (l) => l.nombre,
              render: (l) => l.nombre,
            },
            {
              clave: 'canasta',
              titulo: 'Unidades por canasta',
              alineacion: 'der',
              valor: (l) => l.unidades_canasta,
              render: (l) => (
                <div>
                  <CeldaEditable
                    valor={l.unidades_canasta}
                    formato={(n) => fmtCantidad(n, 0)}
                    paso={1}
                    onChange={(n) =>
                      fijarSupuestoEquilibrio(periodo, l.producto_id, { mezcla_unidades: n })
                    }
                  />
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <Origen manual={manualDe(l.producto_id)} />
                    {manualDe(l.producto_id) && (
                      <button
                        type="button"
                        className="text-xs underline opacity-60"
                        onClick={() =>
                          fijarSupuestoEquilibrio(periodo, l.producto_id, { mezcla_unidades: null })
                        }
                      >
                        volver
                      </button>
                    )}
                  </div>
                </div>
              ),
            },
            {
              clave: 'mc',
              titulo: 'MC unitario',
              alineacion: 'der',
              valor: (l) => l.margen_contribucion,
              render: (l) => (
                <span
                  className={`cifra tabular-nums ${l.margen_contribucion > 0 ? '' : 'font-semibold text-negativo'}`}
                >
                  {copPreciso(l.margen_contribucion)}
                </span>
              ),
            },
            {
              clave: 'aporte',
              titulo: 'Aporte por canasta',
              alineacion: 'der',
              valor: (l) => l.aporte_canasta,
              render: (l) => (
                <div>
                  <p className="cifra tabular-nums">{cop(l.aporte_canasta)}</p>
                  {resultado.valido && (
                    <p className="text-xs text-tenue">{pct(l.participacion * 100, 1)} del margen</p>
                  )}
                </div>
              ),
            },
            {
              clave: 'equilibrio',
              titulo: 'En el equilibrio',
              alineacion: 'der',
              valor: (l) => l.unidades,
              render: (l) =>
                resultado.valido ? (
                  <div>
                    <p className="cifra font-semibold tabular-nums">
                      {fmtCantidad(l.unidades_enteras, 0)} {unidadDe(l.producto_id)}
                    </p>
                    <p className="text-xs text-tenue">{cop(l.pesos)}</p>
                  </div>
                ) : (
                  <span className="text-tenue">—</span>
                ),
            },
          ]}
          filas={resultado.lineas}
          claveFila={(l) => l.producto_id}
          vacio="Este período no tiene productos con unidades producidas."
          resaltarFila={(l) => (l.margen_contribucion > 0 ? null : 'negativo')}
        />

        {resultado.valido ? (
          <Rejilla columnas={4}>
            <Cifra
              etiqueta="Margen por canasta"
              valor={cop(resultado.margen_contribucion_canasta)}
              tamano="sm"
              pie={`sobre ${cop(resultado.precio_canasta)} facturados`}
            />
            <Cifra
              etiqueta="Razón de contribución"
              valor={pct(resultado.razon_contribucion * 100, 1)}
              tamano="sm"
              pie="de cada peso vendido"
            />
            <Cifra
              etiqueta="Canastas en el equilibrio"
              valor={fmtCantidad(resultado.canastas, 2)}
              tono="acento"
              pie={`${fmtCantidad(resultado.unidades_totales, 0)} unidades en total`}
            />
            <Cifra
              etiqueta="Ventas en el equilibrio"
              valor={cop(resultado.pesos)}
              tono="acento"
              pie={`contra ${cop(escenario.costos_fijos)} de costos fijos`}
            />
          </Rejilla>
        ) : (
          <Aviso tono="negativo">{resultado.problema}</Aviso>
        )}
      </Tarjeta>

      <Aviso tono="neutro" titulo="La mezcla es un supuesto">
        Las unidades por canasta vienen precargadas con lo que se produjo en el mes. Si cambia la mezcla
        —se venden más mesas y menos bancas— el equilibrio de la empresa cambia aunque no se mueva ni un
        costo, porque cada producto aporta un margen distinto. Por eso el número se lee junto con la
        mezcla que lo produjo, nunca solo.
      </Aviso>
    </div>
  )
}
