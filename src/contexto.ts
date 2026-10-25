import { createContext, useContext } from 'react'

import type { Calculado, ResultadoImportar } from './datos'
import type {
  AsignacionMO,
  CIF,
  CategoriaCIF,
  Cliente,
  ConceptoRemuneracion,
  Config,
  ConsumoMaterial,
  DatosCIF,
  DatosComercial,
  DatosCrudos,
  DatosInventario,
  DatosNomina,
  DatosProduccion,
  HojaRegistro,
  ID,
  ItemReceta,
  MateriaPrima,
  Mes,
  MovimientoKardex,
  Novedad,
  OrdenProduccion,
  OtroCostoDirecto,
  PeriodoNomina,
  Producto,
  SupuestoEquilibrio,
  TipoHoraRegistro,
  Trabajador,
} from './lib/tipos'

export type Tema = 'oscuro' | 'claro'

/**
 * Las acciones que BORRAN devuelven `string | null`: el texto del motivo si
 * no se pudo, o null si salio bien. Borrar una materia prima que ya tiene
 * movimientos o que esta en una receta rompe el historico, asi que el estado
 * dice no y la UI muestra por que.
 */
export type Resultado = string | null

export interface Estado {
  // ---------- datos crudos ----------
  config: Config
  nomina: DatosNomina
  inventario: DatosInventario
  produccion: DatosProduccion
  cif: DatosCIF
  comercial: DatosComercial
  /** Todo junto, para exportar. */
  datos: DatosCrudos

  // ---------- derivados ----------
  calculado: Calculado

  // ---------- configuracion ----------
  setConfig: (c: Config) => void

  // ---------- materias primas ----------
  crearMateriaPrima: (m: Omit<MateriaPrima, 'id'>) => ID
  actualizarMateriaPrima: (id: ID, parcial: Partial<MateriaPrima>) => void
  borrarMateriaPrima: (id: ID) => Resultado

  // ---------- productos y recetas ----------
  crearProducto: (p: Omit<Producto, 'id'>) => ID
  actualizarProducto: (id: ID, parcial: Partial<Producto>) => void
  borrarProducto: (id: ID) => Resultado
  /** Crea o reemplaza la receta vigente del producto. */
  guardarReceta: (productoId: ID, rendimiento: number, items: ItemReceta[]) => void

  // ---------- kardex ----------
  crearMovimiento: (m: Omit<MovimientoKardex, 'id'>) => ID
  borrarMovimiento: (id: ID) => void

  // ---------- ordenes de produccion ----------
  crearOrden: (o: Omit<OrdenProduccion, 'id'>) => ID
  actualizarOrden: (id: ID, parcial: Partial<OrdenProduccion>) => void
  borrarOrden: (id: ID) => Resultado
  crearConsumo: (c: Omit<ConsumoMaterial, 'id'>) => ID
  borrarConsumo: (id: ID) => void

  // ---------- nomina ----------
  crearTrabajador: (t: Omit<Trabajador, 'id'>) => ID
  actualizarTrabajador: (id: ID, parcial: Partial<Trabajador>) => void
  borrarTrabajador: (id: ID) => Resultado

  crearPeriodoNomina: (p: Omit<PeriodoNomina, 'id'>) => ID
  actualizarPeriodoNomina: (id: ID, parcial: Partial<PeriodoNomina>) => void
  borrarPeriodoNomina: (id: ID) => Resultado

  /**
   * Fija las horas de una clase para un trabajador en un periodo.
   *
   * Es un REEMPLAZO, no una suma: deja una sola fila con ese total y borra las
   * que hubiera de esa misma clase. Asi la vista consolidada del periodo
   * (trabajador x clase de hora) es directamente editable y nunca duplica.
   */
  fijarHoras: (trabajadorId: ID, periodoId: ID, tipo: TipoHoraRegistro, horas: number) => void
  /** Borra todas las horas de un trabajador en un periodo. */
  borrarHorasDe: (trabajadorId: ID, periodoId: ID) => void

  crearNovedad: (n: Omit<Novedad, 'id'>) => ID
  borrarNovedad: (id: ID) => void

  crearConcepto: (c: Omit<ConceptoRemuneracion, 'id'>) => ID
  actualizarConcepto: (id: ID, parcial: Partial<ConceptoRemuneracion>) => void
  borrarConcepto: (id: ID) => Resultado

