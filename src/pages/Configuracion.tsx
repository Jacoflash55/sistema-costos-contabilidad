import { Link } from 'react-router-dom'

import {
  Aviso,
  Boton,
  Campo,
  Casilla,
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
} from '../components/ui'
import type { Columna } from '../components/ui'
import { useEstado } from '../contexto'
import { UNIDAD_BASE } from '../lib/cif'
import { equilibrioMezcla } from '../lib/equilibrio'
import { cop, pct } from '../lib/formato'
import { METODOS_IMPLEMENTADOS, metodoImplementado } from '../lib/kardex'
import { ETIQUETA_GRUPO, factorGlobal } from '../lib/nomina'
import type {
  AporteEmpleador,
  BaseTasaCIF,
  ClaseRiesgoARL,
  Empresa,
  GrupoAporte,
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
  clase: 'completo' | 'adicional'
}> = [
  { clave: 'extra_diurna', texto: 'Extra diurna', clase: 'completo' },
  { clave: 'extra_nocturna', texto: 'Extra nocturna', clase: 'completo' },
  { clave: 'recargo_nocturno', texto: 'Recargo nocturno', clase: 'adicional' },
  { clave: 'dominical', texto: 'Dominical o festivo', clase: 'adicional' },
  { clave: 'recargo_nocturno_dominical', texto: 'Recargo nocturno dominical', clase: 'adicional' },
  { clave: 'extra_diurna_dominical', texto: 'Extra diurna dominical', clase: 'completo' },
  { clave: 'extra_nocturna_dominical', texto: 'Extra nocturna dominical', clase: 'completo' },
]

const CLASES_ARL: ReadonlyArray<ClaseRiesgoARL> = ['I', 'II', 'III', 'IV', 'V']

/**
 * La tabla de lo que paga el empleador por encima del salario.
 *
 * Es la que manda: el factor prestacional ya no se escribe a mano, se deriva
 * de aquí. Cambiar cualquier porcentaje recalcula toda la nómina y, por ella,
 * las hojas de costos en borrador.
 */
