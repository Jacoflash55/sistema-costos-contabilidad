# Guía: resolver el taller de octubre con el sistema

Esta guía resuelve **el taller de la empresa XYZ** usando solo el sistema, paso a paso y en el
orden en que el profesor lo va pidiendo. Cada paso dice **qué** se agrega, **dónde**, **cómo** y
—lo que más importa— **por qué**.

Al final hay una tabla con las cinco respuestas y el número exacto que tiene que darte.

> **Si algo no cuadra**, al final está la sección «Cuando un número no da» con los cinco sospechosos
> de siempre.

> **Para la exposición:** [`COMO-CALCULA.md`](COMO-CALCULA.md) tiene la hoja de defensa — la fórmula de
> cada módulo, por qué esa y no otra, cómo probarla en pantalla, y las preguntas que más probablemente
> te hagan con la respuesta lista.

---

## Cómo está organizado el sistema

La barra de arriba está partida en tres grupos, y el orden no es decorativo:

| Grupo | Páginas | Qué pasa ahí |
|---|---|---|
| **Se configura** | Configuración | Los parámetros del cálculo. Una sola vez, al principio. |
| **Se registra** | Materias primas · Productos · Órdenes · Nómina · CIF | **Vos escribís.** Son los datos de entrada. |
| **Se calcula solo** | Kardex · Hojas de costos · Punto de equilibrio · Informes | **No se escribe nada.** Todo sale de lo anterior. |

La regla de oro: **si un número del grupo 3 está mal, el error está en el grupo 2.** No hay ninguna
casilla en el Kardex ni en la hoja de costos donde se pueda «corregir» un resultado a mano, y eso es
a propósito: un costo que se puede escribir encima es un costo que nadie puede auditar.

---

## Paso 0 · Empezar en limpio

**Dónde:** botón **↺ Reiniciar** arriba a la derecha → «Sí, borrar todo».

Vuelve a los datos de fábrica. Si ya tenías algo cargado y no lo querés perder, primero **⬇ Exportar**
(te baja un `.json` que después se vuelve a cargar con **⬆ Importar**).

---

## Paso 1 · Configuración

**Dónde:** `⚙️ Configuración`

El taller impone unos parámetros. Hay que dejarlos puestos **antes** de cargar nada, porque la nómina
y los CIF se calculan con ellos.

### 1.1 La empresa

| Campo | Valor |
|---|---|
| Nombre | `Empresa XYZ` |
| Razón social | `Empresa XYZ S.A.S.` |

*Por qué:* sale en el encabezado de las hojas de costos que vas a imprimir.

### 1.2 Horas de la jornada mensual

| Campo | Valor |
|---|---|
| Horas del mes | `210` |

*Por qué:* es el divisor de todo. El taller dice que hay 5 trabajadores y después reparte las horas
contra un total disponible; ese total es `5 × 210 = 1.050`. Si ponés 240 el costo por hora cambia y
nada más va a cuadrar.

### 1.3 Aportes del empleador

Bajá a la tabla **Aportes del empleador**. Dejala así:

| Línea | % | Se cobra | Base |
|---|---|---|---|
| Cesantías | 8,33 | ✔ | **IBC + auxilio** |
| Prima de servicios | 8,33 | ✔ | **IBC + auxilio** |
| Intereses sobre cesantías | 1,00 | ✔ | **IBC + auxilio** |
| Vacaciones | 4,17 | ✔ | IBC |
| Pensión (empleador) | 12,00 | ✔ | IBC |
| Salud (empleador) | 8,50 | ✘ | IBC |
| Caja de compensación | 4,00 | ✔ | IBC |
| SENA | 2,00 | ✘ | IBC |
| ICBF | 3,00 | ✘ | IBC |

Para apagar salud, SENA e ICBF de un golpe: botón **«Aplicar exoneración 114-1»**.

**Por qué la columna «Base».** En Colombia hay dos bases y confundirlas es el error clásico:

