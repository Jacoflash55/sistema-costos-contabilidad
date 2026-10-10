# Sistema de Costos

Sistema web de contabilidad de costos para una pequeña empresa. Proyecto universitario de
Contabilidad de Costos.

Corre en tu computador, no sube nada a internet, no tiene cuentas ni login. Los datos viven en los
JSON de `data/` (la semilla) y en el almacenamiento local del navegador (lo que vos editás).

> **Aviso académico.** Los recargos de nómina, el factor prestacional y los porcentajes de aportes
> son valores de **ejercicio**, editables desde la pantalla de Configuración. Sirven para resolver
> el taller: no son asesoría laboral ni contable, y no garantizan el cumplimiento de la ley
> colombiana vigente.

---

## Cómo lo corro

```bash
npm install
npm run dev
```

Se abre en `http://localhost:5173`. Para pararlo, `Ctrl+C`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app con recarga en vivo |
| `npm test` | Corre los 202 tests de las fórmulas |
| `npm run test:watch` | Tests en vivo mientras editás |
| `npm run typecheck` | Revisa los tipos sin compilar |
| `npm run build` | Genera `dist/` para subir a Cloudflare |
| `npm run deploy:dry` | Valida la config de Cloudflare sin subir nada |

---

## De dónde viene

Es un proyecto **separado** de `sistema-jacobo` (finanzas personales), pero reutiliza su stack y
varias piezas:

| Qué se copió | De dónde |
|---|---|
| `cop`, `copCorto`, `pct` | `src/lib/formato.ts` |
| `redondearArriba` | `src/lib/calc.ts` |
| `leer` / `guardar` / `borrar` | vivían en su `src/datos.ts` |
| Tarjeta, Tabla, Boton, Aviso, Cifra, Pildora, Barra, InputNumero, CeldaEditable | `src/components/ui.tsx` |
| Tokens de color y tema claro/oscuro | `src/index.css` |
| El reparto `datos.ts` / `contexto.ts` / `estado.tsx` | igual, y por la misma razón: Fast Refresh |
| Config de Vite, Tailwind v4, Vitest, wrangler | igual, sin la parte de PWA |

**Los datos NO se comparten.** Este proyecto usa su propio namespace de almacenamiento local:
todas sus claves empiezan con `costos:` y nunca lee ni escribe claves `sistema-jacobo:*`. Hay un
test que lo verifica.

---

## Cómo está organizado

```
data/                  las semillas: un JSON por módulo
  config.json          empresa + parámetros de cálculo
  inventario.json      materias primas, compras, movimientos
  produccion.json      productos, recetas, órdenes, consumos
  nomina.json  cif.json  comercial.json

src/
  lib/
    tipos.ts           TODAS las entidades del sistema, en un solo lugar
    calc.ts            redondeo y helpers numéricos puros
    kardex.ts          el motor de inventario: promedio ponderado perpetuo
    nomina.ts          el motor de nómina: valor hora, recargos, liquidación, MOD
    cif.ts             tasa de CIF por período y reparto entre órdenes
    hoja.ts            arma la hoja de costos leyendo los otros módulos
    unidades.ts        qué unidades se pueden mezclar y cómo se convierten
    formato.ts         formato de pesos, porcentajes y cantidades
    almacenamiento.ts  localStorage con el namespace costos:
  datos.ts             semillas + `calcularTodo` + respaldo (exportar/importar)
  contexto.ts          el contexto y el hook `useEstado`
  estado.tsx           UN solo componente: <ProveedorEstado>
  components/ui.tsx    los componentes de interfaz
  pages/               una pantalla por módulo
  App.tsx              el cascarón: navegación + respaldo global

tests/                 formato, almacenamiento y Kardex
```

### La regla de oro

**Las fórmulas viven en `src/lib/`, son puras y están testeadas. La UI no calcula nada.**

`calcularTodo(datos)` recibe todos los datos crudos y devuelve todo lo derivado. Las pantallas leen
de ahí. Si un número está mal, el lugar para arreglarlo es `src/lib/`, no un componente.

---

## El Kardex

Promedio ponderado perpetuo. Las fórmulas, tal como están implementadas en `src/lib/kardex.ts`:

```
Entrada:  qty'    = qty + q_ent
          valor'  = valor + q_ent × cu_ent
          cu_prom = valor' / qty'

Salida:   valor_salida = q_sal × cu_prom
          qty'    = qty - q_sal
          valor'  = valor - valor_salida
          cu_prom NO cambia
```