function AportesEmpleador() {
  const { config, setConfig } = useEstado()
  const parametros = config.parametros
  const lineas = parametros.aportes_empleador ?? []

  const set = (id: string, parcial: Partial<AporteEmpleador>) =>
    setConfig({
      ...config,
      parametros: {
        ...parametros,
        aportes_empleador: lineas.map((l) => (l.id === id ? { ...l, ...parcial } : l)),
      },
    })

  /** Enciende o apaga de un golpe las tres líneas del Art. 114-1. */
  const exoneracion = (activo: boolean) =>
    setConfig({
      ...config,
      parametros: {
        ...parametros,
        aportes_empleador: lineas.map((l) => (l.cuando_corresponda ? { ...l, activo } : l)),
      },
    })

  const exoneradas = lineas.filter((l) => l.cuando_corresponda)
  const hayExoneracion = exoneradas.length > 0 && exoneradas.every((l) => !l.activo)

  const porGrupo = (g: GrupoAporte) => lineas.filter((l) => l.grupo === g)
  const sumaGrupo = (g: GrupoAporte) =>
    porGrupo(g)
      .filter((l) => l.activo)
      .reduce((s, l) => s + l.pct, 0)

  const totalLineas = lineas.filter((l) => l.activo).reduce((s, l) => s + l.pct, 0)

  const columnas: Columna<AporteEmpleador>[] = [
    {
      clave: 'nombre',
      titulo: 'Concepto',
      valor: (l) => l.nombre,
      render: (l) => (
        <div>
          <p className={l.activo ? 'font-medium' : 'font-medium text-tenue line-through'}>
            {l.nombre}
          </p>
          <p className="text-xs text-tenue">{ETIQUETA_GRUPO[l.grupo]}</p>
        </div>
      ),
    },
    {
      clave: 'pct',
      titulo: '% sobre el IBC',
      alineacion: 'der',
      valor: (l) => l.pct,
      render: (l) => (
        <CeldaEditable
          valor={l.pct}
          paso={0.01}
          formato={(n) => pct(n, 3)}
          onChange={(n) => set(l.id, { pct: n })}
        />
      ),
    },
    {
      clave: 'activo',
      titulo: 'Se cobra',
      alineacion: 'centro',
      valor: (l) => (l.activo ? 'si' : 'no'),
      render: (l) => (
        <Casilla valor={l.activo} onChange={(v) => set(l.id, { activo: v })} etiqueta="" />
      ),
    },
    {
      clave: 'base',
      titulo: 'Base',
      alineacion: 'centro',
      valor: (l) => (l.base_con_auxilio ? 'con auxilio' : 'salario'),
      render: (l) => (
        <button
          type="button"
          onClick={() => set(l.id, { base_con_auxilio: !l.base_con_auxilio })}
          title={
            l.base_con_auxilio
              ? 'Se calcula sobre el salario MÁS el auxilio de transporte. Clic para dejarlo solo sobre el salario.'
              : 'Se calcula solo sobre el salario. Clic para incluir el auxilio de transporte.'
          }
          className="rounded-md px-2 py-0.5 text-xs transition hover:bg-acento/12 hover:text-acento"
        >
          {l.base_con_auxilio ? 'IBC + auxilio' : 'IBC'}
        </button>
      ),
    },
    {
      clave: 'cuando',
      titulo: 'Art. 114-1',
      alineacion: 'centro',
      valor: (l) => (l.cuando_corresponda ? 'si' : 'no'),
      render: (l) => (
        <Casilla
          valor={l.cuando_corresponda}
          onChange={(v) => set(l.id, { cuando_corresponda: v })}
          etiqueta=""
        />
      ),
    },
    {
      clave: 'nota',
      titulo: '',
      soloAncho: true,
      render: (l) =>
        l.cuando_corresponda ? (
          <Pildora tono="aviso">Sujeta a exoneración</Pildora>
        ) : null,
    },
  ]

  return (
    <Tarjeta>
      <TituloSeccion
        nota="De acá sale el factor prestacional. Cambiar un porcentaje recalcula toda la nómina."
        acciones={
          exoneradas.length > 0 && (
            <Boton variante="secundario" onClick={() => exoneracion(hayExoneracion)}>
              {hayExoneracion ? 'Quitar exoneración 114-1' : 'Aplicar exoneración 114-1'}
            </Boton>
          )
        }
      >
        Aportes del empleador
      </TituloSeccion>

      <Aviso tono="acento" titulo="El IBC es el devengado salarial">
        Todos estos porcentajes se calculan sobre el <strong>devengado salarial</strong>: salario del
        período, extras y recargos, más lo que esté marcado como prestacional. El auxilio de transporte
        y las bonificaciones no salariales <strong>no</strong> entran. El modelo es académico: no hay
        tope de 25 SMLMV, ni IBC mínimo, ni reglas de salario integral.
      </Aviso>

      <div className="mt-4">
        <Rejilla columnas={4}>
          <Cifra etiqueta="Prestaciones" valor={pct(sumaGrupo('prestaciones'), 2)} tamano="sm" />
          <Cifra etiqueta="Seguridad social" valor={pct(sumaGrupo('seguridad_social'), 2)} tamano="sm" />
          <Cifra etiqueta="Parafiscales" valor={pct(sumaGrupo('parafiscales'), 2)} tamano="sm" />
          <Cifra
            etiqueta="Suma de las líneas"
            valor={pct(totalLineas, 3)}
            tono="acento"
            tamano="sm"
            pie="+ la ARL de cada trabajador"
          />
        </Rejilla>
      </div>

      <div className="mt-4">
        <Tabla columnas={columnas} filas={lineas} claveFila={(l) => l.id} vacio="Sin líneas." />
      </div>

      <p className="mt-3 text-xs text-tenue">
        La columna <strong>Art. 114-1</strong> marca las líneas sujetas a la exoneración (salud del
        empleador, SENA e ICBF). No decide por sí sola: lo que decide es «se cobra». Un trabajador que
        gane 10 SMLMV o más sí las causa, y eso se resuelve con un override en su ficha.
      </p>
    </Tarjeta>
  )
}

/**
 * El atajo al punto de equilibrio desde la pantalla de inicio.
 *
 * Muestra una sola cosa —cuanto hay que vender para no perder, con la mezcla
 * del ultimo periodo— porque el valor de tenerlo aqui es acordarse de que la
 * pregunta existe, no resolverla en el tablero.
 */