- Pensión, salud, ARL, parafiscales y **vacaciones** van sobre el **salario solo**.
- Cesantías, prima e intereses van sobre el **salario + el auxilio de transporte**.

Clic en la celda «Base» para cambiarla. Con un salario de 2.300.000 y auxilio de 249.095, la
diferencia son unos 44.000 pesos por trabajador: no es redondeo, es plata.

**Por qué se apagan salud, SENA e ICBF.** Es la **exoneración del Art. 114-1 del Estatuto Tributario**:
un empleador que la tenga no causa esos tres aportes por los trabajadores que ganen menos de 10
SMMLV. El taller no lo dice con esas palabras, pero las cifras que esperan salir salen así. Si tu
profe los quiere cobrar, prendelos: el sistema recalcula todo solo.

> El **factor prestacional ya no se escribe a mano**: sale de sumar esta tabla. Abajo de ella lo ves
> en solo lectura.

### 1.4 La tarifa de la mano de obra

Bajá al recuadro **«Con qué tarifa se costea una hora cargada a una orden»** y elegí:

> **Tarifa real del período (de la liquidación)**

**Por qué.** Hay dos maneras de ponerle precio a una hora:

- *Valor hora del salario × factor* — divide **solo el salario** entre las 210 h y le suma el factor.
  Rápido, pero deja el auxilio de transporte por fuera.
- *Tarifa real del período* — divide el **costo-empresa completo** de la persona (salario + auxilio +
  prestaciones + aportes) entre las 210 h de su jornada.

El taller pide la segunda: «el costo de la nómina se reparte entre las horas». Va a dar
**$16.758,11 por hora**, y tiene una consecuencia buscada: de las 210 horas de cada operario solo se
cargaron algunas a las órdenes, y las que sobran quedan **sin absorber**. Eso es el tiempo ocioso, y
es media respuesta de la pregunta 4.

### 1.5 CIF y precios

| Campo | Valor | Por qué |
|---|---|---|
| Base de los CIF | **Horas de mano de obra directa** | El taller dice textual: «los CIF se agregan de acuerdo a las horas trabajadas en la orden». |
| Tasa de CIF calculada con | CIF reales del período | No hay presupuesto en este ejercicio. |
| **Capacidad normal del período** | **1.050** | 5 operarios × 210 h. |
| Método de margen | **Margen sobre la venta** | El taller pide «utilidad bruta del 35%», que es sobre la venta. |
| Margen por defecto | `35` | |
| Redondeo del precio | `1` | Sin redondeo, para poder comparar contra el Excel. |

**Por qué la capacidad normal es la decisión más importante de esta pantalla.** Con el campo en 0 la
tasa se calcularía sobre las horas que de verdad se trabajaron (955), todo el CIF se repartiría y la
variación daría cero. Poniendo 1.050 la tasa se vuelve **predeterminada**:

```
tasa = 8.820.000 ÷ 1.050 = $8.400 por hora
```

y entonces solo se aplican `955 × 8.400 = 8.022.000`. Los **$798.000** que faltan son el costo de la
capacidad que no se usó: quedan **subaplicados**. Esa es la otra mitad de la pregunta 4.

**Por qué margen sobre la venta y no sobre el costo.** «Utilidad bruta del 35%» quiere decir que de
cada $100 vendidos, $35 son utilidad. Eso es `PV = costo ÷ (1 − 0,35)`, no `costo × 1,35`. Con un
costo de 326.325 la diferencia es 502.039 contra 440.539: casi 62 mil pesos por mesa.

---

## Paso 2 · Las materias primas

**Dónde:** `🧱 Materias primas` → formulario de arriba

El taller nombra cuatro. Cargá una por una:

