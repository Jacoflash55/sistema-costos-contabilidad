# Cómo calcula el sistema cada cosa

Hoja de defensa para la exposición. Para cada módulo: **la fórmula**, **por qué esa y no otra**,
**dónde vive en el código** y **cómo probarlo en pantalla** si te lo piden en vivo.

---

## La respuesta corta, si te preguntan una sola vez

> «Todas las fórmulas están en `src/lib/`, son funciones puras —entran datos, salen números, no tocan
> la pantalla— y están probadas con 345 tests. La interfaz **no calcula nada**: le pide el resultado a
> una sola función, `calcularTodo(datos)`. Por eso no hay ninguna casilla donde se pueda escribir
> encima de un resultado: si un número está mal, el error está en un dato de entrada, no en la hoja.»

Y el remate, si quiere pruebas:

> «De esos 345 tests, 30 son **este taller exacto**: el archivo `tests/taller.test.ts` carga el
> ejercicio completo, lo pasa por el sistema y compara contra las respuestas una por una. Si una
> fórmula se rompiera, ese test falla y dice en qué peso.»

---

## 1 · El Kardex — promedio ponderado perpetuo

**La fórmula**

```
ENTRADA   cantidad += c
          valor    += c × costo_unitario
          promedio  = valor ÷ cantidad          ← se recalcula

SALIDA    valor    -= c × promedio
          cantidad -= c
          promedio  = NO CAMBIA                 ← sale al promedio vigente
```

**Por qué.** *Perpetuo* quiere decir que el promedio se recalcula en **cada** entrada, no al final del
mes. Por eso la salida del día 10 sale a $40.750 (el promedio después de tres compras) y la del día 20
a $43.273,68: son dos promedios distintos porque entre medio entraron las compras 4 y 5.

**El orden.** Se ordena por fecha y, dentro del mismo día, **primero las entradas y después las
salidas** — igual que se diligencia una tarjeta a mano. Por eso la compra 3 y la salida 1 pueden ir
las dos con fecha 10 sin que el sistema reclame falta de saldo.

**La guarda.** El sistema **no deja** que una salida deje el saldo en negativo: la rechaza y avisa, a
menos que marques «Forzar» a propósito. Un inventario negativo es un error de registro, no un dato.

**Dónde vive:** `src/lib/kardex.ts` · **45 tests** en `tests/kardex.test.ts`.

**Cómo probarlo en vivo:** abrí `📋 Kardex`, elegí Madera, y mostrá la columna de promedio moviéndose
en cada fila. Hay un invariante que se cumple siempre: `valor del saldo ÷ existencias = costo promedio`.

> **Si te preguntan «¿y por qué no sale al precio de la última compra?»** — porque eso sería UEPS/PEPS,
> no promedio ponderado. El sistema tiene los tres métodos en la configuración, pero **solo el promedio
> está implementado**, y lo dice en voz alta en pantalla en vez de fingir que calcula los otros.

---

## 2 · La nómina — liquidación

**La fórmula**

```
valor_hora      = salario ÷ horas_mes          (mensual)
                = tarifa_hora                   (por hora)

devengado       = salario del período + extras y recargos + auxilio
IBC             = salario del período + extras y recargos        ← sin auxilio
aporte de línea = base de la línea × pct ÷ 100
carga           = Σ aportes
costo_empresa   = devengado + carga
neto            = máx(0, devengado − deducciones)
```

**El error que el motor evita a propósito.** A un trabajador **mensual** el salario **no** se le
multiplica por las horas: su sueldo del mes ya incluye las ordinarias. Las horas solo sirven para saber
cuánto tiempo trabajó y poder imputarlo. A uno **por hora** sí se le multiplican. Hay un test que
compara las dos modalidades con el mismo valor hora para dejarlo fijo.

**Las dos bases.** Esta es la que más preguntan:

| Va sobre el **salario solo** | Va sobre **salario + auxilio** |
|---|---|
| Pensión, salud, ARL, caja, SENA, ICBF | Cesantías |
| Vacaciones | Prima de servicios |
| | Intereses sobre cesantías |

El auxilio de transporte **no es salario**, así que no causa seguridad social ni parafiscales; pero sí
entra a cesantías, prima e intereses. En la liquidación, cada renglón muestra **con qué base** se
calculó — se ve que tres van sobre 2.549.095 y el resto sobre 2.300.000.

**El factor prestacional no se escribe a mano.** Sale de sumar la tabla de aportes. Y el que se
reporta es el **efectivo** (`carga ÷ IBC`), no la suma de los porcentajes: con las dos bases en juego
la carga real es mayor que la suma nominal, y reportar la suma sería mentir sobre lo que cuesta la hora.