function AtajoEquilibrio() {
  const { calculado } = useEstado()

  const periodos = calculado.periodosCIF
  const periodo = periodos[periodos.length - 1]
  const escenario = periodo ? calculado.escenariosEquilibrio[periodo] : undefined

  if (!escenario) return null

  const mezcla = equilibrioMezcla(
    escenario.productos.map((p) => ({
      producto_id: p.producto_id,
      nombre: p.nombre,
      unidades_canasta: p.mezcla_unidades,
      precio: p.precio_usado,
      costo_variable_unitario: p.cvu_usado,
    })),
    escenario.costos_fijos,
  )

  return (
    <Tarjeta>
      <TituloSeccion
        nota={`Con los datos de ${periodo}.`}
        acciones={
          <Link
            to="/equilibrio"
            className="rounded-lg border border-borde bg-panel-alto px-3 py-1.5 text-sm transition hover:border-acento hover:text-acento"
          >
            Abrir el análisis →
          </Link>
        }
      >
        Punto de equilibrio
      </TituloSeccion>

      <Rejilla columnas={3}>
        <Cifra
          etiqueta="Costos fijos del período"
          valor={cop(escenario.costos_fijos)}
          tamano="sm"
          pie={escenario.origen_costos_fijos === 'manual' ? 'puesto a mano' : 'clasificados por el sistema'}
        />
        <Cifra
          etiqueta="Ventas en el equilibrio"
          valor={mezcla.valido ? cop(mezcla.pesos) : '—'}
          tamano="sm"
          tono={mezcla.valido ? 'acento' : 'negativo'}
          pie={mezcla.valido ? 'con la mezcla del mes' : mezcla.problema}
        />
        <Cifra
          etiqueta="Razón de contribución"
          valor={mezcla.valido ? pct(mezcla.razon_contribucion * 100, 1) : '—'}
          tamano="sm"
          pie="de cada peso vendido queda esto para cubrir los fijos"
        />
      </Rejilla>
    </Tarjeta>
  )
}