| Código | Nombre | Unidad de medida | Cantidad inicial |
|---|---|---|---|
| MP-001 | Madera | Unidad | 0 |
| MP-002 | Metal | Unidad | 0 |
| MP-003 | Plástico | Unidad | 0 |
| MP-004 | Vidrio | Unidad | 0 |

**Por qué «Unidad» y no metros o kilos.** Porque el taller cuenta en unidades («3 unidades de madera»)
y nunca convierte. Si pusieras metros, el sistema te obligaría a declarar una equivalencia que el
ejercicio no da.

**Por qué cantidad inicial en 0.** La empresa arranca el mes sin inventario: todo lo que entra son las
cinco compras. Si pusieras un saldo inicial, el promedio ponderado del día 1 ya saldría distinto.

---

## Paso 3 · Los productos y sus recetas

**Dónde:** `📦 Productos`

### 3.1 Crear los dos productos

| Código | Nombre | Unidad | Margen objetivo |
|---|---|---|---|
| PT-001 | Mesa | Unidad | 35 % |
| PT-002 | Vitrina | Unidad | 35 % |

### 3.2 La receta de cada uno

Clic en el producto → panel de receta. **Rendimiento del lote: 1** (la receta es por una unidad).

**Mesa** — «cada mesa consume 3 unidades de madera, una de metal y una de plástico»:

| Material | Cantidad | Desperdicio |
|---|---|---|
| Madera | 3 | 0 % |
| Metal | 1 | 0 % |
| Plástico | 1 | 0 % |

**Vitrina** — «cada vitrina consume 8 de vidrio, 4 de metal y 1 de plástico»:

| Material | Cantidad | Desperdicio |
|---|---|---|
| Vidrio | 8 | 0 % |
| Metal | 4 | 0 % |
| Plástico | 1 | 0 % |

**Por qué hay que cargar la receta si después vas a registrar los consumos reales.** Por dos razones:
sirve para **comprobar** que las salidas del taller cuadran con lo que las órdenes necesitan
(100 mesas × 3 = 300 madera, y el taller saca 150 + 150 = 300 ✔), y es lo que el sistema usa para
estimar el costo variable unitario en el punto de equilibrio. El costo que entra a la hoja **no** sale
de la receta: sale del Kardex.

---

## Paso 4 · Los clientes y las dos órdenes

**Dónde:** `🧾 Hojas de costos` → pestaña **Clientes**

Creá `Cliente A` y `Cliente B`. (El taller no da más datos; con el nombre alcanza.)

**Dónde:** `🏭 Órdenes` → formulario de arriba

| Número | Producto | Cliente | Cantidad planeada | Fecha de inicio | Fecha de cierre | Estado |
|---|---|---|---|---|---|---|
| OP-001 | Mesa | Cliente A | 100 | 2026-09-01 | 2026-09-20 | Terminada |
| OP-002 | Vitrina | Cliente B | 80 | 2026-09-01 | 2026-09-20 | Terminada |

Y en cada una, **Cantidad producida**: 100 y 80.

**Por qué hay que poner la cantidad producida.** Sin ella no hay costo unitario: el sistema no sabe
entre cuántas unidades repartir el costo total, y la hoja se queda en borrador diciendo que le falta.

**Por qué la fecha de cierre importa.** Los CIF se aplican por período, y el período de una orden sale
de su **fecha de cierre**. Las dos cierran en septiembre, así que las dos caen en `2026-09` y comparten
la misma tasa.

> **Creá las órdenes ahora**, antes de las compras. Las salidas a producción se registran *desde* la
> orden, así que tienen que existir primero.

---

## Paso 5 · La nómina

**Dónde:** `👷 Nómina`

### 5.1 El período — pestaña «Períodos»

| Campo | Valor |
|---|---|
| Nombre | Septiembre 2026 |
| Mes | 2026-09 |
| Desde / Hasta | 2026-09-01 / 2026-09-30 |

### 5.2 Los cinco operarios — pestaña «Trabajadores»

Cargá cinco, todos iguales salvo el nombre:

| Campo | Valor |
|---|---|
| Código / Nombre | OP-001 … OP-005 / Operario A … E |
| Clasificación | **Mano de obra DIRECTA (va a la hoja de costos)** |
| Modalidad de remuneración | **Mensual fijo** |
| Salario mensual | `2.300.000` |
| Clase de riesgo (ARL) | **Clase III — riesgo medio** |
| Recibe auxilio de transporte | ✔ |

**Por qué «directa».** Porque el taller dice a qué producto se le cargan sus horas. Si los marcaras
como indirectos, el sistema **se negaría** a imputarles horas a una orden y te avisaría por qué: su
costo tendría que llegar al producto por los CIF. Ese muro existe para que un mismo peso no entre dos
veces al producto.

**Por qué clase III.** El taller dice «riesgo de ARL 3» → **2,436 %**. Lo ves debajo del selector.

**Por qué el auxilio.** Un salario de 2.300.000 está por debajo de 2 SMMLV, así que causa auxilio de
transporte. El sistema lo agrega solo a quien tenga la casilla marcada.

### 5.3 El auxilio de transporte — pestaña «Conceptos»

Verificá que exista un concepto así:

| Campo | Valor |
|---|---|
| Nombre | Auxilio de transporte |
| Tipo | Devengado |
| Base de cálculo | Monto fijo |
| Monto fijo | `249.095` |
| Entra a la base prestacional | **✘** |
| Automático | ✔ |
| Solo a quien reciba auxilio de transporte | ✔ |

**Por qué «entra a la base prestacional» va apagado.** Porque el auxilio **no** causa pensión, salud,
ARL ni parafiscales. Que igual entre a cesantías, prima e intereses ya lo resolviste en el paso 1.3
con la columna «Base» — por eso acá va apagado y allá prendido en tres líneas. Son dos cosas distintas
y el sistema las separa.

### 5.4 Las horas pagadas — pestaña «Horas y novedades»

Es una cuadrícula. Clic en la celda **Ordinarias** de cada operario y escribí `210`.

Total abajo: **1.050 horas pagadas**.

**Por qué 210 y no las horas que trabajó en las órdenes.** Esto es lo que se le **paga**: el mes
completo. Lo que se le **carga a cada orden** es otra cosa y va en el paso 7. Que las dos no coincidan
es justamente el punto del ejercicio.

### 5.5 Comprobá la liquidación — pestaña «Liquidación»

Sin escribir nada más, ya tiene que decir:

| Cifra | Valor |
|---|---|
| Total devengado (5) | `$12.745.475` |
| Neto a pagar (5) | `$11.825.475` |
| **Costo para la empresa (5)** | **`$17.596.016`** |

Y por trabajador, abriendo el desglose:

| Concepto | Base | Monto |
|---|---|---|
| Salario | | 2.300.000 |
| Auxilio de transporte | | 249.095 |
| **Devengado** | | **2.549.095** |
| Cesantías 8,33 % | 2.549.095 | 212.339,61 |
| Prima 8,33 % | 2.549.095 | 212.339,61 |
| Intereses 1 % | 2.549.095 | 25.490,95 |
| Vacaciones 4,17 % | 2.300.000 | 95.910 |
| Pensión 12 % | 2.300.000 | 276.000 |
| Caja 4 % | 2.300.000 | 92.000 |
| ARL III 2,436 % | 2.300.000 | 56.028 |
| **Costo empresa** | | **3.519.203,18** |

Fijate en la columna **Base**: las tres primeras van sobre 2.549.095 y el resto sobre 2.300.000. Si te
salen todas sobre la misma base, volvé al paso 1.3.

**La hora cuesta** `3.519.203,18 ÷ 210 = $16.758,11`.

---

## Paso 6 · Las cinco compras, día por día

**Dónde:** `📋 Kardex` → formulario de movimiento

