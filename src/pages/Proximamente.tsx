import { Tarjeta } from '../components/ui'

export function Proximamente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <Tarjeta className="mx-auto max-w-xl text-center">
      <p className="text-3xl" aria-hidden>
        🚧
      </p>
      <h2 className="mt-3 text-lg font-semibold tracking-tight">{titulo}</h2>
      <p className="mt-2 text-sm leading-relaxed text-suave">{descripcion}</p>
      <p className="mt-4 text-xs text-tenue">
        Las entidades de esta página ya están definidas en <code>src/lib/tipos.ts</code>, así que los
        datos que entren después van a encajar sin migrar nada.
      </p>
    </Tarjeta>
  )
}