export function Configuracion() {
  const { config, setConfig, calculado, hayCambiosLocales } = useEstado()
  const { empresa, parametros } = config

  /*
    El factor que se muestra en esta pantalla es el de referencia: el que
    hereda alguien sin override, con una clase de ARL de muestra. El factor
    real es de cada persona, y se ve en su ficha.
  */
  const claseRef: ClaseRiesgoARL = 'II'
  const factorRef = factorGlobal(parametros, claseRef)

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

      {/* ---------- atajo al punto de equilibrio ---------- */}
      <AtajoEquilibrio />

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

          <div className="rounded-lg border border-borde bg-panel-alto p-3">
            <Cifra
              etiqueta="Factor prestacional (derivado)"
              valor={pct(factorRef * 100, 3)}
              tono="acento"
              tamano="sm"
              pie="No se escribe: sale de la tabla de aportes de abajo"
            />
          </div>

          <div className="rounded-lg border border-borde bg-panel-alto p-3">
            <Cifra
              etiqueta="Ejemplo"
              valor={cop(valorHora)}
              tamano="sm"
              pie={`Hora ordinaria con un salario de ${cop(SALARIO_EJEMPLO)}. Cargada (ARL ${claseRef}): ${cop(valorHora * (1 + factorRef))}`}
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

        <div className="mt-4 rounded-lg border border-borde bg-panel-alto p-3">
          <Casilla
            valor={parametros.prorratear_ordinarias === true}
            onChange={(v) => setParametro('prorratear_ordinarias', v)}
            etiqueta="Prorratear el salario mensual cuando se trabajan menos horas de las esperadas"
          />
          <p className="mt-2 text-xs text-tenue">
            Apagado (lo normal): el salario del mes es el salario, y lo único que lo baja son las{' '}
            <strong>ausencias</strong> registradas. Encendido: las horas que falten para completar las{' '}
            {parametros.horas_mes} h se descuentan igual que una ausencia. Solo prorratea si hay horas
            registradas, para no dejar en cero a quien no tenga tarjeta de tiempo.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-borde bg-panel-alto p-3">
          <Campo
            etiqueta="Con qué tarifa se costea una hora cargada a una orden"
            ayuda={
              (parametros.tarifa_mod_desde ?? 'valor_hora') === 'liquidacion'
                ? 'Tarifa real del período: costo-empresa de la persona ÷ horas de la jornada.'
                : 'Valor hora del salario, cargado con el factor prestacional.'
            }
          >
            {(id) => (
              <Selector
                id={id}
                valor={parametros.tarifa_mod_desde ?? 'valor_hora'}
                onChange={(v) => setParametro('tarifa_mod_desde', v)}
                opciones={[
                  { valor: 'valor_hora' as const, texto: 'Valor hora del salario × factor' },
                  { valor: 'liquidacion' as const, texto: 'Tarifa real del período (de la liquidación)' },
                ]}
              />
            )}
          </Campo>
          <p className="mt-2 text-xs text-tenue">
            <strong>Valor hora × factor</strong> es rápido y no necesita la nómina liquidada, pero deja
            por fuera lo que no es salario: el auxilio de transporte, una bonificación, un recargo ya
            pagado.{' '}
            <strong>Tarifa real del período</strong> divide el costo-empresa de cada persona entre las{' '}
            {parametros.horas_mes} h de su jornada, así que la hora trae todo adentro. Es el método que
            piden casi todos los talleres, y tiene una consecuencia buscada: las horas que no se
            imputaron a ninguna orden quedan sin absorber y se ven como <strong>tiempo ocioso</strong>{' '}
            en la página de Nómina. En este modo el factor no se vuelve a aplicar, porque la tarifa ya
            lo trae.
          </p>
        </div>

        <p className="mb-1 mt-5 text-xs font-medium uppercase tracking-wider text-tenue">
          Recargos
        </p>
        <p className="mb-3 text-xs text-tenue">
          <strong>Completo</strong> = la hora es adicional a la jornada y se paga entera por ese
          factor. <strong>Adicional</strong> = la hora ya se pagó como ordinaria y esto es solo el
          recargo de encima.
        </p>
        <Rejilla columnas={4}>
          {RECARGOS.map((r) => (
            <Campo
              key={r.clave}
              etiqueta={r.texto}
              ayuda={r.clase === 'completo' ? 'Completo' : 'Solo el adicional'}
            >
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

      <AportesEmpleador />

      {/* ---------- ARL ---------- */}
      <Tarjeta>
        <TituloSeccion nota="Cada trabajador tiene su clase de riesgo en la ficha; de ahí sale el porcentaje que le toca.">
          ARL por clase de riesgo
        </TituloSeccion>
        <Rejilla columnas={4}>
          {CLASES_ARL.map((clase) => (
            <Campo key={clase} etiqueta={`Clase ${clase}`}>
              {(id) => (
                <InputCifra
                  id={id}
                  valor={parametros.arl_clases?.[clase] ?? 0}
                  onChange={(n) =>
                    setParametro('arl_clases', { ...parametros.arl_clases, [clase]: n })
                  }
                  min={0}
                  paso={0.001}
                  sufijo="%"
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
          <Campo
            etiqueta="Capacidad normal del período"
            ayuda={
              (parametros.nivel_actividad_normal ?? 0) > 0
                ? `En ${UNIDAD_BASE[parametros.base_cif]}s. La tasa se divide entre esto, no entre lo real.`
                : 'En 0: la tasa se divide entre la actividad real del mes.'
            }
          >
            {(id) => (
              <InputCifra
                id={id}
                valor={parametros.nivel_actividad_normal ?? 0}
                paso={10}
                sufijo={UNIDAD_BASE[parametros.base_cif]}
                onChange={(n) => setParametro('nivel_actividad_normal', n)}
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

        <p className="mt-3 text-xs text-tenue">
          <strong>Capacidad normal.</strong> En 0, la tasa de CIF se calcula sobre la actividad real
          del mes: todo lo incurrido se reparte y la variación da cero. Con un número, la tasa se
          calcula sobre <em>esa</em> capacidad —es la tasa predeterminada de siempre— y entonces un mes
          flojo no encarece cada unidad: lo que la planta no alcanzó a absorber queda{' '}
          <strong>subaplicado</strong> y se ve en la página de CIF. Va en la unidad de la base
          elegida, así que si cambiás la base hay que volver a escribirla.
        </p>
      </Tarjeta>
    </div>
  )
}
