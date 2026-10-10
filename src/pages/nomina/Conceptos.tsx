import { useState } from 'react'

import {
  Aviso,
  Boton,
  BotonConfirmar,
  Campo,
  Casilla,
  InputCifra,
  InputTexto,
  Pildora,
  Rejilla,
  Selector,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Columna } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cop, pct } from '../../lib/formato'
import type { ConceptoRemuneracion, ID } from '../../lib/tipos'

const TIPOS: ReadonlyArray<{ valor: ConceptoRemuneracion['tipo']; texto: string }> = [
  { valor: 'devengado', texto: 'Devengado (suma a lo que recibe)' },
  { valor: 'deduccion', texto: 'Deducción (resta de lo que recibe)' },
  { valor: 'aporte_patronal', texto: 'Aporte patronal (lo paga la empresa)' },
  { valor: 'prestacion', texto: 'Prestación (provisión de la empresa)' },
]

const BASES: ReadonlyArray<{ valor: ConceptoRemuneracion['base']; texto: string }> = [
  { valor: 'fijo', texto: 'Monto fijo' },
  { valor: 'salario_basico', texto: '% del salario del período' },
  { valor: 'total_devengado', texto: '% del devengado por horas' },
  { valor: 'base_prestacional', texto: '% de la base prestacional' },
]

const VACIO: Omit<ConceptoRemuneracion, 'id'> = {
  nombre: '',
  tipo: 'deduccion',
  base: 'fijo',
  porcentaje: null,
  monto_fijo: null,
  afecta_base_prestacional: false,
  automatico: false,
  activo: true,
  nota: '',
}