De ahí sale un invariante útil: mientras `qty > 0`, `valor / qty` es siempre `cu_prom`, porque una
salida le quita la misma proporción a los dos lados.

Cuatro decisiones que vale la pena conocer:

1. **El saldo inicial no es un movimiento.** Vive en la ficha de la materia prima
   (`cantidad_inicial`, `costo_unitario_inicial`) y el Kardex sintetiza la primera fila. Así hay un
   solo lugar donde corregir la apertura.

2. **Los consumos de producción no se duplican.** Un `ConsumoMaterial` de una orden se convierte en
   una salida de Kardex con id derivado (`consumo:<id>`). No hay un segundo libro, borrar el consumo
   devuelve el material al saldo, y el doble descuento es imposible por construcción: la tarjeta
   descarta ids repetidos.

3. **Una salida mayor al saldo no se aplica.** La fila queda registrada con `aplicado: false` y se
   reporta como alerta. Solo pasa si el movimiento se marca a mano con `forzar` — la «regla
   explícita de ajuste», para registrar un faltante real sin apagar la validación de todo lo demás.

4. **Dentro del mismo día, primero las entradas.** Es como se diligencia una tarjeta a mano, y
   evita un falso «saldo insuficiente» cuando la compra y el consumo que la gasta llevan la misma
   fecha.

### Unidades

Una materia prima vive en una unidad (kg, m², litro…) y se puede pedir en otra **compatible**: 500 g
de un material que vive en kilos entra como 0,5 kg. Lo que no se puede es mezclar dimensiones: de
litros a kilos no hay conversión sin densidad, y el sistema no la inventa — bloquea la operación y
lo dice.

Al convertir una entrada también se convierte el costo: lo que no cambia es el **valor total**, así
que 500 g a $2 el gramo entran como 0,5 kg a $2.000 el kg.

### PEPS y UEPS

El método sale de la configuración (`metodo_inventario`), pero hoy **solo está implementado el
promedio ponderado**. Si se elige PEPS o UEPS, el Kardex valora por promedio ponderado y la app lo
dice en voz alta en Configuración y en la página de Kardex. Nunca se mezclan dos criterios en el
mismo cálculo. El enganche para agregar PEPS está marcado en `src/lib/kardex.ts`
(`METODOS_IMPLEMENTADOS` y la rama de `historialKardex`).

---

## La nómina

Modelo **académico simplificado**: resuelve el taller, no implementa la ley laboral. No maneja IBC,
topes ni bases especiales. Todo lo paramétrico está en Configuración.

```
valor_hora (mensual)  = salario_mensual ÷ horas_mes
valor_hora (por hora) = tarifa_hora

valor de las horas    = Σ (horas_tipo × valor_hora × recargo_tipo)
total_devengado       = salario_base_período + extras_y_recargos + bonificaciones
neto                  = max(0, total_devengado − deducciones)
costo_MO_empresa      = total_devengado × (1 + factor_prestacional)
costo_MOD_orden       = Σ (horas_imputadas × valor_hora × recargo × (1 + factor))
```

**El error que el motor evita a propósito.** Un trabajador mensual **no** se paga multiplicando su
salario por las horas: su salario del mes ya incluye las horas ordinarias. Las ordinarias solo se
cuentan para saber cuánto tiempo se trabajó y poder imputarlo a órdenes; lo único que se suma aparte
son extras y recargos. Un trabajador por hora sí multiplica sus ordinarias por la tarifa. Hay un test
que compara las dos modalidades con el mismo valor hora para fijarlo.

**Cómo se leen los recargos.** `extra_diurna 1,25` y `extra_nocturna 1,75` son factores completos: la
hora es adicional y se paga entera por ese número. `recargo_nocturno 0,35` y `dominical 0,75` son solo
el adicional, porque la hora ya se pagó como ordinaria. Para un trabajador por hora eso significa que
una hora dominical se anota **dos veces**: como ordinaria (para pagar la hora) y como dominical (para
pagar el recargo). La pantalla de horas lo dice.

### Las dos cifras que nunca hay que confundir

| | Qué es | Comparado con el devengado |
|---|---|---|
| **Neto a pagar** | lo que recibe la persona: devengado − deducciones | **menor** |
| **Costo para la empresa** | devengado × (1 + factor prestacional) | **mayor** |

La hoja de costos se lleva el **costo-empresa**, nunca el neto. Las dos se muestran en columnas
separadas en la liquidación, y en cada orden se ve el costo con y sin factor lado a lado.