**La exoneración.** Salud del empleador, SENA e ICBF están apagados: es el **Art. 114-1 del Estatuto
Tributario**. Son editables — si tu profe los quiere cobrar, se prenden y todo se recalcula.

**Dónde vive:** `src/lib/nomina.ts` · **74 + 36 tests** en `tests/nomina.test.ts` y
`tests/prestaciones.test.ts`.

**Cómo probarlo en vivo:** `👷 Nómina → Liquidación`, abrí el desglose de un operario. Las dos cifras
que nunca hay que confundir están lado a lado: **neto a pagar** $2.365.095 (lo que recibe la persona)
y **costo para la empresa** $3.519.203,18 (lo que cuesta). La hoja de costos se lleva la segunda,
nunca la primera.

---

## 3 · La mano de obra que llega al producto

**La fórmula**

```
tarifa de la hora = costo_empresa del período ÷ horas de la jornada
                  = 3.519.203,18 ÷ 210 = 16.758,11

costo a la orden  = horas imputadas × tarifa × recargo del tipo de hora

tiempo ocioso     = costo total de nómina − Σ lo imputado a órdenes
```

**Por qué se divide entre las horas de la JORNADA y no entre las trabajadas.** Porque una hora no
cuesta más porque la persona haya estado quieta media jornada. Si dividiéramos entre las 955 horas
realmente imputadas, el tiempo ocioso se escondería dentro del costo del producto y la empresa creería
que sus mesas son más caras de lo que son. Dividiendo entre 1.050, las 95 horas que nadie usó **quedan
afuera, visibles, medidas**: $1.592.020,48. Eso es media respuesta de la pregunta 4 del taller.

**El muro contra el doble conteo.** Solo los trabajadores clasificados como **directos** pueden recibir
horas de una orden. Si intentás imputarle horas a un indirecto, el sistema **no las suma** y te explica
por qué: su costo tiene que llegar al producto por la vía de los CIF, nunca por las dos.

**Dónde vive:** `manoObraPorOrden` y `tarifaPorLiquidacion` en `src/lib/nomina.ts`.

**Cómo probarlo en vivo:** abrí una orden → panel **Mano de obra**. Está el cuadre de horas pagadas
(1.050) contra horas imputadas (955), con la diferencia valorizada.

---

## 4 · Los CIF

**La fórmula**

```
pozo asignable = Σ conceptos reales de categorías con naturaleza «CIF»
tasa           = pozo ÷ divisor
CIF de orden   = tasa × nivel de actividad de esa orden
variación      = incurrido − aplicado
```

**Qué entra al pozo y qué no.** Lo decide la **naturaleza de la categoría**, no el nombre del concepto.
El arriendo **de la fábrica** es CIF y se reparte; el **de la oficina** es gasto del período y no toca
el costo del producto. Los $3.700.000 de software y oficina nunca fueron costo: por eso no aparecen
como «no aplicados», sino como gasto del período en su propia casilla.

**Cuál es el divisor.** Acá está la decisión importante:

| | Divisor | Resultado |
|---|---|---|
| Actividad real | 955 h | tasa $9.235,60 · se aplica todo · variación $0 |
| **Capacidad normal** | **1.050 h** | **tasa $8.400 · se aplican $8.022.000 · subaplicados $798.000** |

El taller pide la segunda: es la **tasa predeterminada**. La gracia es que un mes flojo no encarece
cada unidad —la tasa no depende de qué tan ocupada estuvo la planta—, y el precio de eso es que los
CIF de la capacidad que no se usó no los absorbe nadie. **Eso no es un error del cálculo: es el costo
de la capacidad ociosa.**

**La guarda.** Si el nivel de actividad es 0, no hay tasa. En vez de dividir por cero y propagar
infinito, la tasa queda marcada como inválida, nada se reparte, y las hojas de esas órdenes se quedan
en borrador explicando por qué.

**Dónde vive:** `src/lib/cif.ts` · **29 tests** en `tests/cif.test.ts`.

**Cómo probarlo en vivo:** `🔧 CIF` muestra la fórmula escrita arriba del número
(`tasa = CIF asignables ÷ capacidad normal = $8.820.000 ÷ 1.050`) y el cuadre incurridos vs. aplicados
con la variación.

---

## 5 · La hoja de costos

**La fórmula**

