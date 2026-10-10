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
  Pestanas,
  Pildora,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../components/ui'
import type { Columna, Tono } from '../components/ui'
import { useEstado } from '../contexto'
import {
  ETIQUETA_BASE,
  ETIQUETA_NATURALEZA,
  UNIDAD_BASE,
  baseEnPesos,
} from '../lib/cif'
import { cantidad as fmtCantidad, cop, copPreciso, pct } from '../lib/formato'
import type {
  BaseTasaCIF,
  CategoriaCIF,
  CIF as ConceptoCIF,
  ID,
  Mes,
  NaturalezaCategoria,
} from '../lib/tipos'

type Seccion = 'conceptos' | 'categorias'

const NATURALEZAS: ReadonlyArray<{ valor: NaturalezaCategoria; texto: string }> = [
  { valor: 'cif', texto: ETIQUETA_NATURALEZA.cif },
  { valor: 'administracion', texto: ETIQUETA_NATURALEZA.administracion },
  { valor: 'ventas', texto: ETIQUETA_NATURALEZA.ventas },
  { valor: 'financiero', texto: ETIQUETA_NATURALEZA.financiero },
]

const TONO_NATURALEZA: Record<NaturalezaCategoria, Tono> = {
  cif: 'acento',
  administracion: 'neutro',
  ventas: 'neutro',
  financiero: 'neutro',
}

const BASES: ReadonlyArray<{ valor: BaseTasaCIF; texto: string }> = (
  Object.keys(ETIQUETA_BASE) as BaseTasaCIF[]
).map((b) => ({ valor: b, texto: ETIQUETA_BASE[b] }))

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Cómo se lee la tasa: $ por unidad, o un % cuando la base son pesos. */
export function tasaLegible(base: BaseTasaCIF, tasa: number): string {
  if (baseEnPesos(base)) return `${pct(tasa * 100, 2)} del ${UNIDAD_BASE[base].replace('$ de ', '')}`
  return `${copPreciso(tasa)} por ${UNIDAD_BASE[base]}`
}

export function CIF() {
  const { cif, calculado, config } = useEstado()
  const [seccion, setSeccion] = useState<Seccion>('conceptos')

  return (
    <div className="space-y-5">
      <Pestanas<Seccion>
        valor={seccion}
        onChange={setSeccion}
        opciones={[
          { valor: 'conceptos', texto: 'Conceptos y tasa', insignia: calculado.conteos.cif || undefined },
          { valor: 'categorias', texto: 'Categorías', insignia: cif.categorias.length || undefined },
        ]}
      />
      {seccion === 'conceptos' ? <Conceptos /> : <Categorias />}
      <p className="text-xs text-tenue">
        La base general de reparto ({ETIQUETA_BASE[config.parametros.base_cif].toLowerCase()}) y de dónde
        sale la tasa se cambian en Configuración.
      </p>
    </div>
  )
}

// =====================================================================
// Conceptos del período y la tasa
// =====================================================================