El interruptor `mod_con_factor_prestacional` (Configuración, encendido por defecto) decide cuál de
las dos cifras entra a la hoja de costos. Encendido: el costo-empresa de la hora, que es lo que
recomienda la contabilidad de costos. Apagado: solo el salario puro, si el ejercicio lo pide así.

### Sin doble conteo

La clasificación de cada trabajador decide por qué vía llega su costo al producto, y **solo una**:

| Clasificación | A dónde va |
|---|---|
| **Directa** | hoja de costos de la orden, imputando horas |
| **Indirecta** | pozo de CIF, que luego se reparte por la tasa |
| Administración / Ventas | gasto del período: no es costo del producto |

Imputar horas de un trabajador **no directo** a una orden es imposible desde la UI (el selector solo
ofrece directos) y, si alguien reclasifica a una persona después de imputarle horas, el motor deja
esas líneas por fuera del costo y las reporta como error en rojo. Hay un test que verifica que el
mismo costo no aparece a la vez en la orden y en el insumo de CIF.

**Tiempo ocioso.** Las horas pagadas y las horas imputadas a órdenes no tienen por qué coincidir. La
diferencia se mide, se valora a la hora cargada y se muestra en la liquidación, pero **no** se
reparte automáticamente: qué hacer con ella (llevarla a CIF o reconocerla como pérdida del período)
es una decisión del módulo de CIF. Acá queda a la vista para que no desaparezca sin que nadie la vea.

---

## CIF y la hoja de costos

### Qué es CIF y qué no

Lo decide la **naturaleza de la categoría**, no el concepto. Las categorías las crea el usuario; solo
las de naturaleza `cif` se reparten entre las órdenes. Administración, ventas y financieros se pueden
registrar para tenerlos medidos, pero son **gasto del período** y no entran a ninguna hoja. El
arriendo de la planta es CIF; el de la oficina, no.

Un concepto cuya categoría no existe o está inactiva **no se asigna**: sin saber si es costo o gasto,
adivinarlo sería meterle plata al producto sin razón. Queda contado aparte y la pantalla lo reclama.

### La tasa

```
tasa        = CIF asignables del período ÷ nivel de actividad del período
CIF de orden = tasa × nivel de actividad de esa orden
```

La base sale de Configuración: unidades producidas (por defecto), horas de MOD, costo de MOD, costo
de material, costo primo u horas máquina. Las cinco primeras se miden con datos registrados; las
horas máquina se **estiman** de la receta y la hoja lo dice.

Una orden cae en el período de su **fecha de cierre** (o la de inicio, si sigue abierta). Es una
simplificación: una orden que cruza dos meses cae entera en el mes en que terminó.

**Guarda:** si el nivel de actividad del período es 0, no hay tasa. En vez de dividir por cero, la
tasa queda en 0 marcada como inválida, nada se reparte y las hojas de esas órdenes se quedan en
borrador diciendo por qué.

### Incurridos vs. aplicados

`cif_incurrido` es lo real causado; `cif_aplicado` es lo que de verdad se repartió. La variación es la
diferencia: positiva son **subaplicados**, negativa **sobreaplicados**.

**Modelo simplificado:** con la tasa calculada sobre los CIF reales del mismo período (`cif_tasa_desde:
'real'`, el defecto) la variación da cero por construcción. Para que signifique algo hay que registrar
CIF **presupuestados** y poner la tasa en modo presupuestado: ahí aparece la tasa predeterminada y su
variación. Las dos opciones están en Configuración.

### La hoja de costos

`src/lib/hoja.ts` **no calcula ningún costo**: integra lo que los otros módulos ya calcularon.

```
costo_total    = MPD + MOD + CIF + otros directos
costo_unitario = costo_total ÷ cantidad producida     (exige cantidad > 0)

recargo sobre costo:  PV = costo_unitario × (1 + r)
margen sobre venta:   PV = costo_unitario ÷ (1 − m)   (exige m < 1)
utilidad = PV − costo_unitario
```

Cuatro cosas que vale la pena conocer:

1. **Los bloques se llenan solos.** (A) materia prima directa viene del Kardex al promedio vigente en
   cada salida; (B) mano de obra directa viene de la nómina a la tarifa cargada; (C) CIF vienen de la
   tasa del período; (D) otros directos es lo único que se escribe a mano, y es para lo que **no** pasa
   por el Kardex ni por la nómina (un flete, el alquiler de una herramienta). Nada se cuenta dos veces.