Cada compra son **cuatro movimientos**, uno por material. Tipo: **Entrada por compra**.

### Compra 1 — día 1 (fecha `2026-09-01`, documento `COMPRA-1`)

| Materia prima | Cantidad | Costo unitario |
|---|---|---|
| Madera | 100 | 40.000 |
| Metal | 100 | 55.000 |
| Plástico | 50 | 20.000 |
| Vidrio | 100 | 35.000 |

### Compra 2 — día 5 (`2026-09-05`, `COMPRA-2`)

| Materia prima | Cantidad | Costo unitario |
|---|---|---|
| Madera | 50 | 41.000 |
| Metal | 100 | 57.000 |
| Plástico | 30 | 21.000 |
| Vidrio | 120 | 36.000 |

### Compra 3 — día 10 (`2026-09-10`, `COMPRA-3`)

| Materia prima | Cantidad | Costo unitario |
|---|---|---|
| Madera | 50 | 42.000 |
| Metal | 100 | 58.000 |
| Plástico | 50 | 20.500 |
| Vidrio | 110 | 35.800 |

**Pará acá.** Después de esta compra va la primera salida (paso 7). Comprobá los promedios antes de
seguir:

| Material | Existencias | Costo promedio |
|---|---|---|
| Madera | 200 | `40.750` |
| Metal | 300 | `56.666,67` |
| Plástico | 130 | `20.423,08` |
| Vidrio | 330 | `35.630,30` |

### Compra 4 — día 15 (`2026-09-15`, `COMPRA-4`)

| Materia prima | Cantidad | Costo unitario |
|---|---|---|
| Madera | 70 | 43.000 |
| Metal | 100 | 59.000 |
| Plástico | 40 | 20.800 |
| Vidrio | 200 | 37.000 |

### Compra 5 — día 20 (`2026-09-20`, `COMPRA-5`)

| Materia prima | Cantidad | Costo unitario |
|---|---|---|
| Madera | 70 | 45.350 |
| Metal | 100 | 61.000 |
| **Plástico** | 30 | 21.100 |
| Vidrio | 150 | 37.050 |

> ⚠️ **Ojo con esta línea.** El enunciado dice «compra de **metal** 30 a 21.100», pero es un error de
> tipeo: 21.100 es precio de plástico (los otros plásticos van entre 20.000 y 20.800, el metal entre
> 55.000 y 61.000), y sin esas 30 unidades el plástico no alcanza para las 180 que piden las dos
> órdenes. **Va como plástico.** Anotalo en la entrega para que no parezca un descuido tuyo.

**Por qué el orden importa.** El promedio ponderado es **perpetuo**: se recalcula en cada movimiento.
Si metés la compra 4 antes de la salida del día 10, esa salida sale a otro promedio y todo el
ejercicio cambia. El sistema ordena por fecha y, dentro del mismo día, **primero las entradas y
después las salidas** — por eso la compra 3 y la salida 1 pueden ir las dos con fecha 10.

---

## Paso 7 · Las dos salidas a producción

**Dónde:** `🏭 Órdenes` → abrí la orden → panel **Material directo** → «Registrar consumo»

Acá está la única decisión de verdad del taller: **el enunciado da la salida total, no partida por
orden.** Hay que repartirla, y el reparto sale de las recetas.

Lo que cada orden necesita en todo el mes:

| | Madera | Metal | Plástico | Vidrio |
|---|---|---|---|---|
| OP-001 · 100 mesas | 300 | 100 | 100 | — |
| OP-002 · 80 vitrinas | — | 320 | 80 | 640 |
| **Total** | **300** | **420** | **180** | **640** |

Y el taller saca 150+150, 250+170, 80+100 y 280+360 → coincide exacto. ✔

### Salida 1 — día 10 (`2026-09-10`, documento `SALIDA-1`)

En **OP-001 (mesas)**:

| Material | Cantidad |
|---|---|
| Madera | 150 |
| Metal | 100 |
| Plástico | 40 |

