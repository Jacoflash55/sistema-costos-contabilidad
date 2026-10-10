import {
  Aviso,
  Boton,
  BotonConfirmar,
  Cifra,
  Pildora,
  Rejilla,
  Tabla,
  Tarjeta,
  TituloSeccion,
} from '../../components/ui'
import type { Columna, Tono } from '../../components/ui'
import { useEstado } from '../../contexto'
import { cantidad as fmtCantidad, cop, copPreciso } from '../../lib/formato'
import { hojaDeOrden } from '../../lib/hoja'
import type { ID, OrdenProduccion } from '../../lib/tipos'

/** Una fila: la orden con su hoja, si ya tiene. */
interface Fila {
  orden: OrdenProduccion
  hojaId: ID | null
}

export function ListaHojas({ abrir }: { abrir: (hojaId: ID) => void }) {
  const { produccion, calculado, crearHoja, borrarHoja } = useEstado()

  const filas: Fila[] = produccion.ordenes
    .filter((o) => o.estado !== 'anulada')
    .map((orden) => ({ orden, hojaId: hojaDeOrden(produccion.hojas, orden.id)?.id ?? null }))

  const productoPorId = new Map(produccion.productos.map((p) => [p.id, p]))

  const columnas: Columna<Fila>[] = [
    {
      clave: 'hoja',
      titulo: 'Hoja',
      valor: (f) => (f.hojaId ? (calculado.hojasPorOrden[f.orden.id]?.numero ?? '') : 'zzz'),
      render: (f) => {
        const hoja = calculado.hojasPorOrden[f.orden.id]
        if (!hoja) return <span className="text-xs text-tenue">sin hoja</span>
        return (
          <div>
            <p className="cifra font-medium">{hoja.numero}</p>
            <p className="text-xs text-tenue">{hoja.fecha_elaboracion}</p>
          </div>
        )
      },
    },
    {
      clave: 'orden',
      titulo: 'Orden / producto',
      valor: (f) => f.orden.numero,
      render: (f) => (
        <div>
          <p className="cifra font-medium">{f.orden.numero}</p>
          <p className="text-xs text-tenue">
            {productoPorId.get(f.orden.producto_id)?.nombre ?? 'producto borrado'}
          </p>
        </div>
      ),
    },
    {
      clave: 'periodo',
      titulo: 'Período CIF',
      soloAncho: true,
      valor: (f) => calculado.periodoPorOrden[f.orden.id] ?? '',
      render: (f) => (
        <span className="cifra text-xs text-suave">{calculado.periodoPorOrden[f.orden.id] ?? '—'}</span>
      ),
    },
    {
      clave: 'producida',
      titulo: 'Producida',
      alineacion: 'der',
      valor: (f) => f.orden.cantidad_terminada ?? -1,
      render: (f) =>
        f.orden.cantidad_terminada == null ? (
          <span className="text-xs text-aviso">sin definir</span>
        ) : (
          <span className="cifra tabular-nums">{fmtCantidad(f.orden.cantidad_terminada, 0)}</span>
        ),
    },
    {
      clave: 'total',
      titulo: 'Costo total',
      alineacion: 'der',
      valor: (f) => calculado.hojasPorOrden[f.orden.id]?.costo_total ?? 0,
      render: (f) => {
        const hoja = calculado.hojasPorOrden[f.orden.id]
        if (!hoja) return <span className="text-tenue">—</span>
        return <span className="cifra tabular-nums">{cop(hoja.costo_total)}</span>
      },
    },
    {
      clave: 'unitario',
      titulo: 'Costo unitario',
      alineacion: 'der',
      valor: (f) => calculado.hojasPorOrden[f.orden.id]?.costo_unitario ?? 0,
      render: (f) => {
        const hoja = calculado.hojasPorOrden[f.orden.id]
        if (!hoja) return <span className="text-tenue">—</span>
        if (hoja.cantidad_producida <= 0) return <span className="text-xs text-aviso">sin definir</span>
        return <span className="cifra tabular-nums font-medium">{copPreciso(hoja.costo_unitario)}</span>
      },
    },
    {
      clave: 'precio',
      titulo: 'Precio sugerido',
      alineacion: 'der',
      soloAncho: true,
      valor: (f) => calculado.hojasPorOrden[f.orden.id]?.precio_sugerido ?? 0,
      render: (f) => {
        const hoja = calculado.hojasPorOrden[f.orden.id]
        if (!hoja) return <span className="text-tenue">—</span>
        if (hoja.precio_sugerido == null) return <span className="text-xs text-negativo">no calculable</span>
        return <span className="cifra tabular-nums text-acento">{cop(hoja.precio_sugerido)}</span>
      },
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      valor: (f) => calculado.hojasPorOrden[f.orden.id]?.estado ?? 'sin hoja',
      render: (f) => {
        const hoja = calculado.hojasPorOrden[f.orden.id]
        if (!hoja) return <Pildora>Sin hoja</Pildora>
        if (hoja.estado === 'finalizada') {
          return <Pildora tono="positivo">Finalizada v{hoja.version}</Pildora>
        }
        return (
          <Pildora tono={hoja.completa ? 'aviso' : 'negativo'}>
            {hoja.completa ? 'Borrador' : 'Falta info'}
          </Pildora>
        )
      },
    },
    {
      clave: 'acciones',
      titulo: '',
      alineacion: 'der',
      render: (f) =>
        f.hojaId ? (
          <span className="inline-flex gap-1.5">
            <Boton variante="secundario" onClick={() => abrir(f.hojaId!)}>
              Ver hoja
            </Boton>
            <BotonConfirmar variante="fantasma" onConfirmar={() => borrarHoja(f.hojaId!)}>
              ✕
            </BotonConfirmar>
          </span>
        ) : (
          <Boton variante="primario" onClick={() => abrir(crearHoja(f.orden.id))}>
            Generar hoja
          </Boton>
        ),
    },
  ]

  const tono = (f: Fila): Tono | null => {
    const hoja = calculado.hojasPorOrden[f.orden.id]
    if (!hoja) return null
    if (hoja.estado === 'finalizada') return 'positivo'
    return hoja.completa ? null : 'negativo'
  }

  const totalCosteado = Object.values(calculado.hojasPorOrden).reduce((s, h) => s + h.costo_total, 0)

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloSeccion nota="Una hoja por orden. Los tres bloques se llenan solos: material del Kardex, mano de obra de la nómina, CIF de la tasa del período.">
          Hojas de costos
        </TituloSeccion>

        <Rejilla columnas={4}>
          <Cifra etiqueta="Órdenes vivas" valor={filas.length} tamano="sm" />
          <Cifra etiqueta="Con hoja" valor={calculado.conteos.hojas} tamano="sm" />
          <Cifra
            etiqueta="Finalizadas"
            valor={calculado.conteos.hojasFinalizadas}
            tono="positivo"
            tamano="sm"
          />
          <Cifra etiqueta="Costo total costeado" valor={cop(totalCosteado)} tono="acento" tamano="sm" />
        </Rejilla>
      </Tarjeta>

      {filas.length === 0 && (
        <Aviso tono="aviso" titulo="Todavía no hay órdenes">
          La hoja de costos es de una orden de producción. Creá una en Órdenes, consumile materiales,
          imputale mano de obra y registrá los CIF del período: la hoja sale armada.
        </Aviso>
      )}

      <Tarjeta>
        <Tabla
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.orden.id}
          filtrable
          placeholderFiltro="Buscar orden, producto o número de hoja…"
          ordenInicial={{ clave: 'orden', asc: true }}
          resaltarFila={tono}
          vacio="Sin órdenes para costear."
        />
      </Tarjeta>
    </div>
  )
}
