/*
  Formato de numeros. Copiado de `sistema-jacobo` (src/lib/formato.ts) tal
  cual en `cop`, `copCorto` y `pct`, para que las dos apps muestren la plata
  igual. Lo que era propio de las finanzas personales (el catalogo de cajitas)
  no se trajo.
*/

/** Formato de plata colombiana: $1.450.766, sin decimales. */
export function cop(n: number, opciones: { signo?: boolean } = {}): string {
  const s = Math.abs(Math.round(n)).toLocaleString('es-CO')
  const prefijo = n < 0 ? '−' : opciones.signo ? '+' : ''
  return `${prefijo}$${s}`
}

/** Version corta para ejes de graficas: $1,5 M / $450 k */
export function copCorto(n: number): string {
  const abs = Math.abs(n)
  const signo = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1000)} k`
  return `${signo}$${abs}`
}

export function pct(n: number, decimales = 1): string {
  return `${n.toLocaleString('es-CO', { maximumFractionDigits: decimales })}%`
}

/**
 * Cantidades de inventario y horas. A diferencia de la plata, aqui los
 * decimales SI importan: 2,5 kg no es lo mismo que 3 kg.
 */
export function cantidad(n: number, decimales = 2): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: decimales })
}

/** Plata con decimales, para costos unitarios chicos ($1.234,56). */
export function copPreciso(n: number, decimales = 2): string {
  const s = Math.abs(n).toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
  return `${n < 0 ? '−' : ''}$${s}`
}