En **OP-002 (vitrinas)**:

| Material | Cantidad |
|---|---|
| Metal | 150 |
| Plástico | 40 |
| Vidrio | 280 |

### Salida 2 — día 20 (`2026-09-20`, documento `SALIDA-2`)

En **OP-001 (mesas)**:

| Material | Cantidad |
|---|---|
| Madera | 150 |
| Plástico | 60 |

En **OP-002 (vitrinas)**:

| Material | Cantidad |
|---|---|
| Metal | 170 |
| Plástico | 40 |
| Vidrio | 360 |

**Por qué ese reparto y no otro.** El metal de la salida 1 (250 u) se parte 100 para mesas y 150 para
vitrinas, porque las mesas necesitan 100 en todo el mes y ahí se cubren completas; las otras 150 son
un adelanto de las 320 de las vitrinas. El plástico de la salida 1 (80 u) se parte 40 y 40.
**Es una decisión tuya, y hay que poder defenderla** — pero no cambia el costo total de la salida 1,
porque las dos órdenes consumen al mismo promedio ese día. Lo que sí cambia es cuánto material le toca
a cada producto, así que anotala en la entrega.

**Por qué no se escribe el costo.** El campo de costo unitario se deja vacío: el sistema lo toma del
**promedio vigente en esa fecha**. Es lo que hace que el Kardex y la hoja de costos no puedan
contradecirse.

**Comprobá el Kardex ahora.** En `📋 Kardex` elegí cada material y mirá las tres cifras de arriba; el
total está en `🧱 Materias primas`, en «Valor del inventario». Tiene que quedar así:

| Material | Saldo | Costo promedio | Valor |
|---|---|---|---|
| Madera | 40 | 43.273,68 | 1.730.947,37 |
| Metal | 80 | 59.333,33 | 4.746.666,67 |
| Plástico | 20 | 20.717,95 | 414.358,97 |
| Vidrio | 40 | 36.847,54 | 1.473.901,52 |
| **Total** | | | **8.365.874,52** |

Ese total ya es la **respuesta 3**.

---

## Paso 8 · Las horas de cada operario a cada orden

**Dónde:** `🏭 Órdenes` → abrí la orden → panel **Mano de obra**

Son **diez registros**: cinco operarios × dos órdenes. En cada uno: trabajador, **Período de nómina:
Septiembre 2026**, clase de hora **Ordinaria**, y las horas.

**En OP-001 (mesas):**

| Operario | Horas |
|---|---|
| A | 120 |
| B | 130 |
| C | 75 |
| D | 80 |
| E | 84 |
| **Total** | **489** |

**En OP-002 (vitrinas):**

| Operario | Horas |
|---|---|
| A | 70 |
| B | 50 |
| C | 125 |
| D | 125 |
| E | 96 |
| **Total** | **466** |

**Por qué esto es distinto de las horas del paso 5.4.** Allá anotaste lo que se **paga** (210 por
cabeza, 1.050 en total). Acá anotás lo que se **carga al producto** (489 + 466 = 955). La diferencia,
**95 horas**, no se las lleva ningún producto: es tiempo que se pagó y no se usó.

Abrí `👷 Nómina → Liquidación` y bajá al cuadre de horas: ahí está medido.

```
costo ocioso = 17.596.016 − (8.194.716 + 7.809.279) = $1.592.020,48
```

**Por qué poner el período de nómina.** Es lo que le permite al sistema cuadrar horas pagadas contra
horas imputadas. Sin él, esas 95 horas desaparecerían sin que nadie las viera.

Comprobá en cada orden:

| Orden | Horas | MOD |
|---|---|---|
| OP-001 | 489 | `$8.194.715,97` |
| OP-002 | 466 | `$7.809.279,43` |

(= horas × 16.758,11)

---

## Paso 9 · Los CIF del mes

