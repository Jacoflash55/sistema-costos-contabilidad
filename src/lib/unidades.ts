/**
 * Unidades de medida: como se llaman y cuando se pueden mezclar.
 *
 * El sistema permite pedir una materia prima en una unidad distinta a la que
 * se guarda (300 g de un material que vive en kg), pero NUNCA mezclar cosas
 * que no miden lo mismo: no hay forma de pasar de litros a kilos sin conocer
 * la densidad, y si eso se deja pasar el Kardex queda sin sentido.
 *
 * Funciones puras. Ni React ni estado.
 */

import type { UnidadMedida } from './tipos'

/** Que mide cada unidad. Solo se convierte dentro de la misma dimension. */
type Dimension = 'masa' | 'volumen' | 'longitud' | 'area' | 'conteo' | 'empaque' | 'tiempo'

/**
 * Cada unidad con su dimension y cuanto vale en la unidad base de esa
 * dimension (kg, litro, metro, m2, unidad, paquete, hora).
 *
 * `paquete` es su propia dimension a proposito: un paquete no se puede
 * convertir a unidades sin saber cuantas trae, y ese dato no esta aqui.
 */
const UNIDADES_INFO: Record<UnidadMedida, { dimension: Dimension; factor: number; nombre: string; corta: string }> = {
  unidad: { dimension: 'conteo', factor: 1, nombre: 'Unidad', corta: 'un' },
  paquete: { dimension: 'empaque', factor: 1, nombre: 'Paquete', corta: 'paq' },
  kg: { dimension: 'masa', factor: 1, nombre: 'Kilogramo', corta: 'kg' },
  g: { dimension: 'masa', factor: 0.001, nombre: 'Gramo', corta: 'g' },
  libra: { dimension: 'masa', factor: 0.45359237, nombre: 'Libra', corta: 'lb' },
  litro: { dimension: 'volumen', factor: 1, nombre: 'Litro', corta: 'L' },
  ml: { dimension: 'volumen', factor: 0.001, nombre: 'Mililitro', corta: 'ml' },
  metro: { dimension: 'longitud', factor: 1, nombre: 'Metro', corta: 'm' },
  cm: { dimension: 'longitud', factor: 0.01, nombre: 'Centímetro', corta: 'cm' },
  m2: { dimension: 'area', factor: 1, nombre: 'Metro cuadrado', corta: 'm²' },
  hora: { dimension: 'tiempo', factor: 1, nombre: 'Hora', corta: 'h' },
}

/** Todas las unidades, en el orden en que se muestran en los selectores. */
export const UNIDADES = Object.keys(UNIDADES_INFO) as UnidadMedida[]

/** 'Kilogramo'. Para los selectores. */
export function nombreUnidad(u: UnidadMedida): string {
  return UNIDADES_INFO[u]?.nombre ?? u
}

/** 'kg'. Para las tablas, al lado de la cantidad. */
export function unidadCorta(u: UnidadMedida): string {
  return UNIDADES_INFO[u]?.corta ?? u
}

/** Si las dos unidades miden lo mismo y por lo tanto se pueden convertir. */
export function compatibles(a: UnidadMedida, b: UnidadMedida): boolean {
  const ia = UNIDADES_INFO[a]
  const ib = UNIDADES_INFO[b]
  return !!ia && !!ib && ia.dimension === ib.dimension
}

/**
 * Convierte una cantidad entre unidades de la misma dimension.
 *
 * Devuelve `null` cuando no son compatibles, en vez de lanzar o de inventar
 * un numero: quien llame decide si eso es un error que bloquea o una alerta.
 */
export function convertir(cantidad: number, de: UnidadMedida, a: UnidadMedida): number | null {
  if (de === a) return cantidad
  if (!compatibles(de, a)) return null
  return (cantidad * UNIDADES_INFO[de].factor) / UNIDADES_INFO[a].factor
}

/** El mensaje que ve el usuario cuando intenta mezclar peras con litros. */
export function mensajeIncompatible(de: UnidadMedida, a: UnidadMedida): string {
  return `No se puede pasar de ${nombreUnidad(de).toLowerCase()} a ${nombreUnidad(a).toLowerCase()}: miden cosas distintas.`
}
