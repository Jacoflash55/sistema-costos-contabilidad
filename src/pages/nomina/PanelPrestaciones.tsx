import { Aviso, Boton, Casilla, CeldaEditable, Cifra, Pildora, Tabla } from '../../components/ui'
import type { Columna } from '../../components/ui'
import { pct } from '../../lib/formato'
import { ETIQUETA_GRUPO, ID_ARL, factorPrestacionalDe, lineasAporteDe } from '../../lib/nomina'
import type { LineaEfectiva } from '../../lib/nomina'
import type { ParametrosCalculo, Trabajador } from '../../lib/tipos'

/**
 * Las prestaciones de UNA persona.
 *
 * Por defecto hereda todo de la configuración: ahí `aportes_override` no
 * existe y cambiar un porcentaje global la recalcula. Al decir que no son
 * iguales, cada línea se puede mover solo para ella, y entonces los cambios
 * globales dejan de tocarla.
 */
export function PanelPrestaciones({
  borrador,
  parametros,
  onChange,
}: {
  borrador: Omit<Trabajador, 'id'>
  parametros: ParametrosCalculo
  onChange: (override: Trabajador['aportes_override']) => void
}) {
  const persona: Trabajador = { ...borrador, id: 'borrador' }
  const lineas = lineasAporteDe(persona, parametros)
  const factor = factorPrestacionalDe(persona, parametros)

  const hereda = borrador.aportes_override == null

  /** El factor que tendría si heredara todo, para poder comparar. */
  const factorGlobal = factorPrestacionalDe(
    { ...persona, aportes_override: undefined },
    parametros,
  )

  const set = (id: string, parcial: { pct?: number; activo?: boolean }) =>
    onChange({
      ...(borrador.aportes_override ?? {}),
      [id]: { ...(borrador.aportes_override?.[id] ?? {}), ...parcial },
    })

  const columnas: Columna<LineaEfectiva>[] = [
    {
      clave: 'nombre',
      titulo: 'Concepto',
      valor: (l) => l.nombre,
      render: (l) => (
        <div>
          <p className={l.activo ? '' : 'text-tenue line-through'}>{l.nombre}</p>
          <p className="text-xs text-tenue">
            {ETIQUETA_GRUPO[l.grupo]}
            {l.id === ID_ARL && ' · sale de la clase de riesgo'}
          </p>
        </div>
      ),
    },
    {
      clave: 'pct',
      titulo: '%',
      alineacion: 'der',
      valor: (l) => l.pct,
      render: (l) =>
        hereda ? (
          <span className="cifra tabular-nums">{pct(l.pct, 3)}</span>
        ) : (
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
      render: (l) =>
        hereda ? (
          <span className="text-xs text-suave">{l.activo ? 'Sí' : 'No'}</span>
        ) : (
          <Casilla valor={l.activo} onChange={(v) => set(l.id, { activo: v })} etiqueta="" />
        ),
    },
    {
      clave: 'origen',
      titulo: 'Origen',
      valor: (l) => l.origen,
      render: (l) =>
        l.origen === 'trabajador' ? (
          <Pildora tono="aviso">Propio</Pildora>
        ) : (
          <span className="text-xs text-tenue">Global</span>
        ),
    },
  ]

  return (
    <div className="mt-4 rounded-lg border border-borde bg-panel-alto p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Prestaciones de esta persona</p>
          <p className="text-xs text-tenue">
            {hereda
              ? 'Hereda todo de la configuración: si cambiás un porcentaje global, se recalcula sola.'
              : 'Tiene porcentajes propios: los cambios globales ya no la tocan.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hereda ? (
            <Boton
              variante="secundario"
              onClick={() => onChange({ [ID_ARL]: {} })}
              titulo="Abrir los porcentajes solo para esta persona"
            >
              No, son distintas
            </Boton>
          ) : (
            <Boton variante="secundario" onClick={() => onChange(undefined)}>
              Volver a las globales
            </Boton>
          )}
        </div>
      </div>

      <Cifra
        etiqueta="Factor prestacional de esta persona"
        valor={pct(factor * 100, 3)}
        tono="acento"
        tamano="sm"
        pie={
          hereda
            ? 'Suma de las líneas activas más su ARL'
            : `Si heredara todo sería ${pct(factorGlobal * 100, 3)}`
        }
      />

      <div className="mt-3">
        <Tabla columnas={columnas} filas={lineas} claveFila={(l) => l.id} vacio="Sin líneas." />
      </div>

      {!hereda && (
        <div className="mt-3">
          <Aviso tono="aviso">
            Mientras tenga porcentajes propios, esta persona <strong>no</strong> se actualiza cuando
            cambien los globales. Es lo que se quiere para el que gana 10 SMLMV o más y sí causa salud,
            SENA e ICBF aunque la empresa esté exonerada; para todos los demás conviene heredar.
          </Aviso>
        </div>
      )}
    </div>
  )
}