export function Conceptos() {
  const { nomina, crearConcepto, actualizarConcepto, borrarConcepto } = useEstado()

  const [borrador, setBorrador] = useState<Omit<ConceptoRemuneracion, 'id'>>(VACIO)
  const [editando, setEditando] = useState<ID | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conceptos = nomina.conceptos

  const set = <K extends keyof ConceptoRemuneracion>(clave: K, valor: ConceptoRemuneracion[K]) =>
    setBorrador((b) => ({ ...b, [clave]: valor }))

  const limpiar = () => {
    setBorrador(VACIO)
    setEditando(null)
    setAbierto(false)
    setError(null)
  }

  const guardar = () => {
    const nombre = borrador.nombre.trim()
    if (!nombre) return setError('El nombre es obligatorio.')
    if (borrador.base === 'fijo' && borrador.automatico && !borrador.monto_fijo) {
      return setError('Un concepto automático de monto fijo necesita un monto.')
    }
    if (borrador.base !== 'fijo' && !borrador.porcentaje) {
      return setError('Un concepto porcentual necesita un porcentaje.')
    }

    const limpio: Omit<ConceptoRemuneracion, 'id'> = {
      ...borrador,
      nombre,
      // solo se guarda el campo que corresponde a la base elegida
      porcentaje: borrador.base === 'fijo' ? null : borrador.porcentaje,
      monto_fijo: borrador.base === 'fijo' ? borrador.monto_fijo : null,
    }

    if (editando) actualizarConcepto(editando, limpio)
    else crearConcepto(limpio)
    limpiar()
  }

  const editar = (c: ConceptoRemuneracion) => {
    const { id: _id, ...resto } = c
    setBorrador(resto)
    setEditando(c.id)
    setAbierto(true)
    setError(null)
  }

  const eliminar = (c: ConceptoRemuneracion) => {
    const motivo = borrarConcepto(c.id)
    setError(motivo ? `No se pudo borrar «${c.nombre}»: ${motivo}` : null)
  }

  const columnas: Columna<ConceptoRemuneracion>[] = [
    {
      clave: 'nombre',
      titulo: 'Concepto',
      valor: (c) => c.nombre,
      render: (c) => (
        <div>
          <p className="font-medium">{c.nombre}</p>
          {c.nota && <p className="text-xs text-tenue">{c.nota}</p>}
        </div>
      ),
    },
    {
      clave: 'tipo',
      titulo: 'Tipo',
      valor: (c) => c.tipo,
      render: (c) => (
        <Pildora tono={c.tipo === 'deduccion' ? 'negativo' : c.tipo === 'devengado' ? 'positivo' : 'neutro'}>
          {TIPOS.find((t) => t.valor === c.tipo)?.texto.split(' (')[0] ?? c.tipo}
        </Pildora>
      ),
    },
    {
      clave: 'valor',
      titulo: 'Valor',
      alineacion: 'der',
      valor: (c) => c.porcentaje ?? c.monto_fijo ?? 0,
      render: (c) =>
        c.base === 'fijo' ? (
          <span className="cifra tabular-nums">
            {c.monto_fijo == null ? 'por novedad' : cop(c.monto_fijo)}
          </span>
        ) : (
          <span className="cifra tabular-nums">{pct(c.porcentaje ?? 0)}</span>
        ),
    },
    {
      clave: 'base',
      titulo: 'Base',
      soloAncho: true,
      valor: (c) => c.base,
      render: (c) => (
        <span className="text-xs text-suave">{BASES.find((b) => b.valor === c.base)?.texto ?? c.base}</span>
      ),
    },
    {
      clave: 'automatico',
      titulo: 'Cuándo aplica',
      valor: (c) => (c.automatico ? 'automatico' : 'novedad'),
      render: (c) =>
        c.automatico ? (
          <span className="text-xs text-suave">
            Automático
            {c.requiere_auxilio_transporte && ' (solo con auxilio)'}
          </span>
        ) : (
          <span className="text-xs text-tenue">Por novedad</span>
        ),
    },
    {
      clave: 'prestacional',
      titulo: 'Base prest.',
      soloAncho: true,
      valor: (c) => (c.afecta_base_prestacional ? 'si' : 'no'),
      render: (c) => (c.afecta_base_prestacional ? 'Sí' : <span className="text-tenue">No</span>),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (c) => (c.activo ? 'activo' : 'inactivo'),
      render: (c) => (c.activo ? <Pildora tono="positivo">Activo</Pildora> : <Pildora>Inactivo</Pildora>),
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
          nota="Lo que se puede devengar y deducir. Todo editable."
          acciones={
            !abierto && (
              <Boton variante="primario" onClick={() => setAbierto(true)}>
                + Nuevo concepto
              </Boton>
            )
          }
        >
          Catálogo de conceptos
        </TituloSeccion>

        <Aviso tono="aviso" titulo="Modelo académico">
          Los porcentajes de la semilla (salud 4%, pensión 4%) y el monto del auxilio de transporte
          son valores de <strong>ejercicio</strong>, editables acá. El modelo no maneja IBC, topes ni
          bases especiales, y no garantiza cumplimiento legal. Lo que la empresa paga por encima del
          devengado se modela con el <strong>factor prestacional</strong> de la configuración, no
          sumando aportes uno por uno.
        </Aviso>
      </Tarjeta>

      {error && <Aviso tono="negativo">{error}</Aviso>}

      {abierto && (
        <Tarjeta>
          <TituloSeccion>{editando ? `Editar «${borrador.nombre}»` : 'Nuevo concepto'}</TituloSeccion>
          <Rejilla columnas={3}>
            <Campo etiqueta="Nombre *">
              {(id) => (
                <InputTexto
                  id={id}
                  valor={borrador.nombre}
                  onChange={(v) => set('nombre', v)}
                  placeholder="Bonificación por producción"
                />
              )}
            </Campo>
            <Campo etiqueta="Tipo">
              {(id) => <Selector id={id} valor={borrador.tipo} onChange={(v) => set('tipo', v)} opciones={TIPOS} />}
            </Campo>
            <Campo etiqueta="Base de cálculo">
              {(id) => <Selector id={id} valor={borrador.base} onChange={(v) => set('base', v)} opciones={BASES} />}
            </Campo>

            {borrador.base === 'fijo' ? (
              <Campo
                etiqueta="Monto fijo"
                ayuda="Vacío (0) = el monto se escribe en cada novedad."
              >
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={borrador.monto_fijo ?? 0}
                    onChange={(n) => set('monto_fijo', n > 0 ? n : null)}
                    paso={10_000}
                    sufijo="$"
                  />
                )}
              </Campo>
            ) : (
              <Campo etiqueta="Porcentaje">
                {(id) => (
                  <InputCifra
                    id={id}
                    valor={borrador.porcentaje ?? 0}
                    onChange={(n) => set('porcentaje', n > 0 ? n : null)}
                    paso={0.5}
                    sufijo="%"
                  />
                )}
              </Campo>
            )}

            <Campo etiqueta="Nota">
              {(id) => <InputTexto id={id} valor={borrador.nota ?? ''} onChange={(v) => set('nota', v)} />}
            </Campo>
          </Rejilla>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4">
              <Casilla
                valor={borrador.automatico}
                onChange={(v) => set('automatico', v)}
                etiqueta="Automático (se aplica a todos sin registrar nada)"
              />
              {borrador.automatico && (
                <Casilla
                  valor={borrador.requiere_auxilio_transporte ?? false}
                  onChange={(v) => set('requiere_auxilio_transporte', v || undefined)}
                  etiqueta="Solo a quien reciba auxilio de transporte"
                />
              )}
              <Casilla
                valor={borrador.afecta_base_prestacional}
                onChange={(v) => set('afecta_base_prestacional', v)}
                etiqueta="Entra a la base prestacional"
              />
              <Casilla valor={borrador.activo} onChange={(v) => set('activo', v)} etiqueta="Activo" />
            </div>
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
          filas={conceptos}
          claveFila={(c) => c.id}
          ordenInicial={{ clave: 'tipo', asc: true }}
          vacio="El catálogo está vacío."
        />
      </Tarjeta>
    </div>
  )
}
