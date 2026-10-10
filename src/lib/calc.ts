/**
 * EL MOTOR DE CALCULO. Funciones PURAS: entran datos, salen numeros. Nada de
 * React, nada de localStorage, nada de `new Date()` sin que se lo pasen.
 *
 * Es el mismo patron de `sistema-jacobo/src/lib/calc.ts`: todas las formulas
 * viven aqui y se prueban desde `tests/`, y `src/datos.ts` las junta en un
 * unico `calcularTodo` que la UI consume ya resuelto.
 *
 * Por ahora solo esta el redondeo. Las formulas de negocio entran por etapas:
 *
 *   1. NOMINA        valor hora, recargos, liquidacion, costo hora cargado
 *   2. KARDEX        promedio ponderado / PEPS / UEPS, saldos valorados
 *   3. CIF           tasa por base de actividad, aplicado vs real, variacion
 *   4. HOJA DE COSTOS materiales + MOD + CIF, costo unitario, precio sugerido
 *   5. INFORMES      estado de costos de produccion y ventas, margenes
 *
 * AVISO ACADEMICO: cuando se escriban, las formulas de nomina usaran los
 * parametros editables de `ParametrosCalculo` (recargos y factor
 * prestacional). Son valores de ejercicio, no una implementacion de la ley
 * laboral colombiana vigente.
 */

// =====================================================================
// 1. REDONDEO
// =====================================================================

/**
 * Redondea hacia arriba al siguiente multiplo (por defecto, el millar).
 *
 * Copiado de `sistema-jacobo`. Mismo comportamiento y mismo error cuando el
 * multiplo no sirve, para que los dos proyectos redondeen igual.
 */
export function redondearArriba(valor: number, multiplo = 1000): number {
  if (multiplo <= 0) throw new Error('El multiplo debe ser mayor que 0')
  return Math.ceil(valor / multiplo) * multiplo
}

/**
 * Division que no explota: si el divisor es 0 devuelve 0 en vez de Infinity o
 * NaN.
 *
 * Se usa en todo el sistema para los costos unitarios (costo / cantidad) y
 * para las tasas de CIF (CIF / nivel de actividad): una orden sin unidades
 * terminadas o un periodo sin actividad son situaciones normales, no errores.
 */
export function divSegura(numerador: number, denominador: number): number {
  return denominador === 0 ? 0 : numerador / denominador
}
