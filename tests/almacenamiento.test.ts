import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLAVES, PREFIJO, borrar, guardar, hayDatosGuardados, leer } from '../src/lib/almacenamiento'
import { CONFIG_BASE, armarRespaldo, leerRespaldo } from '../src/datos'
import type { Config } from '../src/lib/tipos'

/**
 * Un localStorage de mentiras, en memoria.
 *
 * Los tests corren en Node, donde no hay navegador. Se monta este doble para
 * poder probar el ida y vuelta de verdad, en vez de solo comprobar que las
 * funciones no lanzan.
 */
function montarAlmacenamiento() {
  const datos = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    get length() {
      return datos.size
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
  })
  return datos
}

describe('leer / guardar / borrar', () => {
  let datos: Map<string, string>

  beforeEach(() => {
    datos = montarAlmacenamiento()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('guardar y leer devuelve el mismo objeto de config', () => {
    guardar(CLAVES.config, CONFIG_BASE)
    const vuelta = leer<Config>(CLAVES.config, {} as Config)
    expect(vuelta).toEqual(CONFIG_BASE)
  })

  it('sobrevive a una config editada, con los anidados incluidos', () => {
    const editada: Config = {
      ...CONFIG_BASE,
      empresa: { ...CONFIG_BASE.empresa, nombre: 'Carpintería Molano' },
      parametros: {
        ...CONFIG_BASE.parametros,
        horas_mes: 230,
        factor_prestacional: 1.48,
        recargos: { ...CONFIG_BASE.parametros.recargos, dominical: 0.8 },
      },
    }
    guardar(CLAVES.config, editada)

    const vuelta = leer<Config>(CLAVES.config, CONFIG_BASE)
    expect(vuelta.empresa.nombre).toBe('Carpintería Molano')
    expect(vuelta.parametros.horas_mes).toBe(230)
    expect(vuelta.parametros.factor_prestacional).toBe(1.48)
    expect(vuelta.parametros.recargos.dominical).toBe(0.8)
    // lo que no se tocó queda igual
    expect(vuelta.parametros.recargos.extra_diurna).toBe(
      CONFIG_BASE.parametros.recargos.extra_diurna,
    )
  })

  it('devuelve el valor por defecto si no hay nada guardado', () => {
    expect(leer('costos:no-existe', 'defecto')).toBe('defecto')
  })

  it('devuelve el valor por defecto si lo guardado es basura', () => {
    datos.set(CLAVES.config, '{esto no es json')
    expect(leer<Config>(CLAVES.config, CONFIG_BASE)).toBe(CONFIG_BASE)
  })

  it('borrar deja la clave vacía', () => {
    guardar(CLAVES.config, CONFIG_BASE)
    expect(hayDatosGuardados()).toBe(true)
    borrar(CLAVES.config)
    expect(leer(CLAVES.config, null)).toBe(null)
    expect(hayDatosGuardados()).toBe(false)
  })
})

describe('el namespace de las claves', () => {
  it('todas las claves arrancan con costos:', () => {
    for (const clave of Object.values(CLAVES)) {
      expect(clave.startsWith(PREFIJO)).toBe(true)
    }
  })

  it('ninguna clave toca el namespace de sistema-jacobo', () => {
    for (const clave of Object.values(CLAVES)) {
      expect(clave).not.toContain('sistema-jacobo')
    }
  })
})

describe('respaldo: exportar e importar', () => {
  it('da la vuelta completa sin perder nada', () => {
    const respaldo = armarRespaldo(
      {
        config: CONFIG_BASE,
        nomina: { trabajadores: [], periodos: [], registros_horas: [], conceptos: [], novedades: [] },
        inventario: {
          materias_primas: [
            {
              id: 'mp1',
              codigo: 'MP-001',
              nombre: 'Madera',
              descripcion: '',
              unidad: 'm2',
              categoria: 'Maderas',
              cantidad_inicial: 10,
              costo_unitario_inicial: 5000,
              stock_minimo: 2,
              proveedor: 'El Roble',
              activo: true,
            },
          ],
          compras: [],
          movimientos: [],
        },
        produccion: {
          productos: [],
          recetas: [],
          ordenes: [],
          consumos: [],
          asignaciones_mo: [],
          otros_directos: [],
          hojas: [],
        },
        cif: { categorias: [], cif: [] },
        comercial: { clientes: [], ventas: [], gastos: [], supuestos_equilibrio: [], valores_informe: [] },
      },
      '2026-10-09T12:00:00.000Z',
    )

    const texto = JSON.stringify(respaldo)
    const r = leerRespaldo(texto)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos.inventario.materias_primas).toHaveLength(1)
    expect(r.datos.inventario.materias_primas[0].nombre).toBe('Madera')
    expect(r.datos.config.parametros.horas_mes).toBe(CONFIG_BASE.parametros.horas_mes)
    expect(r.avisos).toEqual([])
  })

  it('rechaza un JSON que no es un respaldo de esta app', () => {
    const ajeno = JSON.stringify({ app: 'sistema-jacobo', version: 1, config: {} })
    const r = leerRespaldo(ajeno)
    expect(r.ok).toBe(false)
  })

  it('rechaza un archivo que no es JSON', () => {
    expect(leerRespaldo('hola').ok).toBe(false)
  })

  it('rechaza un respaldo de una versión más nueva', () => {
    const futuro = JSON.stringify({ app: 'sistema-costos', version: 999 })
    const r = leerRespaldo(futuro)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('más nueva')
  })

  it('completa con los datos de fábrica lo que falte, y lo avisa', () => {
    const incompleto = JSON.stringify({ app: 'sistema-costos', version: 1, config: CONFIG_BASE })
    const r = leerRespaldo(incompleto)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos.inventario.materias_primas).toEqual([])
    expect(r.avisos.length).toBeGreaterThan(0)
  })
})