**Dónde:** `🔧 CIF` → pestaña **Categorías**, y después **Conceptos y tasa**

### 9.1 Las categorías

Acá se decide, **una sola vez por categoría**, si algo es costo del producto o gasto del período.

| Nombre | Naturaleza | Comportamiento |
|---|---|---|
| Arrendamiento de la fábrica | **CIF (costo del producto)** | Fijo |
| Alarma de la fábrica | **CIF** | Fijo |
| Depreciación de maquinaria | **CIF** | Fijo |
| Seguro de la fábrica | **CIF** | Fijo |
| Software administrativo | **Administración (gasto del período)** | Fijo |
| Arrendamiento oficina administrativa | **Administración** | Fijo |

**Por qué esto es lo más importante de la página.** El arriendo **de la fábrica** es CIF: se reparte
entre las órdenes. El arriendo **de la oficina** no: es gasto del período y nunca toca el costo del
producto. Lo mismo el software administrativo. Si los metieras como CIF, el costo de cada mesa
subiría y la respuesta 1 quedaría mal.

### 9.2 Los conceptos — período `2026-09`

| Concepto | Categoría | Importe |
|---|---|---|
| Arrendamiento de la fábrica | Arrendamiento de la fábrica | 7.000.000 |
| Alarma de la fábrica | Alarma de la fábrica | 120.000 |
| Depreciación de maquinaria | Depreciación de maquinaria | 950.000 |
| Seguro de la fábrica | Seguro de la fábrica | 750.000 |
| Software administrativo | Software administrativo | 200.000 |
| Arrendamiento oficina administrativa | Arrendamiento oficina | 3.500.000 |

Dejá **«Es un presupuesto, no un causado»** apagado en los seis: son costos reales del mes.

### 9.3 Comprobá la tasa

En la misma pestaña, arriba:

| Cifra | Valor |
|---|---|
| CIF asignables | `$8.820.000` |
| Gasto del período | `$3.700.000` |
| Nivel de actividad | `955 horas MOD` |
| **Tasa** | **`$8.400 por hora MOD`** |
| Aplicados a órdenes | `$8.022.000` |
| **Variación** | **`$798.000` subaplicados** |

Mirá bien: el nivel de actividad **real** es 955, pero la tasa es `8.820.000 ÷ 1.050` porque pusiste
la capacidad normal en el paso 1.5. Esa es la razón de que sobren 798.000.

Y por orden:

| Orden | Horas | CIF aplicado |
|---|---|---|
| OP-001 | 489 | `$4.107.600` |
| OP-002 | 466 | `$3.914.400` |

---

## Paso 10 · Las hojas de costos (acá no se escribe nada)

**Dónde:** `🧾 Hojas de costos` → «Crear hoja» en cada orden → **Ver hoja**

La hoja se arma sola con los tres bloques que ya cargaste:

| | OP-001 · Mesas | OP-002 · Vitrinas |
|---|---|---|
| Material directo *(del Kardex)* | 20.330.219,30 | 43.473.906,18 |
| Mano de obra directa *(de la nómina)* | 8.194.715,97 | 7.809.279,43 |
| CIF aplicados *(de la tasa)* | 4.107.600,00 | 3.914.400,00 |
| **Costo total** | **32.632.535,27** | **55.197.585,61** |
| Unidades producidas | 100 | 80 |
| **Costo unitario** | **326.325,35** | **689.969,82** |
| Precio sugerido (35 % s/venta) | **502.039,00** | **1.061.492,03** |
| Utilidad por unidad | 175.713,65 | 371.522,21 |

El desglose del material, si lo querés verificar a mano:

| | Madera | Metal | Plástico | Vidrio |
|---|---|---|---|---|
| Mesas | 150×40.750 + 150×43.273,68 | 100×56.666,67 | 40×20.423,08 + 60×20.717,95 | — |
| | = 12.603.552,63 | = 5.666.666,67 | = 2.060.000 | |
| Vitrinas | — | 150×56.666,67 + 170×59.333,33 | 40×20.423,08 + 40×20.717,95 | 280×35.630,30 + 360×36.847,54 |
| | | = 18.586.666,67 | = 1.645.641,03 | = 23.241.598,48 |

Cuando estén bien, **Finalizar** cada hoja. Eso congela la foto: si después cambia un costo, la hoja
finalizada no se mueve y queda registrado qué cambió y por qué. Para imprimir o pasar a PDF, el botón
de imprimir de la hoja.

---

## Las cinco respuestas

| # | Pregunta del taller | Respuesta | Dónde se lee |
|---|---|---|---|
| 1 | ¿Cuál es el costo de producción de A y de B? | **A: $32.632.535,27** · **B: $55.197.585,61** | Hojas de costos |
| 2 | ¿Precio de venta con utilidad bruta del 35 %? | **A: $502.039/u** (orden: $50.203.900,41) · **B: $1.061.492,03/u** (orden: $84.919.362,47) | Hoja de costos, «Precio sugerido» |
| 3 | ¿Qué valor de materias primas queda en inventario? | **$8.365.874,52** | Materias primas, «Valor del inventario» (el detalle por material, en Kardex) |
| 4 | ¿A cuánto ascienden los costos no aplicados? | **$2.390.020,48** | CIF subaplicados $798.000 + tiempo ocioso $1.592.020,48 |
| 5 | ¿Cuál producto fue más rentable? | **La vitrina**, por unidad: $371.522,21 contra $175.713,65 | Hoja de costos |

**Cuidado con la 5.** Por unidad gana la vitrina, pero el margen **sobre la venta es 35 % en las dos**:
se lo fijaste vos. La vitrina deja más plata por unidad porque es un producto más grande, no porque
sea mejor negocio. Si querés una respuesta más honesta, mirá la utilidad por **hora de mano de obra**
(489 h para A y 466 h para B) o pasá por `⚖️ Punto de equilibrio`, donde se ve cuánto aporta cada uno
a cubrir los fijos.

Y ojo con los **$3.700.000** de software y oficina: **no** son «costos no aplicados». Son gasto del
período por naturaleza. Nunca fueron costo del producto, así que no se quedaron sin aplicar: van
derecho al estado de resultados.

---

## Cuando un número no da

Mirá en este orden. Casi siempre es uno de estos cinco:

1. **Las horas del mes no son 210.** Es el divisor de todo. `⚙️ Configuración`.
2. **La tarifa de MOD está en «valor hora × factor»** en vez de «tarifa real del período». Te va a
   dar la MOD más baja porque deja el auxilio por fuera. `⚙️ Configuración`.
3. **La capacidad normal está en 0.** Entonces no hay CIF subaplicados y la pregunta 4 se queda corta.
   `⚙️ Configuración`.
4. **Una compra quedó con fecha posterior a la salida.** El promedio ponderado es perpetuo: el orden
   es el resultado. Revisá el Kardex material por material y comparalo con los promedios del paso 6.
5. **El arriendo de la oficina quedó como CIF.** Fijate en la naturaleza de la categoría, no en el
   nombre del concepto. `🔧 CIF → Categorías`.

Y si querés comparar contra una solución ya armada: **⬆ Importar** →
`ejemplos/taller-octubre-xyz.json`. Trae el taller completo y resuelto. (Reemplaza todo lo que tengas
cargado, así que exportá antes si no querés perderlo.)

---

> **Aviso académico.** Los recargos, los porcentajes de aportes, el auxilio de transporte y los
> métodos de valoración son valores de **ejercicio**, editables desde Configuración. Sirven para
> resolver el taller: no son asesoría laboral ni contable, y no garantizan el cumplimiento de la ley
> colombiana vigente. Verificá las cifras con tu profe antes de usarlas para algo real.
