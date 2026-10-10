import { useState } from 'react'

import { Pestanas } from '../components/ui'
import { useEstado } from '../contexto'
import type { ID } from '../lib/tipos'
import { Conceptos } from './nomina/Conceptos'
import { Horas } from './nomina/Horas'
import { Liquidacion } from './nomina/Liquidacion'
import { Periodos } from './nomina/Periodos'
import { Trabajadores } from './nomina/Trabajadores'

type Seccion = 'trabajadores' | 'periodos' | 'horas' | 'liquidacion' | 'conceptos'

/**
 * El cascarón de Nómina. Cinco secciones en pestañas, porque no caben cinco
 * entradas más en el menú de arriba.
 *
 * El período seleccionado vive acá y no en cada sección: así pasar de «Horas»
 * a «Liquidación» no obliga a volver a elegirlo.
 */
export function Nomina() {
  const { nomina, calculado } = useEstado()
  const [seccion, setSeccion] = useState<Seccion>('trabajadores')
  const [periodoId, setPeriodoId] = useState<ID>('')

  const periodo = nomina.periodos.find((p) => p.id === periodoId) ?? nomina.periodos[0]

  return (
    <div className="space-y-5">
      <Pestanas<Seccion>
        valor={seccion}
        onChange={setSeccion}
        opciones={[
          { valor: 'trabajadores', texto: 'Trabajadores', insignia: calculado.conteos.trabajadores || undefined },
          { valor: 'periodos', texto: 'Períodos', insignia: calculado.conteos.periodosNomina || undefined },
          { valor: 'horas', texto: 'Horas y novedades', insignia: calculado.conteos.registrosHoras || undefined },
          { valor: 'liquidacion', texto: 'Liquidación' },
          { valor: 'conceptos', texto: 'Conceptos', insignia: calculado.conteos.conceptos || undefined },
        ]}
      />

      {seccion === 'trabajadores' && <Trabajadores />}
      {seccion === 'periodos' && <Periodos />}
      {seccion === 'horas' && <Horas periodo={periodo} setPeriodoId={setPeriodoId} />}
      {seccion === 'liquidacion' && <Liquidacion periodo={periodo} setPeriodoId={setPeriodoId} />}
      {seccion === 'conceptos' && <Conceptos />}
    </div>
  )
}