```
costo_total    = MPD + MOD + CIF + otros directos
costo_unitario = costo_total ÷ cantidad producida

margen sobre la VENTA   PV = costo ÷ (1 − m)        ← el del taller, 35%
recargo sobre el COSTO  PV = costo × (1 + r)
```

**La hoja no calcula ningún costo.** Esto es lo que más conviene decir: la hoja **lee** lo que los
otros módulos ya calcularon. El material viene del Kardex, la mano de obra de la nómina, los CIF de la
tasa del período. Aquí solo se suman y se divide. Nada se escribe a mano y nada se cuenta dos veces.

**Por qué 35% sobre la venta y no sobre el costo.** «Utilidad bruta del 35%» significa que de cada
$100 vendidos, $35 son utilidad: `PV = costo ÷ 0,65`. Si fuera `costo × 1,35`, la utilidad sobre la
venta daría 25,9%, no 35%. Con la mesa: $502.039 contra $440.539 — **$61.500 de diferencia por unidad**.

**La guarda que importa.** Con margen sobre la venta y m ≥ 100%, el divisor es cero o negativo: no
existe precio que deje ese margen. El sistema **no calcula nada** y dice por qué, en vez de devolver
infinito o un número negativo.

**Borrador vs. finalizada.** Una hoja en borrador se recalcula sola cada vez que cambia algo de origen.
Una finalizada congela la foto y no se mueve aunque después cambie un costo; corregirla sube la versión
y deja registrado qué cifra cambió y por qué.

**Dónde vive:** `src/lib/hoja.ts` · **50 tests** en `tests/hoja.test.ts`.

**Cómo probarlo en vivo:** éste es el mejor truco de la exposición → **cambiá el precio de una compra
en el Kardex y volvé a la hoja.** El promedio, el costo del material, el costo unitario y el precio
sugerido se movieron solos. Después deshacelo.

---

## Las preguntas que más probablemente te hagan

| Si te dicen… | Respondés… |
|---|---|
| «¿Y cómo sé que no escribiste el resultado a mano?» | No hay dónde. En las páginas del grupo «Se calcula solo» no existe un solo campo editable. Si querés cambiar un costo, hay que cambiar el dato que lo produce. |
| «¿Por qué la salida no sale al precio de la última compra?» | Porque es promedio ponderado perpetuo, no UEPS. Mirá la tarjeta: el promedio se recalcula en cada entrada. |
| «¿Dónde está el riesgo de contar dos veces la mano de obra?» | En imputar a una orden las horas de un indirecto. El sistema lo rechaza y lo explica: ese costo entra por los CIF. |
| «¿Por qué el arriendo de la oficina no está en el costo?» | Porque es gasto del período. Lo decide la naturaleza de la categoría, y se ve en su propia casilla: $3.700.000. |
| «¿Y los $798.000 que faltan de CIF?» | Están subaplicados a propósito: la tasa se calculó sobre la capacidad normal de 1.050 h y solo se trabajaron 955. Es el costo de la capacidad ociosa. |
| «¿Por qué el costo-empresa no es el neto a pagar?» | Son dos cifras distintas. El neto es lo que recibe la persona (menos deducciones); el costo-empresa es lo que paga la empresa (más aportes). Al producto va el costo-empresa. |
| «¿Esto cumple la ley laboral?» | No, y el sistema lo dice en pantalla. Los porcentajes son académicos y editables. Es un modelo para resolver el taller, no una implementación de la ley. |
| «¿Y si cambio un dato?» | Se recalcula todo solo. *(Mostralo: cambiá el precio de una compra.)* |

---

## Lo que el sistema NO hace — decilo vos antes de que te lo encuentren

1. **No genera libro diario ni asientos contables.** No hay cuentas del PUC, ni débitos y créditos.
   El sistema llega hasta la hoja de costos; los asientos los seguís armando aparte. *(Tu Excel sí los
   tiene — si el profe los pide, mostrá esa hoja.)*
2. **Solo está implementado el promedio ponderado.** PEPS y UEPS aparecen en la configuración pero no
   calculan; el sistema lo advierte en pantalla en vez de fingir.
3. **Una orden que cruza dos meses cae entera en el mes en que terminó.** Es una simplificación del
   modelo, documentada.
4. **El IBC no tiene topes ni bases mínimas.** No hay límite de 25 SMMLV ni reglas de salario integral.
5. **La página de Informes está vacía** (estado de resultados, márgenes por producto). Es lo que sigue.

Decir esto **suma**: muestra que sabés dónde están los límites de tu propio modelo, que es exactamente
lo que un contador tiene que saber de cualquier sistema que use.