2. **Margen con precedencia:** lo que diga la hoja gana sobre lo del producto, y eso sobre la
   configuración. La hoja muestra de dónde salió el porcentaje. El precio se redondea **hacia arriba**:
   redondear hacia abajo se come parte del margen.

3. **Un margen sobre la venta del 100% o más no se calcula.** El divisor sería cero o negativo; no hay
   precio que deje ese margen. La hoja devuelve «no calculable» con la explicación, en vez de un
   Infinity o un número negativo.

4. **Borrador y finalizada.** Una hoja en borrador se recalcula sola cada vez que cambia algo de
   origen. Al finalizarla se **congela** una foto: si después cambia un costo, la hoja firmada no se
   mueve. Corregirla la reabre, y al volver a finalizar sube la versión y queda registrado qué cambió,
   en palabras («el costo unitario bajó de $106.428 a $92.478»).

**Nunca se muestra como definitiva una hoja a la que le falta lo esencial.** Sin cantidad producida no
hay costo unitario, y sin ningún costo cargado la hoja no dice nada: en esos casos queda en borrador,
no se deja finalizar y enumera qué falta. Lo que no bloquea —sin CIF, sin MOD, orden todavía en
proceso— se reporta como advertencia.

### Imprimir

El botón **Imprimir / PDF** usa el diálogo del navegador, que permite guardar como PDF. La hoja sale
sola: la navegación, los avisos y los botones llevan la clase `no-imprimir`, y el bloque `@media print`
redefine los tokens de color para que todo quede en blanco y negro sin tocar un solo componente.

---

## Respaldo

Los tres botones de la barra de arriba:

- **Exportar** baja un JSON con todo el estado (`sistema-costos-AAAA-MM-DD.json`).
- **Importar** lo vuelve a cargar. Pide confirmación porque reemplaza todo, valida que el archivo
  sea de esta app (no se puede importar un respaldo de `sistema-jacobo`), rechaza versiones más
  nuevas y completa con los datos de fábrica lo que falte, avisando qué completó.
- **Reiniciar** borra el almacenamiento local y vuelve a las semillas de `data/`.

---

## Estado del proyecto

| Módulo | Estado |
|---|---|
| Configuración editable | ✅ |
| Materias primas | ✅ CRUD, existencias derivadas, stock mínimo |
| Kardex | ✅ promedio ponderado perpetuo |
| Productos y recetas | ✅ receta de 1 a N materiales, costo estimado |
| Órdenes de producción | ✅ planeada vs. real, consumos, material directo y MOD |
| Nómina | ✅ trabajadores, horas, liquidación, MOD por orden |
| CIF | ✅ categorías propias, tasa por base configurable, aplicados vs. incurridos |
| Hojas de costos | ✅ los tres elementos integrados, margen, precio, estados e impresión |
| Clientes | ✅ reutilizables, se eligen desde la orden |
| Informes | ⬜ |

Lo que `calcularTodo(datos)` deja listo, sin recalcular nada:

| Dato | Qué trae |
|---|---|
| `materialesPorOrden[ordenId]` | `{ total, lineas }` — material, unidad, cantidad, costo unitario al promedio vigente, costo total |
| `manoObraPorOrden[ordenId]` | `{ total, total_salario, total_con_factor, horas, lineas }` — trabajador, clase de hora, horas, valor hora, recargo |
| `moIndirectaPorPeriodo[periodoId]` | el costo-empresa de la MOI: el insumo del pozo de CIF |
| `gastosNominaPorPeriodo[periodoId]` | administración y ventas, que **no** son costo del producto |
| `cuadreMO` | horas pagadas vs. imputadas y el costo del tiempo ocioso |
| `tasasCIF` / `tasaPorPeriodo[mes]` | tasa, base, nivel de actividad, incurridos, aplicados y variación |
| `cifPorOrden[ordenId]` | el importe de CIF de esa orden, con su tasa y nivel de actividad |
| `hojasPorOrden[ordenId]` | la hoja completa: encabezado, los cuatro bloques, resumen, margen y precio |

El circuito **material → mano de obra → CIF → hoja** está cerrado: lo que falta para el Prompt 5 son
las ventas y los informes globales, que leen de `hojas` el costo unitario, el precio sugerido y la
utilidad.

---

## Deploy

Cloudflare Workers como sitio estático, igual que `sistema-jacobo`. La config va versionada en
`wrangler.jsonc`. No hay backend ni base de datos: es HTML, JS y los JSON de `data/` metidos dentro
del bundle.