function Conceptos() {
  const { cif, calculado, crearCIF, borrarCIF } = useEstado()

  const periodos = calculado.periodosCIF
  const [periodo, setPeriodo] = useState<Mes>('')
  const periodoActivo = periodos.includes(periodo) ? periodo : (periodos[periodos.length - 1] ?? '')

  const categoriasActivas = cif.categorias.filter((c) => c.activa)
  const [categoriaId, setCategoriaId] = useState<ID>('')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState(0)
  const [fecha, setFecha] = useState(hoyISO())
  const [documento, setDocumento] = useState('')
  const [presupuestado, setPresupuestado] = useState(false)
  const [mesNuevo, setMesNuevo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const categoriaPorId = useMemo(() => new Map(cif.categorias.map((c) => [c.id, c])), [cif.categorias])
  const tasa = periodoActivo ? calculado.tasaPorPeriodo[periodoActivo] : undefined

  /** El mes al que se registra: el del selector, o uno nuevo escrito a mano. */
  const mesDestino = mesNuevo.trim() || periodoActivo

  const agregar = () => {
    if (!/^\d{4}-\d{2}$/.test(mesDestino)) {
      return setError('El período va en formato AAAA-MM. Escribilo si todavía no existe.')
    }
    if (!categoriaId) return setError('Elegí la categoría: es la que decide si es costo o gasto.')
    if (!concepto.trim()) return setError('Escribí de qué se trata.')
    if (monto <= 0) return setError('El importe tiene que ser mayor que cero.')

    crearCIF({
      fecha,
      periodo: mesDestino,
      categoria_id: categoriaId,
      concepto: concepto.trim(),
      monto,
      documento: documento.trim(),
      presupuestado,
    })
    setConcepto('')
    setMonto(0)
    setDocumento('')
    setMesNuevo('')
    setPeriodo(mesDestino)
    setError(null)
  }

  const delPeriodo = cif.cif.filter((c) => c.periodo === periodoActivo)
  const asignables = delPeriodo.filter(
    (c) => categoriaPorId.get(c.categoria_id)?.naturaleza === 'cif',
  )
  const gastos = delPeriodo.filter((c) => {
    const n = categoriaPorId.get(c.categoria_id)?.naturaleza
    return n != null && n !== 'cif'
  })
  const huerfanos = delPeriodo.filter((c) => {
    const cat = categoriaPorId.get(c.categoria_id)
    return !cat || !cat.activa
  })

  const columnas: Columna<ConceptoCIF>[] = [
    {
      clave: 'fecha',
      titulo: 'Fecha',
      valor: (c) => c.fecha,
      render: (c) => <span className="cifra text-xs">{c.fecha}</span>,
    },
    {
      clave: 'concepto',
      titulo: 'Concepto',
      valor: (c) => c.concepto,
      render: (c) => (
        <div>
          <p className="font-medium">{c.concepto}</p>
          <p className="text-xs text-tenue">
            {categoriaPorId.get(c.categoria_id)?.nombre ?? 'Categoría borrada'}
          </p>
        </div>
      ),
    },
    {
      clave: 'documento',
      titulo: 'Doc.',
      soloAncho: true,
      valor: (c) => c.documento,
      render: (c) => <span className="cifra text-xs text-suave">{c.documento || '—'}</span>,
    },
    {
      clave: 'clase',
      titulo: 'Clase',
      valor: (c) => (c.presupuestado ? 'presupuestado' : 'real'),
      render: (c) =>
        c.presupuestado ? <Pildora tono="aviso">Presupuestado</Pildora> : <Pildora>Real</Pildora>,
    },
    {
      clave: 'monto',
      titulo: 'Importe',
      alineacion: 'der',
      valor: (c) => c.monto,
      render: (c) => <span className="cifra tabular-nums font-medium">{cop(c.monto)}</span>,
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (c) => (
        <BotonConfirmar variante="fantasma" onConfirmar={() => borrarCIF(c.id)}>
          ✕
        </BotonConfirmar>
      ),
    },
  ]

  const suma = (xs: ConceptoCIF[]) => xs.reduce((s, c) => s + c.monto, 0)

  return (
    <div className="space-y-5">
      {/* ---------- la tasa ---------- */}
      <Tarjeta>
        <TituloSeccion
          nota={
            tasa
              ? `tasa = CIF asignables ÷ nivel de actividad = ${cop(tasa.total_cif)} ÷ ${fmtCantidad(tasa.nivel_actividad)}`
              : 'Registrá el primer concepto para ver la tasa.'
          }
          acciones={
            periodos.length > 0 && (
              <Selector
                valor={periodoActivo}
                onChange={setPeriodo}
                opciones={periodos.map((p) => ({ valor: p, texto: p }))}
              />
            )
          }
        >
          Tasa de CIF {periodoActivo && `· ${periodoActivo}`}
        </TituloSeccion>

        {tasa ? (
          <>
            <Rejilla columnas={4}>
              <Cifra
                etiqueta="Tasa"
                valor={tasa.valida ? tasaLegible(tasa.base, tasa.tasa) : 'sin tasa'}
                tono={tasa.valida ? 'acento' : 'negativo'}
                tamano="sm"
                pie={ETIQUETA_BASE[tasa.base]}
              />
              <Cifra
                etiqueta="CIF asignables"
                valor={cop(tasa.total_cif)}
                tamano="sm"
                pie={tasa.desde === 'presupuestado' ? 'De los presupuestados' : 'De los reales'}
              />
              <Cifra
                etiqueta="Nivel de actividad"
                valor={`${fmtCantidad(tasa.nivel_actividad)} ${UNIDAD_BASE[tasa.base]}`}
                tamano="sm"
                pie={`${tasa.ordenes.length} orden(es) en el período`}
              />
              <Cifra
                etiqueta="Gasto del período"
                valor={cop(tasa.gastos_del_periodo)}
                tamano="sm"
                pie="No entra al costo del producto"
              />
            </Rejilla>

            {!tasa.valida && (
              <div className="mt-3">
                <Aviso tono="negativo" titulo="No hay tasa que repartir">
                  El período no tiene nivel de actividad en la base{' '}
                  «{ETIQUETA_BASE[tasa.base].toLowerCase()}». Con base en unidades eso significa que
                  ninguna orden del período tiene cantidad producida. Las hojas de esas órdenes se
                  quedan en borrador diciéndolo.
                </Aviso>
              </div>
            )}

            {/* incurridos vs aplicados */}
            <div className="mt-5 rounded-lg border border-borde bg-panel-alto p-3">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-tenue">
                CIF incurridos vs. aplicados
              </p>
              <Rejilla columnas={3}>
                <Cifra
                  etiqueta="Incurridos (reales)"
                  valor={cop(tasa.cif_incurrido)}
                  tamano="sm"
                  pie="Lo que de verdad costó"
                />
                <Cifra
                  etiqueta="Aplicados a órdenes"
                  valor={cop(tasa.cif_aplicado)}
                  tamano="sm"
                  pie="tasa × nivel de actividad"
                />
                <Cifra
                  etiqueta="Variación"
                  valor={cop(tasa.variacion)}
                  tono={
                    Math.abs(tasa.variacion) < 0.5 ? 'positivo' : tasa.variacion > 0 ? 'aviso' : 'negativo'
                  }
                  tamano="sm"
                  pie={
                    Math.abs(tasa.variacion) < 0.5
                      ? 'Sin variación'
                      : tasa.variacion > 0
                        ? 'Subaplicados'
                        : 'Sobreaplicados'
                  }
                />
              </Rejilla>
              <p className="mt-3 text-xs text-tenue">
                {tasa.desde === 'real' ? (
                  <>
                    <strong>Modelo simplificado:</strong> la tasa sale de los CIF reales del mismo
                    período, así que lo aplicado cuadra con lo incurrido y la variación da cero por
                    construcción. Para ver una variación de verdad hay que registrar CIF{' '}
                    <strong>presupuestados</strong> y poner la tasa en modo presupuestado, en
                    Configuración.
                  </>
                ) : (
                  <>
                    La tasa viene de los CIF <strong>presupuestados</strong>, así que la variación sí
                    significa algo: positiva son subaplicados (se cargó al producto menos de lo que
                    costó) y negativa son sobreaplicados.
                  </>
                )}
              </p>
            </div>
          </>
        ) : (
          <Aviso tono="aviso">
            Todavía no hay períodos. Registrá un concepto de CIF abajo, escribiendo el mes.
          </Aviso>
        )}
      </Tarjeta>

      {/* ---------- registrar ---------- */}
      <Tarjeta>
        <TituloSeccion nota="La categoría decide si esto es costo de fábrica o gasto del período.">
          Registrar un concepto
        </TituloSeccion>

        {categoriasActivas.length === 0 ? (
          <Aviso tono="aviso">
            No hay categorías activas. Creá al menos una en la pestaña «Categorías».
          </Aviso>
        ) : (
          <Rejilla columnas={4}>
            <Campo etiqueta="Categoría">
              {(id) => (
                <Selector
                  id={id}
                  valor={categoriaId}
                  onChange={setCategoriaId}
                  opciones={categoriasActivas.map((c) => ({
                    valor: c.id,
                    texto: `${c.nombre}${c.naturaleza === 'cif' ? '' : ' (gasto)'}`,
                  }))}
                  vacio="Elegí…"
                />
              )}
            </Campo>
            <Campo etiqueta="Concepto">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={concepto}
                  onChange={setConcepto}
                  placeholder="Energía de la planta"
                />
              )}
            </Campo>
            <Campo etiqueta="Importe">
              {(id) => <InputCifra id={id} valor={monto} onChange={setMonto} paso={10_000} sufijo="$" />}
            </Campo>
            <Campo etiqueta="Fecha">
              {(id) => <InputTexto id={id} tipo="date" valor={fecha} onChange={setFecha} />}
            </Campo>

            <Campo
              etiqueta="Período"
              ayuda={
                periodos.length > 0
                  ? `Vacío = ${periodoActivo}. Escribí AAAA-MM para uno nuevo.`
                  : 'Escribí el mes, en formato AAAA-MM.'
              }
            >
              {(id) => (
                <InputTexto id={id} valor={mesNuevo} onChange={setMesNuevo} placeholder={periodoActivo || '2026-02'} />
              )}
            </Campo>
            <Campo etiqueta="Documento">
              {(id) => (
                <InputTexto id={id} valor={documento} onChange={setDocumento} placeholder="FC-9011" />
              )}
            </Campo>
            <div className="flex items-end pb-1.5">
              <Casilla
                valor={presupuestado}
                onChange={setPresupuestado}
                etiqueta="Es un presupuesto, no un causado"
              />
            </div>
            <div className="flex items-end">
              <Boton variante="primario" onClick={agregar} className="w-full">
                Registrar
              </Boton>
            </div>
          </Rejilla>
        )}

        {error && (
          <div className="mt-3">
            <Aviso tono="negativo">{error}</Aviso>
          </div>
        )}
      </Tarjeta>

      {/* ---------- asignables ---------- */}
      <Tarjeta>
        <TituloSeccion
          nota="Esto SÍ se reparte entre las órdenes del período."
          acciones={<Pildora tono="acento">{cop(suma(asignables))}</Pildora>}
        >
          CIF asignables a producción
        </TituloSeccion>
        <Tabla
          columnas={columnas}
          filas={asignables}
          claveFila={(c) => c.id}
          ordenInicial={{ clave: 'fecha', asc: true }}
          vacio="Sin CIF registrados en este período."
        />
      </Tarjeta>

      {/* ---------- gastos ---------- */}
      {gastos.length > 0 && (
        <Tarjeta>
          <TituloSeccion
            nota="Administración, ventas y financieros: NO entran a ninguna hoja de costos."
            acciones={<Pildora>{cop(suma(gastos))}</Pildora>}
          >
            Gasto del período
          </TituloSeccion>
          <Tabla columnas={columnas} filas={gastos} claveFila={(c) => c.id} vacio="—" />
        </Tarjeta>
      )}

      {huerfanos.length > 0 && (
        <Aviso tono="negativo" titulo={`${huerfanos.length} concepto(s) sin categoría válida`}>
          Suman {cop(suma(huerfanos))} y <strong>no se asignaron</strong>: sin categoría no se puede
          saber si son costo de fábrica o gasto, y adivinarlo sería meterle plata al producto sin
          razón. Asignales una categoría activa.
        </Aviso>
      )}
    </div>
  )
}

