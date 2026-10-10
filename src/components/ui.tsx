/*
  Los componentes de interfaz. Copiados de `sistema-jacobo`
  (src/components/ui.tsx): Tarjeta, TituloSeccion, Pildora, Aviso, Cifra,
  InputNumero, CeldaEditable, Boton, Tabla y Barra son los mismos, con los
  mismos nombres y las mismas props.

  Lo que se agrego para este proyecto esta al final, bajo «FORMULARIOS»: este
  sistema se llena a mano (materias primas, recetas, movimientos) y la
  referencia, que casi solo mostraba numeros calculados, no tenia controles de
  texto ni selectores.
*/

import type { ReactNode } from 'react'
import { useId, useMemo, useState } from 'react'

// ---------------------------------------------------------------------
// Tarjeta
// ---------------------------------------------------------------------
export function Tarjeta({
  children,
  className = '',
  compacta = false,
}: {
  children: ReactNode
  className?: string
  compacta?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-borde bg-panel ${compacta ? 'p-4' : 'p-5'} ${className}`}
      style={{ boxShadow: 'var(--sombra)' }}
    >
      {children}
    </div>
  )
}

export function TituloSeccion({
  children,
  acciones,
  nota,
}: {
  children: ReactNode
  acciones?: ReactNode
  nota?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
        {nota && <p className="mt-1 text-sm text-suave">{nota}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Etiquetas y avisos
// ---------------------------------------------------------------------
export type Tono = 'neutro' | 'positivo' | 'negativo' | 'aviso' | 'acento'

const TONOS: Record<Tono, string> = {
  neutro: 'text-suave',
  positivo: 'text-positivo',
  negativo: 'text-negativo',
  aviso: 'text-aviso',
  acento: 'text-acento',
}

const FONDOS: Record<Tono, string> = {
  neutro: 'bg-panel-alto text-suave',
  positivo: 'bg-positivo/12 text-positivo',
  negativo: 'bg-negativo/12 text-negativo',
  aviso: 'bg-aviso/12 text-aviso',
  acento: 'bg-acento/12 text-acento',
}

export function Pildora({ children, tono = 'neutro' }: { children: ReactNode; tono?: Tono }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${FONDOS[tono]}`}>{children}</span>
  )
}

