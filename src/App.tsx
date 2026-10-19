import { useEffect, useRef, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'

import { Aviso, Boton, BotonConfirmar } from './components/ui'
import { useEstado } from './contexto'
import { ProveedorEstado } from './estado'
import { Configuracion } from './pages/Configuracion'
import { Kardex } from './pages/Kardex'
import { CIF } from './pages/CIF'
import { Equilibrio } from './pages/Equilibrio'
import { HojasCostos } from './pages/HojasCostos'
import { MateriasPrimas } from './pages/MateriasPrimas'
import { Nomina } from './pages/Nomina'
import { Ordenes } from './pages/Ordenes'
import { Productos } from './pages/Productos'
import { Proximamente } from './pages/Proximamente'

/*
  EL ORDEN DE LA NAVEGACION CUENTA UNA HISTORIA, y es la del ejercicio:

    1. SE CONFIGURA   una sola vez: la empresa y los parametros del calculo.
    2. SE REGISTRA    lo que vos cargas: materiales, productos, ordenes,
                      nomina, CIF. Son los DATOS DE ENTRADA.
    3. SE CALCULA     lo que el sistema deriva solo de lo anterior: el Kardex,
                      las hojas de costos, el punto de equilibrio. Aca no se
                      escribe NADA; si un numero esta mal, se arregla en el
                      grupo 2.

  Es el mismo reparto de la regla de oro del proyecto —las formulas viven en
  `src/lib/` y la UI no calcula nada— pero visible en la barra de arriba.
*/
type Grupo = 'configura' | 'registra' | 'calcula'

const ETIQUETA_GRUPO_NAV: Record<Grupo, string> = {
  configura: 'Se configura',
  registra: 'Se registra',
  calcula: 'Se calcula solo',
}

const PAGINAS: ReadonlyArray<{ a: string; icono: string; texto: string; grupo: Grupo }> = [
  { a: '/', icono: '⚙️', texto: 'Configuración', grupo: 'configura' },

  { a: '/materias-primas', icono: '🧱', texto: 'Materias primas', grupo: 'registra' },
  { a: '/productos', icono: '📦', texto: 'Productos', grupo: 'registra' },
  { a: '/ordenes', icono: '🏭', texto: 'Órdenes', grupo: 'registra' },
  { a: '/nomina', icono: '👷', texto: 'Nómina', grupo: 'registra' },
  { a: '/cif', icono: '🔧', texto: 'CIF', grupo: 'registra' },

  { a: '/kardex', icono: '📋', texto: 'Kardex', grupo: 'calcula' },
  { a: '/hojas-costos', icono: '🧾', texto: 'Hojas de costos', grupo: 'calcula' },
  { a: '/equilibrio', icono: '⚖️', texto: 'Punto de equilibrio', grupo: 'calcula' },
  { a: '/informes', icono: '📊', texto: 'Informes', grupo: 'calcula' },
]

function BotonTema() {
  const { tema, alternarTema } = useEstado()
  return (
    <button
      type="button"
      onClick={alternarTema}
      title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="rounded-lg border border-borde bg-panel-alto px-2.5 py-1.5 text-sm transition hover:border-borde-fuerte"
    >
      {tema === 'oscuro' ? '☀️' : '🌙'}
    </button>
  )
}

function Navegacion() {
  /* Los grupos en el orden en que aparecen, sin repetir. */
  const grupos = [...new Set(PAGINAS.map((p) => p.grupo))]

  return (
    <nav className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {grupos.map((g, i) => (
        <div key={g} className="flex shrink-0 items-center gap-1">
          {i > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-borde" />}
          <span className="hidden shrink-0 select-none pr-0.5 text-[10px] font-medium uppercase tracking-wider text-tenue lg:inline">
            {ETIQUETA_GRUPO_NAV[g]}
          </span>
          {PAGINAS.filter((p) => p.grupo === g).map((p) => (
            <NavLink
              key={p.a}
              to={p.a}
              end={p.a === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-acento/14 font-semibold text-acento'
                    : 'text-suave hover:bg-panel-alto hover:text-texto'
                }`
              }
            >
              <span aria-hidden className="text-xs">
                {p.icono}
              </span>
              {p.texto}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

/**
 * Al cambiar de pagina, volver arriba. Sin esto, saltar de una pagina larga
 * (Kardex, Ordenes) a otra te deja a mitad de la nueva.
 */
function SubirAlCambiarDePagina() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

function Cascara() {
  const { calculado, config, exportarTodo, importarTodo, reiniciar, hayCambiosLocales } = useEstado()
  const archivo = useRef<HTMLInputElement>(null)

  /*
    Importar reemplaza TODO el estado, asi que no se hace de un solo clic: se
    lee el archivo, se muestra que trae y se pide confirmacion.
  */
  const [pendiente, setPendiente] = useState<{ nombre: string; texto: string } | null>(null)
  const [mensaje, setMensaje] = useState<{ malo: boolean; texto: string } | null>(null)

  const elegirArchivo = async (f: File | undefined) => {
    if (!f) return
    setMensaje(null)
    try {
      setPendiente({ nombre: f.name, texto: await f.text() })
    } catch {
      setMensaje({ malo: true, texto: 'No se pudo leer el archivo.' })
    }
  }

  const confirmarImportar = () => {
    if (!pendiente) return
    const r = importarTodo(pendiente.texto)
    setPendiente(null)
    if (!r.ok) {
      setMensaje({ malo: true, texto: r.error })
      return
    }
    const extra = r.avisos.length > 0 ? ` Con avisos: ${r.avisos.join(' ')}` : ''
    setMensaje({ malo: false, texto: `Respaldo importado.${extra}` })
  }

  return (
    <div className="min-h-screen bg-fondo">
      <SubirAlCambiarDePagina />
      <header className="no-imprimir sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-base font-semibold tracking-tight">Sistema de Costos</h1>
              <span className="hidden text-xs text-tenue sm:inline">
                {config.empresa.nombre}
                {hayCambiosLocales && ' · editado'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Boton variante="fantasma" onClick={exportarTodo} titulo="Bajar todo el estado como JSON">
                ⬇ <span className="hidden sm:inline">Exportar</span>
              </Boton>
              <Boton
                variante="fantasma"
                onClick={() => archivo.current?.click()}
                titulo="Cargar un respaldo JSON"
              >
                ⬆ <span className="hidden sm:inline">Importar</span>
              </Boton>
              <BotonConfirmar
                variante="fantasma"
                titulo="Volver a los datos de fábrica"
                textoConfirmar="Sí, borrar todo"
                onConfirmar={() => {
                  reiniciar()
                  setMensaje({ malo: false, texto: 'Todo volvió a los datos de fábrica.' })
                }}
              >
                ↺ <span className="hidden sm:inline">Reiniciar</span>
              </BotonConfirmar>
              <BotonTema />
            </div>

            <input
              ref={archivo}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void elegirArchivo(e.target.files?.[0])
                // se limpia para que elegir el mismo archivo otra vez vuelva a disparar
                e.target.value = ''
              }}
            />
          </div>
          <div className="mt-2.5 -mx-1 px-1">
            <Navegacion />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 pb-20 sm:px-6">
        {pendiente && (
          <Aviso tono="aviso" className="no-imprimir" titulo="¿Importar este respaldo?">
            <p>
              <strong>{pendiente.nombre}</strong> va a reemplazar todo lo que hay ahora: configuración,
              materias primas, Kardex, productos y órdenes. Esto no se puede deshacer.
            </p>
            <div className="mt-3 flex gap-2">
              <Boton variante="primario" onClick={confirmarImportar}>
                Sí, reemplazar todo
              </Boton>
              <Boton variante="fantasma" onClick={() => setPendiente(null)}>
                Cancelar
              </Boton>
            </div>
          </Aviso>
        )}

        {mensaje && (
          <Aviso tono={mensaje.malo ? 'negativo' : 'positivo'} className="no-imprimir">
            <div className="flex items-start justify-between gap-3">
              <p>{mensaje.texto}</p>
              <button
                type="button"
                onClick={() => setMensaje(null)}
                className="shrink-0 text-xs underline opacity-70"
              >
                cerrar
              </button>
            </div>
          </Aviso>
        )}

        {/*
          Solo los avisos de mano de obra que son un ERROR: un indirecto
          imputado a una orden, horas imputadas de más, tarifas que no se
          pudieron resolver. El tiempo ocioso es informativo y vive en la
          página de Nómina, para no gritar en todas las pantallas.
        */}
        {(() => {
          const graves = calculado.alertasNomina.filter(
            (a) => a.clase !== 'horas_sin_imputar',
          )
          if (graves.length === 0) return null
          return (
            <Aviso tono="negativo" className="no-imprimir" titulo={`${graves.length} problema(s) de mano de obra`}>
              <ul className="list-disc space-y-0.5 pl-4">
                {graves.slice(0, 5).map((a, i) => (
                  <li key={`${a.clase}-${i}`}>{a.mensaje}</li>
                ))}
              </ul>
              {graves.length > 5 && (
                <p className="mt-1 text-xs opacity-80">
                  y {graves.length - 5} más, en la página de Nómina.
                </p>
              )}
            </Aviso>
          )
        })()}

        {calculado.alertasKardex.length > 0 && (
          <Aviso tono="aviso" className="no-imprimir" titulo={`${calculado.alertasKardex.length} aviso(s) del Kardex`}>
            <ul className="list-disc space-y-0.5 pl-4">
              {calculado.alertasKardex.slice(0, 5).map((a) => (
                <li key={`${a.movimiento_id}-${a.clase}`}>{a.mensaje}</li>
              ))}
            </ul>
            {calculado.alertasKardex.length > 5 && (
              <p className="mt-1 text-xs opacity-80">
                y {calculado.alertasKardex.length - 5} más, en la página de Kardex.
              </p>
            )}
          </Aviso>
        )}

        <Routes>
          <Route path="/" element={<Configuracion />} />
          <Route path="/materias-primas" element={<MateriasPrimas />} />
          <Route path="/kardex" element={<Kardex />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/ordenes" element={<Ordenes />} />
          <Route path="/nomina" element={<Nomina />} />
          <Route path="/cif" element={<CIF />} />
          <Route path="/hojas-costos" element={<HojasCostos />} />
          <Route path="/equilibrio" element={<Equilibrio />} />
          <Route
            path="/informes"
            element={
              <Proximamente
                titulo="Informes"
                descripcion="Estado de costos de producción y ventas, márgenes por producto."
              />
            }
          />
          <Route
            path="*"
            element={<Proximamente titulo="Esta página no existe" descripcion="Usá el menú de arriba." />}
          />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ProveedorEstado>
      <HashRouter>
        <Cascara />
      </HashRouter>
    </ProveedorEstado>
  )
}
