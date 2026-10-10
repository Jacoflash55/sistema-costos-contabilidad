import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { ContextoEstado } from './contexto'
import type { Estado, Resultado, Tema } from './contexto'
import {
  CIF_BASE,
  CLAVES,
  COMERCIAL_BASE,
  CONFIG_BASE,
  INVENTARIO_BASE,
  NOMINA_BASE,
  PRODUCCION_BASE,
  armarRespaldo,
  borrar,
  calcularTodo,
  guardar,
  hayDatosGuardados,
  hoy,
  leer,
  leerRespaldo,
} from './datos'
import type { ResultadoImportar } from './datos'
import {
  armarHoja,
  finalizarHoja as finalizarHojaPuro,
  hojaDeOrden,
  reabrirHoja as reabrirHojaPuro,
  siguienteNumeroHoja,
} from './lib/hoja'
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
  DatosInventario,
  DatosNomina,
  DatosProduccion,
  HojaRegistro,
  ID,
  ItemReceta,
  MateriaPrima,
  MovimientoKardex,
  Novedad,
  OrdenProduccion,
  OtroCostoDirecto,
  PeriodoNomina,
  Producto,
  Receta,
  TipoHoraRegistro,
  Trabajador,
} from './lib/tipos'

/**
 * Un id nuevo. No hay base de datos ni servidor: basta con que no se repita
 * dentro de este navegador, y el reloj mas un puñado de caracteres al azar
 * alcanza de sobra.
 */
