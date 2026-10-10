import {
  Aviso,
  Campo,
  Casilla,
  Cifra,
  InputCifra,
  InputTexto,
  Rejilla,
  Selector,
  Tarjeta,
  TituloSeccion,
} from '../components/ui'
import { useEstado } from '../contexto'
import { cop, pct } from '../lib/formato'
import { METODOS_IMPLEMENTADOS, metodoImplementado } from '../lib/kardex'
import type {
  BaseTasaCIF,
  Empresa,
  MetodoInventario,
  MetodoMargen,
  ParametrosCalculo,
  RecargosNomina,
} from '../lib/tipos'

const METODOS_INVENTARIO: ReadonlyArray<{ valor: MetodoInventario; texto: string }> = [
  { valor: 'promedio_ponderado', texto: 'Promedio ponderado' },
  { valor: 'peps', texto: 'PEPS / FIFO (no implementado)' },
  { valor: 'ueps', texto: 'UEPS / LIFO (no implementado)' },
]

const BASES_CIF: ReadonlyArray<{ valor: BaseTasaCIF; texto: string }> = [
  { valor: 'unidades', texto: 'Unidades producidas' },
  { valor: 'horas_mo', texto: 'Horas de mano de obra' },
  { valor: 'costo_mo', texto: 'Costo de mano de obra' },
  { valor: 'horas_maquina', texto: 'Horas máquina' },
  { valor: 'costo_material', texto: 'Costo de material' },
  { valor: 'costo_primo', texto: 'Costo primo' },
]

const METODOS_MARGEN: ReadonlyArray<{ valor: MetodoMargen; texto: string }> = [
  { valor: 'sobre_costo', texto: 'Sobre el costo (markup)' },
  { valor: 'sobre_precio', texto: 'Sobre el precio de venta' },
]

/*
  Los cuatro recargos, pero no todos se leen igual.

  - 'factor': la hora se paga completa por ese número. 1,25 = +25%.
  - 'adicional': la hora ya se pagó como ordinaria y esto es lo que se le
    suma encima. 0,35 = +35%.

  Sin esta distinción el porcentaje de al lado sale mal: el dominical en 0,75
  es +75%, no −25%.
*/
const RECARGOS: ReadonlyArray<{
  clave: keyof RecargosNomina
  texto: string
  clase: 'factor' | 'adicional'
  ayuda: string
}> = [
  {
    clave: 'extra_diurna',
    texto: 'Hora extra diurna',
    clase: 'factor',
    ayuda: 'Factor sobre la hora ordinaria. 1,25 = +25%',
  },
  { clave: 'extra_nocturna', texto: 'Hora extra nocturna', clase: 'factor', ayuda: '1,75 = +75%' },
  {
    clave: 'recargo_nocturno',
    texto: 'Recargo nocturno',
    clase: 'adicional',
    ayuda: 'Solo el adicional: la hora ya se pagó como ordinaria. 0,35 = +35%',
  },
  {
    clave: 'dominical',
    texto: 'Dominical o festivo',
    clase: 'adicional',
    ayuda: 'Solo el adicional sobre la hora ordinaria. 0,75 = +75%',
  },
]

