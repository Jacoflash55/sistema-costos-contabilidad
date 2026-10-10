import { describe, expect, it } from 'vitest'

import { redondearArriba } from '../src/lib/calc'
import { cantidad, cop, copCorto, copPreciso, pct } from '../src/lib/formato'

/*
  Estos tests fijan que el formato de plata y el redondeo se comportan IGUAL
  que en `sistema-jacobo`, de donde se copiaron. Si alguien los cambia aquí,
  las dos apps empiezan a mostrar cifras distintas y los talleres dejan de
  cuadrar con el plan.
*/

describe('cop', () => {
  it('formatea pesos colombianos sin decimales y con punto de miles', () => {
    expect(cop(1_450_766)).toBe('$1.450.766')
    expect(cop(0)).toBe('$0')
    expect(cop(999)).toBe('$999')
  })

  it('redondea al peso', () => {
    expect(cop(1000.4)).toBe('$1.000')
    expect(cop(1000.5)).toBe('$1.001')
  })

  it('usa el signo menos tipográfico para los negativos', () => {
    // U+2212, no el guión del teclado: es el que se alinea con las cifras
    expect(cop(-5000)).toBe('−$5.000')
  })

  it('pone el + solo si se lo piden', () => {
    expect(cop(5000, { signo: true })).toBe('+$5.000')
    expect(cop(5000)).toBe('$5.000')
    // un negativo manda sobre la opción: nunca sale «+−»
    expect(cop(-5000, { signo: true })).toBe('−$5.000')
  })
})

describe('copCorto', () => {
  it('abrevia millones con un decimal', () => {
    expect(copCorto(1_500_000)).toBe('$1,5 M')
    expect(copCorto(27_000_000)).toBe('$27 M')
  })

  it('abrevia miles sin decimales', () => {
    expect(copCorto(450_000)).toBe('$450 k')
    expect(copCorto(1_000)).toBe('$1 k')
  })

  it('deja los montos chicos tal cual', () => {
    expect(copCorto(999)).toBe('$999')
  })

  it('conserva el signo', () => {
    expect(copCorto(-1_500_000)).toBe('−$1,5 M')
  })
})

describe('pct', () => {
  it('usa coma decimal y un decimal por defecto', () => {
    expect(pct(12.345)).toBe('12,3%')
    expect(pct(30)).toBe('30%')
  })

  it('acepta otra cantidad de decimales', () => {
    expect(pct(12.345, 2)).toBe('12,35%')
    expect(pct(12.345, 0)).toBe('12%')
  })
})

describe('cantidad y copPreciso', () => {
  it('las cantidades conservan decimales: 2,5 kg no es 3 kg', () => {
    expect(cantidad(2.5)).toBe('2,5')
    expect(cantidad(0.333, 2)).toBe('0,33')
  })

  it('copPreciso muestra los centavos de un costo unitario', () => {
    expect(copPreciso(1234.5)).toBe('$1.234,50')
    expect(copPreciso(-1234.5)).toBe('−$1.234,50')
  })
})

describe('redondearArriba', () => {
  it('redondea al siguiente millar por defecto', () => {
    // el caso del plan: 2 x 251.353 = 502.706 se cobra como 503.000
    expect(redondearArriba(502_706)).toBe(503_000)
    expect(redondearArriba(1_000)).toBe(1_000)
    expect(redondearArriba(1)).toBe(1_000)
  })

  it('acepta otro múltiplo', () => {
    expect(redondearArriba(1_234, 100)).toBe(1_300)
    expect(redondearArriba(1_234, 1)).toBe(1_234)
    expect(redondearArriba(1_234.2, 1)).toBe(1_235)
  })

  it('no inventa un resultado con un múltiplo inválido', () => {
    expect(() => redondearArriba(100, 0)).toThrow()
    expect(() => redondearArriba(100, -5)).toThrow()
  })
})
