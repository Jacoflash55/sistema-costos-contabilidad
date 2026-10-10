import { useState } from 'react'

import { Pestanas } from '../components/ui'
import { useEstado } from '../contexto'
import type { ID } from '../lib/tipos'
import { Clientes } from './hojas/Clientes'
import { ListaHojas } from './hojas/ListaHojas'
import { VistaHoja } from './hojas/VistaHoja'

type Seccion = 'hojas' | 'clientes'

/**
 * El cascarón de Hojas de costos.
 *
 * Los clientes viven acá porque es lo que necesita el encabezado de la hoja;
 * la orden los elige de esta misma lista.
 */
export function HojasCostos() {
  const { produccion, calculado } = useEstado()
  const [seccion, setSeccion] = useState<Seccion>('hojas')
  const [abierta, setAbierta] = useState<ID | null>(null)

  /*
    Si la hoja abierta se borró, `registro` queda en undefined y abajo se
    muestra la lista. No hace falta tocar el estado durante el render: basta
    con derivar y dejar que el próximo clic lo limpie.
  */
  const registro = abierta ? produccion.hojas.find((h) => h.id === abierta) : undefined

  return (
    <div className="space-y-5">
      <div className="no-imprimir">
        <Pestanas<Seccion>
          valor={seccion}
          onChange={(v) => {
            setSeccion(v)
            setAbierta(null)
          }}
          opciones={[
            { valor: 'hojas', texto: 'Hojas de costos', insignia: calculado.conteos.hojas || undefined },
            { valor: 'clientes', texto: 'Clientes', insignia: calculado.conteos.clientes || undefined },
          ]}
        />
      </div>

      {seccion === 'clientes' ? (
        <Clientes />
      ) : registro ? (
        <VistaHoja registro={registro} cerrar={() => setAbierta(null)} />
      ) : (
        <ListaHojas abrir={setAbierta} />
      )}
    </div>
  )
}
