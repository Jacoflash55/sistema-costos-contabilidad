# Sistema de Costos

Sistema web de contabilidad de costos para una pequeña empresa. Proyecto universitario de
Contabilidad de Costos.

Corre en tu computador, no sube nada a internet, no tiene cuentas ni login. Los datos viven en los
JSON de `data/` (la semilla) y en el almacenamiento local del navegador (lo que vos editás).

> **Aviso académico.** Los recargos de nómina, el factor prestacional y los porcentajes de aportes
> son valores de **ejercicio**, editables desde la pantalla de Configuración. Sirven para resolver
> el taller: no son asesoría laboral ni contable, y no garantizan el cumplimiento de la ley
> colombiana vigente.

> **¿Primera vez?** [`GUIA-TALLER.md`](GUIA-TALLER.md) resuelve el taller de la empresa XYZ paso a
> paso con el sistema: qué se agrega, dónde, cómo y por qué, día por día y compra por compra. Es la
> mejor forma de aprender a usarlo, y [`COMO-CALCULA.md`](COMO-CALCULA.md) es la hoja de defensa para
> la exposición. El respaldo con la solución está en
> `ejemplos/taller-octubre-xyz.json`.

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
| `npm test` | Corre los 345 tests de las fórmulas |
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

tests/                 un archivo por motor: formato, almacenamiento, kardex,
                       nomina, prestaciones, cif, hoja
```


### El orden de la navegación

La barra de arriba está partida en tres grupos y el orden cuenta la historia del ejercicio:

| Grupo | Páginas | Qué pasa ahí |
|---|---|---|
| **Se configura** | Configuración | Los parámetros del cálculo. Una sola vez. |
| **Se registra** | Materias primas · Productos · Órdenes · Nómina · CIF | **Vos escribís.** Datos de entrada. |
| **Se calcula solo** | Kardex · Hojas de costos · Punto de equilibrio · Informes | **No se escribe nada.** |

Es la regla de oro, visible: si un número del tercer grupo está mal, el error está en el segundo. No
hay ninguna casilla donde se pueda corregir un resultado a mano, y es a propósito — un costo que se
puede escribir encima es un costo que nadie puede auditar.

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

Modelo **académico simplificado**: resuelve el taller, no implementa la ley laboral. El IBC acá es
simplemente el devengado salarial, sin topes ni bases especiales. Todo lo paramétrico está en
Configuración y es editable.

```
valor_hora (mensual)  = salario_mensual ÷ horas_mes
valor_hora (por hora) = tarifa_hora

valor de las horas    = Σ (horas_tipo × valor_hora × recargo_tipo)
total_devengado       = salario_base_período + extras_y_recargos + bonificaciones
neto                  = max(0, total_devengado − deducciones)