// =====================================================================
// Categorías
// =====================================================================

const VACIA: Omit<CategoriaCIF, 'id'> = {
  nombre: '',
  naturaleza: 'cif',
  comportamiento: 'variable',
  base: null,
  activa: true,
  nota: '',
}

function Categorias() {
  const { cif, crearCategoriaCIF, actualizarCategoriaCIF, borrarCategoriaCIF } = useEstado()

  const [borrador, setBorrador] = useState<Omit<CategoriaCIF, 'id'>>(VACIA)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof CategoriaCIF>(clave: K, valor: CategoriaCIF[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIA)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardar = () => {
    const nombre = borrador.nombre.trim()
    if (!nombre) return setError('El nombre es obligatorio.')
    const repetida = cif.categorias.some(
      (c) => c.id !== editando && c.nombre.trim().toLowerCase() === nombre.toLowerCase(),
    )
    if (repetida) return setError(`Ya hay una categoría llamada «${nombre}».`)

    if (editando) actualizarCategoriaCIF(editando, { ...borrador, nombre })
    else crearCategoriaCIF({ ...borrador, nombre })
    limpiar()
  }

  const editar = (c: CategoriaCIF) => {
    const { id: _id, ...resto } = c
    setBorrador(resto)
    setEditando(c.id)
    setAbierto(true)
    setError(null)
  }

  const eliminar = (c: CategoriaCIF) => {
    const motivo = borrarCategoriaCIF(c.id)
    setError(motivo ? `No se pudo borrar «${c.nombre}»: ${motivo}` : null)
  }

  const columnas: Columna<CategoriaCIF>[] = [
    {
      clave: 'nombre',
      titulo: 'Categoría',
      valor: (c) => c.nombre,
      render: (c) => (
        <div>
          <p className="font-medium">{c.nombre}</p>
          {c.nota && <p className="text-xs text-tenue">{c.nota}</p>}
        </div>
      ),
    },
    {
      clave: 'naturaleza',
      titulo: 'Naturaleza',
      valor: (c) => c.naturaleza,
      render: (c) => (
        <Pildora tono={TONO_NATURALEZA[c.naturaleza]}>
          {c.naturaleza === 'cif' ? 'CIF' : ETIQUETA_NATURALEZA[c.naturaleza].split(' (')[0]}
        </Pildora>
      ),
    },
    {
      clave: 'comportamiento',
      titulo: 'Comportamiento',
      soloAncho: true,
      valor: (c) => c.comportamiento,
      render: (c) => <span className="text-xs text-suave">{c.comportamiento}</span>,
    },
    {
      clave: 'base',
      titulo: 'Base propia',
      soloAncho: true,
      valor: (c) => c.base ?? '',
      render: (c) =>
        c.base ? (
          <span className="text-xs text-suave">{ETIQUETA_BASE[c.base]}</span>
        ) : (
          <span className="text-xs text-tenue">la general</span>
        ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (c) => (c.activa ? 'activa' : 'inactiva'),
      render: (c) => (c.activa ? <Pildora tono="positivo">Activa</Pildora> : <Pildora>Inactiva</Pildora>),
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
          nota="Las creás vos. El código no trae una lista cerrada."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nueva categoría
              </Boton>
            )
          }
        >
          Categorías de costo indirecto
        </TituloSeccion>

        <Aviso tono="acento" titulo="La naturaleza es lo que separa costo de gasto">
          Solo las categorías con naturaleza <strong>CIF</strong> se reparten entre las órdenes y
          llegan al costo del producto. Administración, ventas y financieros se pueden registrar para
          tenerlos medidos, pero son <strong>gasto del período</strong> y no entran a ninguna hoja. El
          arriendo de la planta es CIF; el de la oficina, no.
        </Aviso>
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion>{editando ? `Editar «${borrador.nombre}»` : 'Nueva categoría'}</TituloSeccion>
          <Rejilla columnas={4}>
            <Campo etiqueta="Nombre *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Herramientas de corta duración"
                />
              )}
            </Campo>
            <Campo etiqueta="Naturaleza">
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.naturaleza}
                  onChange={(v) => set('naturaleza', v)}
                  opciones={NATURALEZAS}
                />
              )}
            </Campo>
            <Campo etiqueta="Comportamiento" ayuda="Informativo: si cambia o no con el volumen.">
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.comportamiento}
                  onChange={(v) => set('comportamiento', v)}
                  opciones={[
                    { valor: 'variable' as const, texto: 'Variable' },
                    { valor: 'fijo' as const, texto: 'Fijo' },
                  ]}
                />
              )}
            </Campo>
            <Campo
              etiqueta="Base propia"
              ayuda="Enganchado para repartir esta categoría por su propia base. Vacío = la general."
            >
              {(id) => (
                <Selector
                  id={id}
                  valor={borrador.base ?? ''}
                  onChange={(v) => set('base', (v || null) as BaseTasaCIF | null)}
                  opciones={BASES}
                  vacio="La general"
                />
              )}
            </Campo>
            <Campo etiqueta="Nota" className="sm:col-span-2">
              {(id) => <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Casilla valor={borrador.activa} onChange={(v) => set('activa', v)} etiqueta="Activa" />
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
          filas={cif.categorias}
          claveFila={(c) => c.id}
          filtrable
          placeholderFiltro="Buscar categoría…"
          vacio="No hay categorías."
        />
      </Tarjeta>
    </div>
  )
}