export function Configuracion() {
  const { config, setConfig, calculado, hayCambiosLocales } = useEstado()
  const { empresa, parametros } = config

  const setEmpresa = <K extends keyof Empresa>(clave: K, valor: Empresa[K]) =>
    setConfig({ ...config, empresa: { ...empresa, [clave]: valor } })

  const setParametro = <K extends keyof ParametrosCalculo>(clave: K, valor: ParametrosCalculo[K]) =>
    setConfig({ ...config, parametros: { ...parametros, [clave]: valor } })

  const setRecargo = (clave: keyof RecargosNomina, valor: number) =>
    setConfig({
      ...config,
      parametros: { ...parametros, recargos: { ...parametros.recargos, [clave]: valor } },
    })

  /** Un salario de ejemplo, solo para que se vea el efecto de los parámetros. */
  const SALARIO_EJEMPLO = 1_423_500
  const valorHora = parametros.horas_mes > 0 ? SALARIO_EJEMPLO / parametros.horas_mes : 0

  return (
    <div className="space-y-6">
      <Aviso tono="aviso" titulo="Estos parámetros son académicos">
        Los recargos, el factor prestacional y los métodos de valoración son valores de{' '}
        <strong>ejercicio</strong>, editables desde esta pantalla. Sirven para resolver el taller de
        costos: no son asesoría laboral ni contable, y no garantizan el cumplimiento de la ley
        colombiana vigente. Verificá las cifras con tu profe antes de usarlas para algo real.
      </Aviso>

      {hayCambiosLocales && (
        <Aviso tono="acento" titulo="Hay cambios guardados en este navegador">
          Lo que ves no es la semilla de <code>data/</code> sino lo que hay en el almacenamiento
          local. Con <strong>Exportar</strong> te lo bajás como respaldo y con <strong>Reiniciar</strong>{' '}
          volvés a los datos de fábrica.
        </Aviso>
      )}

      {/* ---------- empresa ---------- */}
      <Tarjeta>
        <TituloSeccion nota="Sale en los encabezados y en los informes.">La empresa</TituloSeccion>
        <Rejilla columnas={3}>
          <Campo etiqueta="Nombre">
            {(id) => (
              <InputTexto id={id} valor={empresa.nombre} onChange={(v) => setEmpresa('nombre', v)} />
            )}
          </Campo>
          <Campo etiqueta="Razón social">
            {(id) => (
              <InputTexto
                id={id}
                valor={empresa.razon_social}
                onChange={(v) => setEmpresa('razon_social', v)}
              />
            )}
          </Campo>
          <Campo etiqueta="NIT">
            {(id) => <InputTexto id={id} valor={empresa.nit} onChange={(v) => setEmpresa('nit', v)} />}
          </Campo>
          <Campo etiqueta="Ciudad">
            {(id) => (
              <InputTexto id={id} valor={empresa.ciudad} onChange={(v) => setEmpresa('ciudad', v)} />
            )}
          </Campo>
          <Campo etiqueta="Actividad" className="sm:col-span-2">
            {(id) => (
              <InputTexto
                id={id}
                valor={empresa.actividad}
                onChange={(v) => setEmpresa('actividad', v)}
              />
            )}
          </Campo>
        </Rejilla>
      </Tarjeta>

      {/* ---------- nomina ---------- */}
      <Tarjeta>
        <TituloSeccion nota="Con qué se calcula el costo de una hora de trabajo.">
          Nómina
        </TituloSeccion>

        <Rejilla columnas={3}>
          <Campo
            etiqueta="Horas al mes"
            ayuda="Con esto se divide el salario para sacar el valor de la hora."
          >
            {(id) => (
              <InputCifra
                id={id}
                valor={parametros.horas_mes}
                onChange={(n) => setParametro('horas_mes', n)}
                min={1}
                paso={1}
                sufijo="h"
              />
            )}
          </Campo>

          <Campo
            etiqueta="Factor prestacional"
            ayuda={`Es el incremento, no el multiplicador: 0,52 = la hora cuesta un 52% más. Hoy multiplica por ${(1 + parametros.factor_prestacional).toLocaleString('es-CO')}.`}
          >
            {(id) => (
              <InputCifra
                id={id}
                valor={parametros.factor_prestacional}
                onChange={(n) => setParametro('factor_prestacional', n)}
                min={0}
                paso={0.01}
                sufijo="+"
              />
            )}
          </Campo>

          <div className="rounded-lg border border-borde bg-panel-alto p-3">
            <Cifra
              etiqueta="Ejemplo"
              valor={cop(valorHora)}
              tamano="sm"
              pie={`Hora ordinaria con un salario de ${cop(SALARIO_EJEMPLO)}. Cargada: ${cop(valorHora * (1 + parametros.factor_prestacional))}`}
            />
          </div>
        </Rejilla>

        <div className="mt-4 rounded-lg border border-borde bg-panel-alto p-3">
          <Casilla
            valor={parametros.mod_con_factor_prestacional !== false}
            onChange={(v) => setParametro('mod_con_factor_prestacional', v)}
            etiqueta="La mano de obra directa entra a la hoja de costos con el factor prestacional"
          />
          <p className="mt-2 text-xs text-tenue">
            Encendido (lo recomendado): el producto carga el <strong>costo-empresa</strong> de la hora,
            prestaciones incluidas. Apagado: carga solo el salario puro. Las dos cifras se calculan
            siempre y se ven lado a lado en cada orden; esto decide cuál de las dos se lleva la hoja.
          </p>
        </div>

        <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-tenue">
          Recargos
        </p>
        <Rejilla columnas={4}>
          {RECARGOS.map((r) => (
            <Campo key={r.clave} etiqueta={r.texto} ayuda={r.ayuda}>
              {(id) => (
                <InputCifra
                  id={id}
                  valor={parametros.recargos[r.clave]}
                  onChange={(n) => setRecargo(r.clave, n)}
                  min={0}
                  paso={0.05}
                  sufijo={`= +${pct(
                    (r.clase === 'adicional'
                      ? parametros.recargos[r.clave]
                      : parametros.recargos[r.clave] - 1) * 100,
                    0,
                  )}`}
                />
              )}
            </Campo>
          ))}
        </Rejilla>
      </Tarjeta>

      {/* ---------- inventario ---------- */}
      <Tarjeta>
        <TituloSeccion nota="Cómo se valoran las salidas de bodega.">Inventario</TituloSeccion>

        <Rejilla columnas={2}>
          <Campo etiqueta="Método de valoración">
            {(id) => (
              <Selector
                id={id}
                valor={parametros.metodo_inventario}
                onChange={(v) => setParametro('metodo_inventario', v)}
                opciones={METODOS_INVENTARIO}
              />
            )}
          </Campo>
          <div className="rounded-lg border border-borde bg-panel-alto p-3">
            <Cifra
              etiqueta="Valor del inventario"
              valor={cop(calculado.valorInventario)}
              tamano="sm"
              pie={`${calculado.conteos.materiasPrimas} materia(s) prima(s), valoradas por ${
                calculado.metodoInventario === 'promedio_ponderado' ? 'promedio ponderado' : calculado.metodoInventario
              }`}
            />
          </div>
        </Rejilla>

        {!metodoImplementado(parametros.metodo_inventario) && (
          <div className="mt-3">
            <Aviso tono="negativo" titulo="Ese método todavía no está escrito">
              Pediste <strong>{parametros.metodo_inventario.toUpperCase()}</strong>, pero el único
              método implementado es{' '}
              {METODOS_IMPLEMENTADOS.map((m) => m.replace('_', ' ')).join(', ')}. Mientras tanto el
              Kardex se está valorando por <strong>promedio ponderado</strong> y no se mezclan
              criterios. El enganche para PEPS está marcado en <code>src/lib/kardex.ts</code>.
            </Aviso>
          </div>
        )}
      </Tarjeta>

      {/* ---------- CIF y precios ---------- */}
      <Tarjeta>
        <TituloSeccion nota="Cómo se reparten los indirectos y cómo se sugiere el precio.">
          CIF y precios
        </TituloSeccion>
        <Rejilla columnas={4}>
          <Campo etiqueta="Base de los CIF" ayuda="tasa = CIF ÷ nivel de actividad">
            {(id) => (
              <Selector
                id={id}
                valor={parametros.base_cif}
                onChange={(v) => setParametro('base_cif', v)}
                opciones={BASES_CIF}
              />
            )}
          </Campo>
          <Campo
            etiqueta="Tasa de CIF calculada con"
            ayuda={
              (parametros.cif_tasa_desde ?? 'real') === 'real'
                ? 'Modelo simplificado: lo aplicado cuadra con lo incurrido.'
                : 'Tasa predeterminada: aparece la variación sub/sobreaplicados.'
            }
          >
            {(id) => (
              <Selector
                id={id}
                valor={parametros.cif_tasa_desde ?? 'real'}
                onChange={(v) => setParametro('cif_tasa_desde', v)}
                opciones={[
                  { valor: 'real' as const, texto: 'CIF reales del período' },
                  { valor: 'presupuestado' as const, texto: 'CIF presupuestados' },
                ]}
              />
            )}
          </Campo>
          <Campo etiqueta="Método de margen">
            {(id) => (
              <Selector
                id={id}
                valor={parametros.metodo_margen}
                onChange={(v) => setParametro('metodo_margen', v)}
                opciones={METODOS_MARGEN}
              />
            )}
          </Campo>
          <Campo etiqueta="Margen por defecto" ayuda="Se usa si el producto no define uno propio.">
            {(id) => (
              <InputCifra
                id={id}
                valor={parametros.margen_por_defecto_pct}
                onChange={(n) => setParametro('margen_por_defecto_pct', n)}
                min={0}
                paso={1}
                sufijo="%"
              />
            )}
          </Campo>
          <Campo etiqueta="Redondeo de precios" ayuda="Múltiplo al que se redondea arriba. 1 = sin redondeo.">
            {(id) => (
              <InputCifra
                id={id}
                valor={parametros.redondeo_precio_multiplo}
                onChange={(n) => setParametro('redondeo_precio_multiplo', n)}
                min={1}
                paso={50}
                sufijo="$"
              />
            )}
          </Campo>
        </Rejilla>
      </Tarjeta>
    </div>
  )
}