IBC (base)            = salario_del_período + extras_y_recargos     ← devengado salarial
factor_prestacional   = Σ pct de las líneas activas del trabajador ÷ 100
carga_prestacional    = Σ (IBC × pct_línea ÷ 100)
costo_MO_empresa      = total_devengado + carga_prestacional
costo_MOD_orden       = Σ (horas_imputadas × valor_hora × recargo × (1 + factor))
```

**El error que el motor evita a propósito.** Un trabajador mensual **no** se paga multiplicando su
salario por las horas: su salario del mes ya incluye las horas ordinarias. Las ordinarias solo se
cuentan para saber cuánto tiempo se trabajó y poder imputarlo a órdenes; lo único que se suma aparte
son extras y recargos. Un trabajador por hora sí multiplica sus ordinarias por la tarifa. Hay un test
que compara las dos modalidades con el mismo valor hora para fijarlo.

**Cómo se leen los recargos (los 7).** Hay dos clases de recargo y confundirlas es el error clásico.
Un factor **completo** paga la hora entera por ese número, porque es una hora adicional a la jornada.
Un factor **adicional** paga solo el sobrecosto, porque la hora ya se pagó como ordinaria.

| Tipo de hora | Parámetro | Valor académico | Clase | Qué significa |
|---|---|---|---|---|
| Extra diurna | `extra_diurna` | 1,25 | completo | hora adicional de día: se paga 125% |
| Extra nocturna | `extra_nocturna` | 1,75 | completo | hora adicional de noche: se paga 175% |
| Recargo nocturno | `recargo_nocturno` | 0,35 | adicional | la hora ordinaria cayó de noche: +35% |
| Dominical o festiva | `dominical` | 0,90 | adicional | la hora ordinaria cayó en domingo: +90% |
| Recargo nocturno dominical | `recargo_nocturno_dominical` | 1,25 | adicional | domingo de noche: 0,90 + 0,35 |
| Extra diurna dominical | `extra_diurna_dominical` | 2,15 | completo | extra de día en domingo: 1,25 + 0,90 |
| Extra nocturna dominical | `extra_nocturna_dominical` | 2,65 | completo | extra de noche en domingo: 1,75 + 0,90 |

Los cuatro **adicionales** obligan a anotar la hora **dos veces** en un trabajador por hora: una vez
como ordinaria (para pagar la hora) y otra en su columna de recargo (para pagar el sobrecosto). Los
tres **completos** se anotan una sola vez. La pantalla de horas rotula cada columna con su clase, y
`CLASE_RECARGO` en `src/lib/nomina.ts` es la fuente única de esa distinción.

Todos los valores son **editables** en Configuración. Son los que usa el taller, no una afirmación de
cumplimiento legal.

### Las prestaciones, línea por línea

El factor prestacional **no se escribe a mano**: se deriva sumando una tabla de aportes del empleador.

```
factor_prestacional = Σ pct de las líneas activas ÷ 100
aporte_de_la_línea  = IBC × pct ÷ 100
carga_prestacional  = Σ aportes
costo_empresa       = total_devengado + carga_prestacional
```

La tabla vive en `parametros.aportes_empleador` y se edita en Configuración. Cada línea tiene grupo
(prestaciones sociales, seguridad social, parafiscales), nombre, porcentaje, un interruptor `activo` y
una marca `cuando_corresponda`. El ARL es aparte: se toma de `parametros.arl_clases` según la **clase
de riesgo** del trabajador (I a V), así que dos personas con el mismo sueldo pueden costar distinto.

Los valores académicos que trae el seed:

| Grupo | Línea | % |
|---|---|---|
| Prestaciones sociales | Cesantías | 8,33 |
| Prestaciones sociales | Prima de servicios | 8,33 |
| Prestaciones sociales | Intereses sobre cesantías | 1,00 |
| Prestaciones sociales | Vacaciones | 4,17 |
| Seguridad social | Pensión (empleador) | 12,00 |
| Seguridad social | Salud (empleador) | 8,50 · *cuando corresponda* |
| Seguridad social | ARL | según clase: I 0,522 · II 1,044 · III 2,436 · IV 4,35 · V 6,96 |
| Parafiscales | Caja de compensación | 4,00 |
| Parafiscales | SENA | 2,00 · *cuando corresponda* |
| Parafiscales | ICBF | 3,00 · *cuando corresponda* |

**Qué es el IBC acá.** La base de cada aporte es el **devengado salarial**: salario del período más
extras y recargos. **No** entran las bonificaciones no salariales, y por eso aparecen en la
liquidación fuera de la base. Es una simplificación académica: no hay topes, ni bases mínimas, ni
límites de 25 SMMLV.

**Las dos bases.** La única excepción que el sistema modela, porque es la que se pide en todos los
talleres: **cesantías, prima e intereses sobre cesantías van sobre salario + auxilio de transporte**,
mientras que pensión, salud, ARL, parafiscales y vacaciones van solo sobre el salario. Cada línea de
la tabla tiene una columna **Base** que se cambia con un clic (`IBC` ↔ `IBC + auxilio`), y la
liquidación muestra con cuál se calculó cada renglón. Con la base ampliada activa, el factor que se
reporta es el **efectivo** (carga ÷ IBC), no la suma de los porcentajes: con todas las líneas sobre el
IBC los dos coinciden, y si alguna usa el auxilio el efectivo es mayor. Reportar la suma sería mentir
sobre lo que cuesta la hora.

**Las tres marcas *cuando corresponda*** son salud del empleador, SENA e ICBF: son los aportes que la
**exoneración del Art. 114-1 del Estatuto Tributario** puede eliminar para ciertos empleadores. El
botón «Aplicar exoneración 114-1» de Configuración apaga las tres de una vez; volverlas a encender las
restaura. Si aplica o no en un caso real es una decisión del ejercicio, no del sistema.

**Overrides por trabajador.** Por defecto cada trabajador hereda las líneas globales. En su ficha, el
panel de prestaciones permite decir «no, las mías son distintas» y cambiar el porcentaje o apagar
líneas solo para esa persona (`trabajador.aportes_override`). Cada línea muestra su origen —Global o
Propio— y el panel compara el factor resultante contra el que tendría si heredara. «Volver a las
globales» borra el override. Cambiar un porcentaje global mueve a todos **menos** a quien lo tenga
sobrescrito; hay tests que lo fijan.

**El prorrateo, a la vista.** Un trabajador mensual cobra su salario completo; lo que lo baja son las
horas que no trabajó. La liquidación muestra las cuatro cifras: horas esperadas, trabajadas,
descontadas y el descuento en pesos. Las ausencias registradas siempre descuentan. El interruptor
`prorratear_ordinarias` (apagado por defecto) decide si además se descuentan las horas que
simplemente **faltan** para completar el mes; con él apagado, un registro incompleto no castiga el
sueldo. El descuento nunca supera el salario básico del período.

### Las dos cifras que nunca hay que confundir

| | Qué es | Comparado con el devengado |
|---|---|---|
| **Neto a pagar** | lo que recibe la persona: devengado − deducciones | **menor** |
| **Costo para la empresa** | devengado + carga prestacional (IBC × factor derivado) | **mayor** |

La hoja de costos se lleva el **costo-empresa**, nunca el neto. Las dos se muestran en columnas
separadas en la liquidación, y en cada orden se ve el costo con y sin factor lado a lado.

El interruptor `mod_con_factor_prestacional` (Configuración, encendido por defecto) decide cuál de
las dos cifras entra a la hoja de costos. Encendido: el costo-empresa de la hora, que es lo que
recomienda la contabilidad de costos. Apagado: solo el salario puro, si el ejercicio lo pide así.


### Con qué tarifa se costea una hora

`tarifa_mod_desde` (Configuración) decide de dónde sale el precio de una hora imputada a una orden:

| Modo | Fórmula | Cuándo |
|---|---|---|
| `valor_hora` *(por defecto)* | `salario ÷ horas_mes × (1 + factor)` | Rápido, no necesita la nómina liquidada. Deja por fuera el auxilio y cualquier devengado que no sea salario. |
| `liquidacion` | `costo_empresa del período ÷ horas de la jornada` | Lo que de verdad costó una hora ese mes, todo adentro. Es lo que piden casi todos los talleres. |

En modo `liquidacion` el factor **no** se vuelve a aplicar: la tarifa ya lo trae, y aplicarlo sería
cobrarlo dos veces. Se divide entre las horas de la **jornada**, no entre las imputadas, y eso es a
propósito: una hora no cuesta más porque la persona haya estado quieta media jornada. Lo que pasa es
que esas horas no las absorbe ninguna orden — y esa diferencia, medida y visible, es el **tiempo
ocioso**. Si alguien no tiene nómina liquidada, el motor cae al valor hora y lo dice en una alerta.

Una `tarifa_hora` escrita en la asignación manda sobre las dos: es la válvula de escape para forzar
una tarifa en un ejercicio.

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


**La capacidad normal.** `nivel_actividad_normal` (Configuración, en 0 por defecto) cambia el
divisor:

```
en 0     tasa = CIF ÷ actividad REAL del mes      → todo se absorbe, variación = 0
con 1050 tasa = CIF ÷ 1.050                        → tasa PREDETERMINADA
```

Con un número, la tasa deja de depender de qué tan ocupada estuvo la planta: un mes flojo no encarece
cada unidad. El precio de eso es que los CIF de la capacidad que no se usó no los absorbe nadie y
quedan **subaplicados** — visibles en la variación, y es justo lo que casi todos los talleres piden
calcular. Va en la unidad de la base elegida, así que si se cambia la base hay que volver a
escribirla.

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

### Secretos y costos

**No hay ninguna API key en este repositorio, y no puede haberla**, porque la app no tiene con quién
hablar: no hay backend, no hay base de datos y no sale una sola petición a internet en tiempo de
ejecución. Los datos viven en el `localStorage` del navegador (claves `costos:*`) y las semillas
están metidas dentro del bundle.

Lo que se verificó, y cómo repetirlo:

| Qué | Comando |
|---|---|
| No hay patrones de clave en el código | `grep -rniE "sk-\|AIza\|ghp_\|api[_-]?key\|secret\|token" src/ data/` |
| Tampoco en el historial de git | `git log --all -p \| grep -niE "api[_-]?key\|secret"` |
| La app no llama a ninguna red | `grep -rnE "fetch\(\|XMLHttpRequest\|axios\|WebSocket" src/` |
| No usa variables de entorno | `grep -rn "import.meta.env\|process.env" src/` |
| El deploy no lleva secretos ni bindings | `npm run deploy:dry` → **«No bindings found»** |

El `.gitignore` bloquea `.env`, `.env.*`, `*.key` y `*.pem` **por prevención**: hoy no hay ninguno,
pero el repositorio es público y si algún día se agrega uno tiene que ser imposible subirlo por
accidente.

**Sobre la plata.** El plan Free de Cloudflare Workers no tiene facturación por exceso: cuando se
pasa un límite devuelve un error, no una cuenta de cobro. Y este sitio sirve **solo archivos
estáticos**, cuyas peticiones son gratis e ilimitadas — el script del Worker ni siquiera corre. Para
que esto llegara a costar algo habría que entrar a la cuenta y cambiarse a un plan pago a propósito.
`observability` quedó apagado en `wrangler.jsonc` porque no registraría nada útil en un sitio
estático.

> Los límites y los planes de Cloudflare cambian: antes de confiar en esto, miralo en tu panel
> (Workers & Pages → Plans) y confirmá que la cuenta siga en **Free**.