  // ---------- mano de obra en las ordenes ----------
  crearAsignacionMO: (a: Omit<AsignacionMO, 'id'>) => ID
  borrarAsignacionMO: (id: ID) => void

  // ---------- CIF ----------
  crearCategoriaCIF: (c: Omit<CategoriaCIF, 'id'>) => ID
  actualizarCategoriaCIF: (id: ID, parcial: Partial<CategoriaCIF>) => void
  borrarCategoriaCIF: (id: ID) => Resultado
  crearCIF: (c: Omit<CIF, 'id'>) => ID
  actualizarCIF: (id: ID, parcial: Partial<CIF>) => void
  borrarCIF: (id: ID) => void

  // ---------- otros costos directos ----------
  crearOtroDirecto: (o: Omit<OtroCostoDirecto, 'id'>) => ID
  borrarOtroDirecto: (id: ID) => void

  // ---------- clientes ----------
  crearCliente: (c: Omit<Cliente, 'id'>) => ID
  actualizarCliente: (id: ID, parcial: Partial<Cliente>) => void
  borrarCliente: (id: ID) => Resultado

  // ---------- punto de equilibrio ----------
  /**
   * Fija (o borra) un supuesto a mano del analisis de equilibrio.
   *
   * `productoId` en null es la fila DEL PERIODO, la de los costos fijos. Un
   * campo en null vuelve a lo derivado, y cuando la fila se queda sin ningun
   * numero puesto a mano se borra sola: asi no quedan filas fantasma que
   * digan «manual» sin cambiar nada.
   */
  fijarSupuestoEquilibrio: (
    periodo: Mes,
    productoId: ID | null,
    parcial: Partial<Pick<SupuestoEquilibrio, 'costos_fijos' | 'precio_venta' | 'costo_variable_unitario' | 'mezcla_unidades'>>,
  ) => void
  /** Borra todos los supuestos de un periodo: vuelve a lo que el sistema deriva. */
  limpiarSupuestosEquilibrio: (periodo: Mes) => void

  // ---------- informes financieros ----------
  /**
   * Fija un numero a mano de los estados financieros: una cuenta del balance
   * o un parametro del estado de resultados.
   *
   * En 0 la fila se borra, porque una cuenta en cero es lo mismo que una
   * cuenta sin escribir y no vale la pena guardarla.
   */
  fijarValorInforme: (periodo: Mes, clave: string, monto: number) => void
  /** Borra todos los numeros a mano de un periodo. */
  limpiarValoresInforme: (periodo: Mes) => void

  // ---------- hojas de costos ----------
  /** Crea la hoja de una orden que todavia no tiene. Devuelve el id, o el de la que ya existia. */
  crearHoja: (ordenId: ID) => ID
  actualizarHoja: (id: ID, parcial: Partial<HojaRegistro>) => void
  borrarHoja: (id: ID) => Resultado
  /**
   * Congela la hoja. Devuelve el motivo si no se pudo (faltan datos
   * esenciales), o null si quedo finalizada.
   */
  finalizarHoja: (id: ID, motivo?: string) => Resultado
  /** Reabre una hoja finalizada para corregirla. La foto anterior se conserva. */
  reabrirHoja: (id: ID) => void

  // ---------- respaldo ----------
  exportarTodo: () => void
  importarTodo: (texto: string) => ResultadoImportar
  reiniciar: () => void
  hayCambiosLocales: boolean

  // ---------- interfaz ----------
  tema: Tema
  alternarTema: () => void
}

/**
 * El contexto vive en su propio modulo, aparte del componente que lo provee.
 *
 * Si el `createContext` estuviera en el mismo archivo que <ProveedorEstado>,
 * ese archivo exportaria un componente Y otras cosas, y React Fast Refresh no
 * puede refrescar modulos mezclados: al guardar un cambio recreaba el
 * contexto y los consumidores veian `null`, con la pantalla en blanco.
 */
export const ContextoEstado = createContext<Estado | null>(null)

export function useEstado(): Estado {
  const v = useContext(ContextoEstado)
  if (!v) throw new Error('useEstado tiene que usarse dentro de <ProveedorEstado>')
  return v
}