export function Aviso({
  tono = 'aviso',
  titulo,
  children,
  className = '',
}: {
  tono?: Tono
  titulo?: ReactNode
  children: ReactNode
  className?: string
}) {
  const borde: Record<Tono, string> = {
    neutro: 'border-borde',
    positivo: 'border-positivo/40',
    negativo: 'border-negativo/40',
    aviso: 'border-aviso/40',
    acento: 'border-acento/40',
  }
  return (
    <div className={`rounded-xl border ${borde[tono]} ${FONDOS[tono]} p-4 ${className}`}>
      {titulo && <p className="mb-1 text-sm font-semibold">{titulo}</p>}
      <div className="text-sm leading-relaxed opacity-90">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Cifra grande
// ---------------------------------------------------------------------
export function Cifra({
  valor,
  etiqueta,
  tono = 'neutro',
  pie,
  tamano = 'md',
}: {
  valor: ReactNode
  etiqueta?: ReactNode
  tono?: Tono
  pie?: ReactNode
  tamano?: 'sm' | 'md' | 'lg'
}) {
  const tam = { sm: 'text-xl', md: 'text-2xl', lg: 'text-3xl' }[tamano]
  return (
    <div>
      {etiqueta && (
        <p className="text-xs font-medium uppercase tracking-wider text-tenue">{etiqueta}</p>
      )}
      <p className={`cifra mt-1 font-semibold tracking-tight ${tam} ${TONOS[tono]}`}>{valor}</p>
      {pie && <p className="mt-1 text-xs text-suave">{pie}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Input numerico editable
// ---------------------------------------------------------------------
export function InputNumero({
  valor,
  onChange,
  min,
  max,
  paso = 1000,
  sufijo,
  ancho = 'w-32',
  id,
}: {
  valor: number
  onChange: (n: number) => void
  min?: number
  max?: number
  paso?: number
  sufijo?: string
  ancho?: string
  id?: string
}) {
  // se guarda el texto aparte para no pelear con el usuario mientras escribe
  const [texto, setTexto] = useState<string | null>(null)
  const mostrado = texto ?? String(valor)

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        id={id}
        type="number"
        className={`cifra ${ancho} rounded-lg border border-borde bg-panel-alto px-2.5 py-1.5 text-right text-sm tabular-nums outline-none transition focus:border-acento focus:ring-2 focus:ring-acento/25`}
        value={mostrado}
        min={min}
        max={max}
        step={paso}
        onChange={(e) => {
          setTexto(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setTexto(null)}
      />
      {sufijo && <span className="text-xs text-tenue">{sufijo}</span>}
    </span>
  )
}

/** Celda de tabla editable: se ve como texto hasta que se le hace clic. */
export function CeldaEditable({
  valor,
  onChange,
  formato,
  paso = 1000,
  min = 0,
}: {
  valor: number
  onChange: (n: number) => void
  formato: (n: number) => string
  paso?: number
  min?: number
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setTexto(String(valor))
          setEditando(true)
        }}
        className="cifra w-full rounded px-1.5 py-0.5 text-right tabular-nums transition hover:bg-acento/12 hover:text-acento focus:bg-acento/12 focus:text-acento focus:outline-none"
        title="Clic para editar"
      >
        {formato(valor)}
      </button>
    )
  }

  const confirmar = () => {
    const n = Number(texto)
    if (Number.isFinite(n)) onChange(Math.max(min, n))
    setEditando(false)
  }

  return (
    <input
      autoFocus
      type="number"
      step={paso}
      min={min}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirmar()
        if (e.key === 'Escape') setEditando(false)
      }}
      className="cifra w-full rounded border border-acento bg-panel px-1.5 py-0.5 text-right tabular-nums outline-none"
    />
  )
}

// ---------------------------------------------------------------------
// Boton
// ---------------------------------------------------------------------
export function Boton({
  children,
  onClick,
  variante = 'secundario',
  tipo = 'button',
  deshabilitado,
  className = '',
  titulo,
}: {
  children: ReactNode
  onClick?: () => void
  variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro'
  tipo?: 'button' | 'submit'
  deshabilitado?: boolean
  className?: string
  titulo?: string
}) {
  const estilos = {
    primario: 'bg-acento text-fondo hover:opacity-90 font-semibold',
    secundario: 'border border-borde bg-panel-alto hover:border-borde-fuerte',
    fantasma: 'text-suave hover:bg-panel-alto hover:text-texto',
    peligro: 'border border-negativo/40 text-negativo hover:bg-negativo/12',
  }[variante]

  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      className={`rounded-lg px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${estilos} ${className}`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------
// Tabla con hover, orden clickeable y filtro
// ---------------------------------------------------------------------
export interface Columna<T> {
  clave: string
  titulo: ReactNode
  /** Valor para ordenar y filtrar. Si falta, la columna no se ordena. */
  valor?: (fila: T) => string | number
  render: (fila: T) => ReactNode
  alineacion?: 'izq' | 'der' | 'centro'
  /** Oculta la columna en pantallas angostas. */
  soloAncho?: boolean
  className?: string
}

export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  filtrable = false,
  placeholderFiltro = 'Filtrar…',
  ordenInicial,
  resaltarFila,
  pie,
  vacio = 'Nada por aquí todavía.',
}: {
  columnas: Columna<T>[]
  filas: T[]
  claveFila: (fila: T, i: number) => string
  filtrable?: boolean
  placeholderFiltro?: string
  ordenInicial?: { clave: string; asc: boolean }
  resaltarFila?: (fila: T) => Tono | null
  pie?: ReactNode
  vacio?: ReactNode
}) {
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(ordenInicial ?? null)
  const [filtro, setFiltro] = useState('')

  const visibles = useMemo(() => {
    let out = filas

    if (filtro.trim()) {
      const q = filtro.trim().toLowerCase()
      out = out.filter((f) =>
        columnas.some((c) => {
          const v = c.valor?.(f)
          return v != null && String(v).toLowerCase().includes(q)
        }),
      )
    }

    if (orden) {
      const col = columnas.find((c) => c.clave === orden.clave)
      if (col?.valor) {
        out = [...out].sort((a, b) => {
          const va = col.valor!(a)
          const vb = col.valor!(b)
          const cmp =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb), 'es')
          return orden.asc ? cmp : -cmp
        })
      }
    }

    return out
  }, [filas, columnas, orden, filtro])

  const alinea = (a?: 'izq' | 'der' | 'centro') =>
    a === 'der' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left'

  const fondoTono: Record<Tono, string> = {
    neutro: '',
    positivo: 'bg-positivo/8',
    negativo: 'bg-negativo/8',
    aviso: 'bg-aviso/8',
    acento: 'bg-acento/8',
  }

  return (
    <div>
      {filtrable && (
        <div className="mb-3">
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={placeholderFiltro}
            className="w-full max-w-xs rounded-lg border border-borde bg-panel-alto px-3 py-1.5 text-sm outline-none transition focus:border-acento focus:ring-2 focus:ring-acento/25 sm:w-64"
          />
        </div>
      )}

      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borde">
              {columnas.map((c) => {
                const ordenable = !!c.valor
                const activo = orden?.clave === c.clave
                return (
                  <th
                    key={c.clave}
                    className={`${alinea(c.alineacion)} ${c.soloAncho ? 'hidden md:table-cell' : ''} px-2.5 py-2 text-xs font-semibold uppercase tracking-wider text-tenue`}
                  >
                    {ordenable ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOrden((o) =>
                            o?.clave === c.clave
                              ? { clave: c.clave, asc: !o.asc }
                              : { clave: c.clave, asc: true },
                          )
                        }
                        className={`inline-flex items-center gap-1 transition hover:text-texto ${activo ? 'text-acento' : ''}`}
                      >
                        {c.titulo}
                        <span aria-hidden className="text-[10px] opacity-70">
                          {activo ? (orden!.asc ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="px-2.5 py-8 text-center text-sm text-tenue">
                  {vacio}
                </td>
              </tr>
            )}
            {visibles.map((f, i) => {
              const tono = resaltarFila?.(f) ?? null
              return (
                <tr
                  key={claveFila(f, i)}
                  className={`border-b border-borde/60 transition last:border-0 hover:bg-panel-alto ${tono ? fondoTono[tono] : ''}`}
                >
                  {columnas.map((c) => (
                    <td
                      key={c.clave}
                      className={`${alinea(c.alineacion)} ${c.soloAncho ? 'hidden md:table-cell' : ''} px-2.5 py-2 ${c.className ?? ''}`}
                    >
                      {c.render(f)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          {pie && <tfoot className="border-t-2 border-borde-fuerte font-semibold">{pie}</tfoot>}
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Barra de progreso
// ---------------------------------------------------------------------
export function Barra({ valor, meta, tono = 'acento' }: { valor: number; meta: number; tono?: Tono }) {
  const pctRaw = meta > 0 ? (valor / meta) * 100 : 0
  const pct = Math.max(0, Math.min(100, pctRaw))
  const color = {
    neutro: 'var(--suave)',
    positivo: 'var(--positivo)',
    negativo: 'var(--negativo)',
    aviso: 'var(--aviso)',
    acento: 'var(--acento)',
  }[tono]

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-alto">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// =====================================================================
// FORMULARIOS — lo propio de este proyecto
// =====================================================================

const CLASE_CONTROL =
  'w-full rounded-lg border border-borde bg-panel-alto px-2.5 py-1.5 text-sm outline-none transition focus:border-acento focus:ring-2 focus:ring-acento/25 disabled:opacity-50'

/** Etiqueta + control + ayuda, con el `for` y el `id` ya conectados. */
export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className = '',
}: {
  etiqueta: ReactNode
  ayuda?: ReactNode
  error?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1 text-xs text-negativo">{error}</p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-tenue">{ayuda}</p>
      )}
    </div>
  )
}

export function InputTexto({
  valor,
  onChange,
  id,
  placeholder,
  tipo = 'text',
  deshabilitado,
}: {
  valor: string
  onChange: (v: string) => void
  id?: string
  placeholder?: string
  tipo?: 'text' | 'date'
  deshabilitado?: boolean
}) {
  return (
    <input
      id={id}
      type={tipo}
      value={valor}
      placeholder={placeholder}
      disabled={deshabilitado}
      onChange={(e) => onChange(e.target.value)}
      className={CLASE_CONTROL}
    />
  )
}

export function AreaTexto({
  valor,
  onChange,
  id,
  placeholder,
  filas = 2,
}: {
  valor: string
  onChange: (v: string) => void
  id?: string
  placeholder?: string
  filas?: number
}) {
  return (
    <textarea
      id={id}
      value={valor}
      rows={filas}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${CLASE_CONTROL} resize-y`}
    />
  )
}

/**
 * Campo numerico de formulario.
 *
 * Guarda el texto mientras se escribe, igual que `InputNumero`: si se
 * convirtiera a numero en cada tecla, borrar el ultimo digito de «10» dejaria
 * un 1 que no se puede borrar.
 */
export function InputCifra({
  valor,
  onChange,
  id,
  min = 0,
  paso = 1,
  sufijo,
  placeholder,
}: {
  valor: number
  onChange: (n: number) => void
  id?: string
  min?: number
  paso?: number
  sufijo?: ReactNode
  placeholder?: string
}) {
  const [texto, setTexto] = useState<string | null>(null)
  const mostrado = texto ?? String(valor)

  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={mostrado}
        min={min}
        step={paso}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setTexto(null)}
        className={`cifra ${CLASE_CONTROL} text-right tabular-nums`}
      />
      {sufijo && <span className="shrink-0 text-xs text-tenue">{sufijo}</span>}
    </div>
  )
}

export function Selector<T extends string>({
  valor,
  onChange,
  opciones,
  id,
  vacio,
}: {
  valor: T
  onChange: (v: T) => void
  opciones: ReadonlyArray<{ valor: T; texto: string }>
  id?: string
  /** Texto de una primera opcion vacia, para «sin seleccionar». */
  vacio?: string
}) {
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onChange(e.target.value as T)}
      className={CLASE_CONTROL}
    >
      {vacio && <option value="">{vacio}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  )
}

export function Casilla({
  valor,
  onChange,
  etiqueta,
}: {
  valor: boolean
  onChange: (v: boolean) => void
  etiqueta: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-borde accent-[var(--acento)]"
      />
      <label htmlFor={id} className="text-sm text-suave">
        {etiqueta}
      </label>
    </div>
  )
}

/**
 * Un boton que pide confirmacion antes de hacer algo irreversible.
 *
 * Primer clic: se convierte en «¿Seguro?». Segundo clic: ejecuta. Se usa para
 * borrar filas y para reiniciar a datos de fabrica.
 */
export function BotonConfirmar({
  children,
  onConfirmar,
  textoConfirmar = '¿Seguro?',
  variante = 'peligro',
  titulo,
}: {
  children: ReactNode
  onConfirmar: () => void
  textoConfirmar?: string
  variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro'
  titulo?: string
}) {
  const [armado, setArmado] = useState(false)

  if (!armado) {
    return (
      <Boton variante={variante} titulo={titulo} onClick={() => setArmado(true)}>
        {children}
      </Boton>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Boton
        variante={variante}
        onClick={() => {
          setArmado(false)
          onConfirmar()
        }}
      >
        {textoConfirmar}
      </Boton>
      <Boton variante="fantasma" onClick={() => setArmado(false)}>
        No
      </Boton>
    </span>
  )
}

/**
 * Pestañas dentro de una página.
 *
 * Nómina tiene cuatro cosas distintas (gente, períodos, horas, liquidación) y
 * no alcanzan cuatro entradas en el menú de arriba, así que se reparten acá.
 */
export function Pestanas<T extends string>({
  valor,
  onChange,
  opciones,
}: {
  valor: T
  onChange: (v: T) => void
  opciones: ReadonlyArray<{ valor: T; texto: string; insignia?: ReactNode }>
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto rounded-lg border border-borde bg-panel-alto p-1"
      style={{ scrollbarWidth: 'none' }}
    >
      {opciones.map((o) => {
        const activa = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(o.valor)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
              activa ? 'bg-acento/16 font-semibold text-acento' : 'text-suave hover:text-texto'
            }`}
          >
            {o.texto}
            {o.insignia != null && (
              <span className={`text-xs ${activa ? 'opacity-80' : 'text-tenue'}`}>{o.insignia}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Rejilla de campos que se apila en el celular. */
export function Rejilla({ children, columnas = 3 }: { children: ReactNode; columnas?: 2 | 3 | 4 }) {
  const clase = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[
    columnas
  ]
  return <div className={`grid grid-cols-1 gap-3 ${clase}`}>{children}</div>
}
