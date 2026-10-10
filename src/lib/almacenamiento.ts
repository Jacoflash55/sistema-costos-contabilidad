/*
  Persistencia en el navegador. Copiado de `sistema-jacobo` (vivia dentro de
  su src/datos.ts) y movido a su propio modulo: asi se puede probar sin
  arrastrar los JSON de semilla ni el motor de calculo.

  NAMESPACE PROPIO. Todas las claves van con el prefijo `costos:`. Este
  proyecto NUNCA lee ni escribe claves `sistema-jacobo:*`: son dos apps
  distintas que pueden terminar en el mismo origen (localhost) y pisarse los
  datos.
*/

/** El prefijo de todas las claves de esta app. */
export const PREFIJO = 'costos:'

export const CLAVES = {
  config: `${PREFIJO}config`,
  nomina: `${PREFIJO}nomina`,
  inventario: `${PREFIJO}inventario`,
  produccion: `${PREFIJO}produccion`,
  cif: `${PREFIJO}cif`,
  comercial: `${PREFIJO}comercial`,
  tema: `${PREFIJO}tema`,
} as const

/** Las claves que guardan DATOS (no preferencias de interfaz). */
export const CLAVES_DATOS = [
  CLAVES.config,
  CLAVES.nomina,
  CLAVES.inventario,
  CLAVES.produccion,
  CLAVES.cif,
  CLAVES.comercial,
] as const

/*
  Todo envuelto en try/catch porque en modo incognito, con las cookies
  bloqueadas o al abrir el archivo desde file:// esto lanza. Sin persistencia
  la app sigue funcionando: solo no recuerda.
*/

export function leer<T>(clave: string, porDefecto: T): T {
  try {
    const raw = localStorage.getItem(clave)
    return raw ? (JSON.parse(raw) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

export function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin persistencia: la app sigue funcionando en memoria */
  }
}

export function borrar(clave: string): void {
  try {
    localStorage.removeItem(clave)
  } catch {
    /* nada */
  }
}

/** Si hay algo guardado en alguna de las claves de datos. */
export function hayDatosGuardados(): boolean {
  try {
    return CLAVES_DATOS.some((k) => localStorage.getItem(k) != null)
  } catch {
    return false
  }
}