function nuevoId(): ID {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Reemplaza una fila por id, dejando el resto igual. */
function conCambio<T extends { id: ID }>(lista: T[], id: ID, parcial: Partial<T>): T[] {
  return lista.map((f) => (f.id === id ? { ...f, ...parcial } : f))
}

/**
 * Este archivo exporta UN SOLO componente y nada mas. Los datos, el calculo y
 * el contexto viven en `datos.ts` y `contexto.ts` justamente para que React
 * Fast Refresh pueda recargarlo sin romper el estado.
 */
export function ProveedorEstado({ children }: { children: ReactNode }) {
  const [config, setConfigRaw] = useState<Config>(() => leer(CLAVES.config, CONFIG_BASE))
  const [nomina, setNomina] = useState<DatosNomina>(() => leer(CLAVES.nomina, NOMINA_BASE))
  const [inventario, setInventario] = useState<DatosInventario>(() =>
    leer(CLAVES.inventario, INVENTARIO_BASE),
  )
  const [produccion, setProduccion] = useState<DatosProduccion>(() =>
    leer(CLAVES.produccion, PRODUCCION_BASE),
  )
  const [cif, setCif] = useState<DatosCIF>(() => leer(CLAVES.cif, CIF_BASE))
  const [comercial, setComercial] = useState<DatosComercial>(() =>
    leer(CLAVES.comercial, COMERCIAL_BASE),
  )

  const [tema, setTema] = useState<Tema>(() => leer<Tema>(CLAVES.tema, 'oscuro'))
  const [hayCambiosLocales, setHayCambiosLocales] = useState(() => hayDatosGuardados())

  // aplicar el tema al <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('transicion-tema')
    html.setAttribute('data-theme', tema === 'claro' ? 'light' : 'dark')
    guardar(CLAVES.tema, tema)
    const t = setTimeout(() => html.classList.remove('transicion-tema'), 220)
    return () => clearTimeout(t)
  }, [tema])

  /*
    Las dos rebanadas que de verdad se mueven en esta etapa son inventario y
    produccion. Cada una tiene su propio «actualizar»: toma un parcial, lo
    mezcla, lo guarda en su clave de localStorage y marca que hay cambios
    locales. Asi ninguna accion de abajo tiene que acordarse de persistir.
  */
  const actualizarInventario = useCallback((parcial: Partial<DatosInventario>) => {
    setInventario((prev) => {
      const next = { ...prev, ...parcial }
      guardar(CLAVES.inventario, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const actualizarProduccion = useCallback((parcial: Partial<DatosProduccion>) => {
    setProduccion((prev) => {
      const next = { ...prev, ...parcial }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const actualizarNomina = useCallback((parcial: Partial<DatosNomina>) => {
    setNomina((prev) => {
      const next = { ...prev, ...parcial }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  /*
    EL CALCULO, arriba de las acciones a proposito.

    `calculado` se define aqui y no al final porque algunas acciones lo
    necesitan: finalizar una hoja tiene que congelar el costo que el motor dice
    AHORA, y para eso tiene que poder leerlo.
  */
  const datos = useMemo(
    () => ({ config, nomina, inventario, produccion, cif, comercial }),
    [config, nomina, inventario, produccion, cif, comercial],
  )

  const calculado = useMemo(() => calcularTodo(datos), [datos])

  // ---------------------------------------------------------------------
  // Configuracion
  // ---------------------------------------------------------------------
  const setConfig = useCallback((c: Config) => {
    setConfigRaw(c)
    guardar(CLAVES.config, c)
    setHayCambiosLocales(true)
  }, [])

  // ---------------------------------------------------------------------
  // Materias primas
  // ---------------------------------------------------------------------
  const crearMateriaPrima = useCallback(
    (m: Omit<MateriaPrima, 'id'>): ID => {
      const id = nuevoId()
      setInventario((prev) => {
        const next = { ...prev, materias_primas: [...prev.materias_primas, { ...m, id }] }
        guardar(CLAVES.inventario, next)
        return next
      })
      setHayCambiosLocales(true)
      return id
    },
    [],
  )

  const actualizarMateriaPrima = useCallback((id: ID, parcial: Partial<MateriaPrima>) => {
    setInventario((prev) => {
      const next = { ...prev, materias_primas: conCambio(prev.materias_primas, id, parcial) }
      guardar(CLAVES.inventario, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  /*
    Borrar una materia prima que ya se movio dejaria el Kardex sin referencia y
    las ordenes con lineas huerfanas. En vez de borrar en cascada, que seria
    silencioso y destructivo, se dice no y se explica: para sacarla de
    circulacion esta el estado «inactiva».
  */
  const borrarMateriaPrima = useCallback(
    (id: ID): Resultado => {
      const movs = inventario.movimientos.filter((m) => m.materia_prima_id === id).length
      if (movs > 0) {
        return `Tiene ${movs} movimiento(s) de Kardex. Marcala como inactiva en vez de borrarla.`
      }
      const consumos = produccion.consumos.filter((c) => c.materia_prima_id === id).length
      if (consumos > 0) return `La consumen ${consumos} orden(es) de producción.`

      const recetas = produccion.recetas.filter((r) =>
        r.items.some((i) => i.materia_prima_id === id),
      )
      if (recetas.length > 0) return `Está en ${recetas.length} receta(s). Quitala de ahí primero.`

      actualizarInventario({ materias_primas: inventario.materias_primas.filter((m) => m.id !== id) })
      return null
    },
    [inventario.materias_primas, inventario.movimientos, produccion.consumos, produccion.recetas, actualizarInventario],
  )

  // ---------------------------------------------------------------------
  // Productos y recetas
  // ---------------------------------------------------------------------
  const crearProducto = useCallback((p: Omit<Producto, 'id'>): ID => {
    const id = nuevoId()
    setProduccion((prev) => {
      const next = { ...prev, productos: [...prev.productos, { ...p, id }] }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarProducto = useCallback((id: ID, parcial: Partial<Producto>) => {
    setProduccion((prev) => {
      const next = { ...prev, productos: conCambio(prev.productos, id, parcial) }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarProducto = useCallback(
    (id: ID): Resultado => {
      const ordenes = produccion.ordenes.filter((o) => o.producto_id === id).length
      if (ordenes > 0) return `Tiene ${ordenes} orden(es) de producción. Marcalo como inactivo.`

      actualizarProduccion({
        productos: produccion.productos.filter((p) => p.id !== id),
        // la receta no sirve sin su producto, asi que se va con el
        recetas: produccion.recetas.filter((r) => r.producto_id !== id),
      })
      return null
    },
    [produccion.ordenes, produccion.productos, produccion.recetas, actualizarProduccion],
  )

  /**
   * Guarda la receta del producto.
   *
   * Si ya habia una vigente, se reemplaza y la version sube: el historico
   * queda, pero solo una receta por producto esta marcada como vigente.
   */
  const guardarReceta = useCallback(
    (productoId: ID, rendimiento: number, items: ItemReceta[]) => {
      setProduccion((prev) => {
        const anterior = prev.recetas.find((r) => r.producto_id === productoId && r.vigente)
        const nueva: Receta = {
          id: anterior?.id ?? nuevoId(),
          producto_id: productoId,
          version: (anterior?.version ?? 0) + 1,
          rendimiento: rendimiento > 0 ? rendimiento : 1,
          items,
          horas_mo_estandar: anterior?.horas_mo_estandar ?? 0,
          horas_maquina_estandar: anterior?.horas_maquina_estandar ?? 0,
          vigente: true,
          nota: anterior?.nota,
        }
        const recetas = anterior
          ? prev.recetas.map((r) => (r.id === anterior.id ? nueva : r))
          : [...prev.recetas, nueva]
        const next = { ...prev, recetas }
        guardar(CLAVES.produccion, next)
        return next
      })
      setHayCambiosLocales(true)
    },
    [],
  )

  // ---------------------------------------------------------------------
  // Kardex
  // ---------------------------------------------------------------------
  const crearMovimiento = useCallback((m: Omit<MovimientoKardex, 'id'>): ID => {
    const id = nuevoId()
    setInventario((prev) => {
      const next = { ...prev, movimientos: [...prev.movimientos, { ...m, id }] }
      guardar(CLAVES.inventario, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const borrarMovimiento = useCallback((id: ID) => {
    setInventario((prev) => {
      const next = { ...prev, movimientos: prev.movimientos.filter((m) => m.id !== id) }
      guardar(CLAVES.inventario, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  // ---------------------------------------------------------------------
  // Ordenes de produccion
  // ---------------------------------------------------------------------
  const crearOrden = useCallback((o: Omit<OrdenProduccion, 'id'>): ID => {
    const id = nuevoId()
    setProduccion((prev) => {
      const next = { ...prev, ordenes: [...prev.ordenes, { ...o, id }] }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarOrden = useCallback((id: ID, parcial: Partial<OrdenProduccion>) => {
    setProduccion((prev) => {
      const next = { ...prev, ordenes: conCambio(prev.ordenes, id, parcial) }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarOrden = useCallback(
    (id: ID): Resultado => {
      const consumos = produccion.consumos.filter((c) => c.orden_id === id).length
      if (consumos > 0) {
        return `La orden tiene ${consumos} consumo(s) registrados. Borralos primero: así el material vuelve al inventario.`
      }
      actualizarProduccion({ ordenes: produccion.ordenes.filter((o) => o.id !== id) })
      return null
    },
    [produccion.consumos, produccion.ordenes, actualizarProduccion],
  )

  const crearConsumo = useCallback((c: Omit<ConsumoMaterial, 'id'>): ID => {
    const id = nuevoId()
    setProduccion((prev) => {
      const next = { ...prev, consumos: [...prev.consumos, { ...c, id }] }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  /** Borrar el consumo devuelve el material al saldo: su salida de Kardex era derivada. */
  const borrarConsumo = useCallback((id: ID) => {
    setProduccion((prev) => {
      const next = { ...prev, consumos: prev.consumos.filter((c) => c.id !== id) }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  // ---------------------------------------------------------------------
  // Nomina
  // ---------------------------------------------------------------------
  const crearTrabajador = useCallback((t: Omit<Trabajador, 'id'>): ID => {
    const id = nuevoId()
    setNomina((prev) => {
      const next = { ...prev, trabajadores: [...prev.trabajadores, { ...t, id }] }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarTrabajador = useCallback((id: ID, parcial: Partial<Trabajador>) => {
    setNomina((prev) => {
      const next = { ...prev, trabajadores: conCambio(prev.trabajadores, id, parcial) }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  /*
    Igual que con las materias primas: borrar a alguien que ya tiene horas
    liquidadas o tiempo cargado a una orden dejaria el historico sin dueño.
    Para sacarlo de la nomina esta el estado «inactivo», que ademas es lo
    correcto: un retiro no borra lo que se trabajo.
  */
  const borrarTrabajador = useCallback(
    (id: ID): Resultado => {
      const horas = nomina.registros_horas.filter((r) => r.trabajador_id === id).length
      if (horas > 0) return `Tiene ${horas} registro(s) de horas. Marcalo como inactivo.`
      const novedades = nomina.novedades.filter((n) => n.trabajador_id === id).length
      if (novedades > 0) return `Tiene ${novedades} novedad(es) registradas.`
      const asignaciones = produccion.asignaciones_mo.filter((a) => a.trabajador_id === id).length
      if (asignaciones > 0) return `Tiene ${asignaciones} hora(s) imputadas a órdenes de producción.`

      actualizarNomina({ trabajadores: nomina.trabajadores.filter((t) => t.id !== id) })
      return null
    },
    [nomina.registros_horas, nomina.novedades, nomina.trabajadores, produccion.asignaciones_mo, actualizarNomina],
  )

  const crearPeriodoNomina = useCallback((p: Omit<PeriodoNomina, 'id'>): ID => {
    const id = nuevoId()
    setNomina((prev) => {
      const next = { ...prev, periodos: [...prev.periodos, { ...p, id }] }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarPeriodoNomina = useCallback((id: ID, parcial: Partial<PeriodoNomina>) => {
    setNomina((prev) => {
      const next = { ...prev, periodos: conCambio(prev.periodos, id, parcial) }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarPeriodoNomina = useCallback(
    (id: ID): Resultado => {
      const horas = nomina.registros_horas.filter((r) => r.periodo_id === id).length
      if (horas > 0) return `El período tiene ${horas} registro(s) de horas. Borralos primero.`
      const novedades = nomina.novedades.filter((n) => n.periodo_id === id).length
      if (novedades > 0) return `El período tiene ${novedades} novedad(es).`

      actualizarNomina({ periodos: nomina.periodos.filter((p) => p.id !== id) })
      return null
    },
    [nomina.registros_horas, nomina.novedades, nomina.periodos, actualizarNomina],
  )

  /**
   * REEMPLAZA las horas de una clase. Ver el comentario en `contexto.ts`: deja
   * una sola fila por (trabajador, periodo, clase) con el total, para que la
   * vista consolidada se pueda editar celda por celda sin duplicar nada.
   */
  const fijarHoras = useCallback(
    (trabajadorId: ID, periodoId: ID, tipo: TipoHoraRegistro, horas: number) => {
      setNomina((prev) => {
        const resto = prev.registros_horas.filter(
          (r) => !(r.trabajador_id === trabajadorId && r.periodo_id === periodoId && r.tipo_hora === tipo),
        )
        const periodo = prev.periodos.find((p) => p.id === periodoId)
        const registros =
          horas > 0
            ? [
                ...resto,
                {
                  id: nuevoId(),
                  trabajador_id: trabajadorId,
                  periodo_id: periodoId,
                  // la fecha del cierre del periodo: estas horas son del periodo, no de un dia
                  fecha: periodo?.hasta ?? periodo?.desde ?? '',
                  tipo_hora: tipo,
                  horas,
                },
              ]
            : resto
        const next = { ...prev, registros_horas: registros }
        guardar(CLAVES.nomina, next)
        return next
      })
      setHayCambiosLocales(true)
    },
    [],
  )

  const borrarHorasDe = useCallback((trabajadorId: ID, periodoId: ID) => {
    setNomina((prev) => {
      const next = {
        ...prev,
        registros_horas: prev.registros_horas.filter(
          (r) => !(r.trabajador_id === trabajadorId && r.periodo_id === periodoId),
        ),
      }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const crearNovedad = useCallback((n: Omit<Novedad, 'id'>): ID => {
    const id = nuevoId()
    setNomina((prev) => {
      const next = { ...prev, novedades: [...prev.novedades, { ...n, id }] }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const borrarNovedad = useCallback((id: ID) => {
    setNomina((prev) => {
      const next = { ...prev, novedades: prev.novedades.filter((n) => n.id !== id) }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const crearConcepto = useCallback((c: Omit<ConceptoRemuneracion, 'id'>): ID => {
    const id = nuevoId()
    setNomina((prev) => {
      const next = { ...prev, conceptos: [...prev.conceptos, { ...c, id }] }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarConcepto = useCallback((id: ID, parcial: Partial<ConceptoRemuneracion>) => {
    setNomina((prev) => {
      const next = { ...prev, conceptos: conCambio(prev.conceptos, id, parcial) }
      guardar(CLAVES.nomina, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarConcepto = useCallback(
    (id: ID): Resultado => {
      const usos = nomina.novedades.filter((n) => n.concepto_id === id).length
      if (usos > 0) return `Hay ${usos} novedad(es) que lo usan. Desactivalo en vez de borrarlo.`
      actualizarNomina({ conceptos: nomina.conceptos.filter((c) => c.id !== id) })
      return null
    },
    [nomina.novedades, nomina.conceptos, actualizarNomina],
  )

  // ---------------------------------------------------------------------
  // Mano de obra imputada a las ordenes
  // ---------------------------------------------------------------------
  const crearAsignacionMO = useCallback((a: Omit<AsignacionMO, 'id'>): ID => {
    const id = nuevoId()
    setProduccion((prev) => {
      const next = { ...prev, asignaciones_mo: [...prev.asignaciones_mo, { ...a, id }] }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const borrarAsignacionMO = useCallback((id: ID) => {
    setProduccion((prev) => {
      const next = { ...prev, asignaciones_mo: prev.asignaciones_mo.filter((a) => a.id !== id) }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  // ---------------------------------------------------------------------
  // CIF
  // ---------------------------------------------------------------------
  const actualizarCif = useCallback((parcial: Partial<DatosCIF>) => {
    setCif((prev) => {
      const next = { ...prev, ...parcial }
      guardar(CLAVES.cif, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const crearCategoriaCIF = useCallback((c: Omit<CategoriaCIF, 'id'>): ID => {
    const id = nuevoId()
    setCif((prev) => {
      const next = { ...prev, categorias: [...prev.categorias, { ...c, id }] }
      guardar(CLAVES.cif, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarCategoriaCIF = useCallback((id: ID, parcial: Partial<CategoriaCIF>) => {
    setCif((prev) => {
      const next = { ...prev, categorias: conCambio(prev.categorias, id, parcial) }
      guardar(CLAVES.cif, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  /*
    Borrar una categoria que ya tiene conceptos dejaria esa plata sin
    clasificar, y el motor no sabria si es costo o gasto: la deja por fuera y
    la cuenta aparte. Mejor no llegar a eso.
  */
  const borrarCategoriaCIF = useCallback(
    (id: ID): Resultado => {
      const usos = cif.cif.filter((c) => c.categoria_id === id).length
      if (usos > 0) return `Hay ${usos} concepto(s) en esa categoría. Desactivala en vez de borrarla.`
      actualizarCif({ categorias: cif.categorias.filter((c) => c.id !== id) })
      return null
    },
    [cif.cif, cif.categorias, actualizarCif],
  )

  const crearCIF = useCallback((c: Omit<CIF, 'id'>): ID => {
    const id = nuevoId()
    setCif((prev) => {
      const next = { ...prev, cif: [...prev.cif, { ...c, id }] }
      guardar(CLAVES.cif, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarCIF = useCallback((id: ID, parcial: Partial<CIF>) => {
    setCif((prev) => {
      const next = { ...prev, cif: conCambio(prev.cif, id, parcial) }
      guardar(CLAVES.cif, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarCIF = useCallback((id: ID) => {
    setCif((prev) => {
      const next = { ...prev, cif: prev.cif.filter((c) => c.id !== id) }
      guardar(CLAVES.cif, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  // ---------------------------------------------------------------------
  // Otros costos directos
  // ---------------------------------------------------------------------
  const crearOtroDirecto = useCallback((o: Omit<OtroCostoDirecto, 'id'>): ID => {
    const id = nuevoId()
    setProduccion((prev) => {
      const next = { ...prev, otros_directos: [...prev.otros_directos, { ...o, id }] }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const borrarOtroDirecto = useCallback((id: ID) => {
    setProduccion((prev) => {
      const next = { ...prev, otros_directos: prev.otros_directos.filter((o) => o.id !== id) }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  // ---------------------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------------------
  const actualizarComercial = useCallback((parcial: Partial<DatosComercial>) => {
    setComercial((prev) => {
      const next = { ...prev, ...parcial }
      guardar(CLAVES.comercial, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const crearCliente = useCallback((c: Omit<Cliente, 'id'>): ID => {
    const id = nuevoId()
    setComercial((prev) => {
      const next = { ...prev, clientes: [...prev.clientes, { ...c, id }] }
      guardar(CLAVES.comercial, next)
      return next
    })
    setHayCambiosLocales(true)
    return id
  }, [])

  const actualizarCliente = useCallback((id: ID, parcial: Partial<Cliente>) => {
    setComercial((prev) => {
      const next = { ...prev, clientes: conCambio(prev.clientes, id, parcial) }
      guardar(CLAVES.comercial, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarCliente = useCallback(
    (id: ID): Resultado => {
      const ordenes = produccion.ordenes.filter((o) => o.cliente_id === id).length
      if (ordenes > 0) return `Tiene ${ordenes} orden(es) asociadas. Marcalo como inactivo.`
      const ventas = comercial.ventas.filter((v) => v.cliente_id === id).length
      if (ventas > 0) return `Tiene ${ventas} venta(s) registradas.`
      actualizarComercial({ clientes: comercial.clientes.filter((c) => c.id !== id) })
      return null
    },
    [produccion.ordenes, comercial.ventas, comercial.clientes, actualizarComercial],
  )

  // ---------------------------------------------------------------------
  // Hojas de costos
  // ---------------------------------------------------------------------
  const crearHoja = useCallback(
    (ordenId: ID): ID => {
      const existente = hojaDeOrden(produccion.hojas, ordenId)
      if (existente) return existente.id

      const id = nuevoId()
      setProduccion((prev) => {
        const registro: HojaRegistro = {
          id,
          orden_id: ordenId,
          numero: siguienteNumeroHoja(prev.hojas),
          fecha_elaboracion: hoy(),
          observaciones: '',
          estado: 'borrador',
          margen_metodo: null,
          margen_pct: null,
          version: 1,
          congelada: null,
          historial: [],
        }
        const next = { ...prev, hojas: [...prev.hojas, registro] }
        guardar(CLAVES.produccion, next)
        return next
      })
      setHayCambiosLocales(true)
      return id
    },
    [produccion.hojas],
  )

  const actualizarHoja = useCallback((id: ID, parcial: Partial<HojaRegistro>) => {
    setProduccion((prev) => {
      const next = { ...prev, hojas: conCambio(prev.hojas, id, parcial) }
      guardar(CLAVES.produccion, next)
      return next
    })
    setHayCambiosLocales(true)
  }, [])

  const borrarHoja = useCallback(
    (id: ID): Resultado => {
      const registro = produccion.hojas.find((h) => h.id === id)
      if (registro?.estado === 'finalizada') {
        return 'Es una hoja finalizada. Reabrila primero si de verdad querés borrarla.'
      }
      actualizarProduccion({ hojas: produccion.hojas.filter((h) => h.id !== id) })
      return null
    },
    [produccion.hojas, actualizarProduccion],
  )

  /*
    Finalizar congela la foto de hoy. El calculo de la hoja se hace aqui mismo
    con `armarHoja`, no se toma de `calculado`: asi lo que se congela es
    exactamente lo que el motor dice en este instante, sin depender de que el
    render este al dia.
  */
  const finalizar = useCallback(
    (id: ID, motivo = ''): Resultado => {
      const registro = produccion.hojas.find((h) => h.id === id)
      if (!registro) return 'Esa hoja ya no existe.'

      const orden = produccion.ordenes.find((o) => o.id === registro.orden_id)
      if (!orden) return 'La orden de esa hoja ya no existe.'

      // se arma sobre el registro en BORRADOR, para no devolver la foto vieja
      const hoja = armarHoja({
        registro: { ...registro, estado: 'borrador' },
        orden,
        producto: produccion.productos.find((p) => p.id === orden.producto_id),
        cliente: comercial.clientes.find((c) => c.id === orden.cliente_id),
        materiales: calculado.materialesPorOrden[orden.id],
        manoObra: calculado.manoObraPorOrden[orden.id],
        cif: calculado.cifPorOrden[orden.id],
        otros: produccion.otros_directos.filter((o) => o.orden_id === orden.id),
        config,
      })

      const r = finalizarHojaPuro(registro, hoja, motivo)
      if (!r.ok) return `${r.error} Falta: ${r.faltantes.join(' ')}`

      actualizarProduccion({
        hojas: produccion.hojas.map((h) => (h.id === id ? r.registro : h)),
      })
      return null
    },
    [
      produccion.hojas,
      produccion.ordenes,
      produccion.productos,
      produccion.otros_directos,
      comercial.clientes,
      calculado.materialesPorOrden,
      calculado.manoObraPorOrden,
      calculado.cifPorOrden,
      config,
      actualizarProduccion,
    ],
  )

  const reabrir = useCallback(
    (id: ID) => {
      const registro = produccion.hojas.find((h) => h.id === id)
      if (!registro) return
      actualizarProduccion({
        hojas: produccion.hojas.map((h) => (h.id === id ? reabrirHojaPuro(h) : h)),
      })
    },
    [produccion.hojas, actualizarProduccion],
  )

  // ---------------------------------------------------------------------
  // Respaldo
  // ---------------------------------------------------------------------

  const exportarTodo = useCallback(() => {
    const respaldo = armarRespaldo(datos)
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sistema-costos-${respaldo.exportado.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [datos])

  const importarTodo = useCallback((texto: string): ResultadoImportar => {
    const r = leerRespaldo(texto)
    if (!r.ok) return r

    setConfigRaw(r.datos.config)
    setNomina(r.datos.nomina)
    setInventario(r.datos.inventario)
    setProduccion(r.datos.produccion)
    setCif(r.datos.cif)
    setComercial(r.datos.comercial)

    guardar(CLAVES.config, r.datos.config)
    guardar(CLAVES.nomina, r.datos.nomina)
    guardar(CLAVES.inventario, r.datos.inventario)
    guardar(CLAVES.produccion, r.datos.produccion)
    guardar(CLAVES.cif, r.datos.cif)
    guardar(CLAVES.comercial, r.datos.comercial)
    setHayCambiosLocales(true)

    return r
  }, [])

  const reiniciar = useCallback(() => {
    for (const k of [
      CLAVES.config,
      CLAVES.nomina,
      CLAVES.inventario,
      CLAVES.produccion,
      CLAVES.cif,
      CLAVES.comercial,
    ]) {
      borrar(k)
    }
    setConfigRaw(CONFIG_BASE)
    setNomina(NOMINA_BASE)
    setInventario(INVENTARIO_BASE)
    setProduccion(PRODUCCION_BASE)
    setCif(CIF_BASE)
    setComercial(COMERCIAL_BASE)
    setHayCambiosLocales(false)
  }, [])

  const alternarTema = useCallback(() => {
    setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'))
  }, [])

  // ---------------------------------------------------------------------
  // El valor del contexto, memoizado para que un re-render del proveedor no
  // obligue a recalcular cada pagina que lo consume.
  // ---------------------------------------------------------------------

  const valor: Estado = useMemo(
    () => ({
      config,
      nomina,
      inventario,
      produccion,
      cif,
      comercial,
      datos,
      calculado,
      setConfig,
      crearMateriaPrima,
      actualizarMateriaPrima,
      borrarMateriaPrima,
      crearProducto,
      actualizarProducto,
      borrarProducto,
      guardarReceta,
      crearMovimiento,
      borrarMovimiento,
      crearOrden,
      actualizarOrden,
      borrarOrden,
      crearConsumo,
      borrarConsumo,
      crearTrabajador,
      actualizarTrabajador,
      borrarTrabajador,
      crearPeriodoNomina,
      actualizarPeriodoNomina,
      borrarPeriodoNomina,
      fijarHoras,
      borrarHorasDe,
      crearNovedad,
      borrarNovedad,
      crearConcepto,
      actualizarConcepto,
      borrarConcepto,
      crearAsignacionMO,
      borrarAsignacionMO,
      crearCategoriaCIF,
      actualizarCategoriaCIF,
      borrarCategoriaCIF,
      crearCIF,
      actualizarCIF,
      borrarCIF,
      crearOtroDirecto,
      borrarOtroDirecto,
      crearCliente,
      actualizarCliente,
      borrarCliente,
      crearHoja,
      actualizarHoja,
      borrarHoja,
      finalizarHoja: finalizar,
      reabrirHoja: reabrir,
      exportarTodo,
      importarTodo,
      reiniciar,
      hayCambiosLocales,
      tema,
      alternarTema,
    }),
    [
      config,
      nomina,
      inventario,
      produccion,
      cif,
      comercial,
      datos,
      calculado,
      setConfig,
      crearMateriaPrima,
      actualizarMateriaPrima,
      borrarMateriaPrima,
      crearProducto,
      actualizarProducto,
      borrarProducto,
      guardarReceta,
      crearMovimiento,
      borrarMovimiento,
      crearOrden,
      actualizarOrden,
      borrarOrden,
      crearConsumo,
      borrarConsumo,
      crearTrabajador,
      actualizarTrabajador,
      borrarTrabajador,
      crearPeriodoNomina,
      actualizarPeriodoNomina,
      borrarPeriodoNomina,
      fijarHoras,
      borrarHorasDe,
      crearNovedad,
      borrarNovedad,
      crearConcepto,
      actualizarConcepto,
      borrarConcepto,
      crearAsignacionMO,
      borrarAsignacionMO,
      crearCategoriaCIF,
      actualizarCategoriaCIF,
      borrarCategoriaCIF,
      crearCIF,
      actualizarCIF,
      borrarCIF,
      crearOtroDirecto,
      borrarOtroDirecto,
      crearCliente,
      actualizarCliente,
      borrarCliente,
      crearHoja,
      actualizarHoja,
      borrarHoja,
      finalizar,
      reabrir,
      exportarTodo,
      importarTodo,
      reiniciar,
      hayCambiosLocales,
      tema,
      alternarTema,
    ],
  )

  return <ContextoEstado.Provider value={valor}>{children}</ContextoEstado.Provider>
}
