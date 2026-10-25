/**
 * TODAS las entidades del sistema de costos, en un solo lugar.
 *
 * Muchas todavia no se usan: los modulos de nomina, Kardex, CIF y hojas de
 * costos se construyen en etapas posteriores. Los tipos se definen desde ya
 * para que el modelo de datos quede cerrado antes de escribir las formulas, y
 * para que `calcularTodo` sepa que recibe y que devuelve.
 *
 * AVISO ACADEMICO: los parametros legales (recargos, factor prestacional,
 * porcentajes de aportes) son valores de EJERCICIO, editables desde la
 * pantalla de Configuracion. No son asesoria laboral ni garantia de
 * cumplimiento de la ley colombiana vigente.
 */

// =====================================================================
// 0. ALIAS BASICOS
// =====================================================================

/** Fecha 'YYYY-MM-DD'. Se comparan como string: el orden lexicografico coincide con el cronologico. */
export type Fecha = string
/** Mes 'YYYY-MM'. Mismo truco de comparacion. */
export type Mes = string
/** Identificador de una fila. Lo genera la UI; no hay base de datos. */
export type ID = string

/** Unidades en que se mide y se consume el inventario. */
export type UnidadMedida =
  | 'unidad'
  | 'kg'
  | 'g'
  | 'libra'
  | 'litro'
  | 'ml'
  | 'metro'
  | 'cm'
  | 'm2'
  | 'hora'
  | 'paquete'

// =====================================================================
// 1. CONFIGURACION Y PARAMETROS DE CALCULO
// =====================================================================

/**
 * Como se valora la salida de inventario en el Kardex.
 *
 * 'promedio_ponderado' es el de por defecto. 'ueps' (LIFO) se incluye porque
 * el curso lo pide, aunque en Colombia no se acepte fiscalmente.
 */
export type MetodoInventario = 'promedio_ponderado' | 'peps' | 'ueps'

/**
 * Sobre que se reparten los CIF.
 *
 *   tasa = CIF del periodo / nivel de actividad de esa base
 */
export type BaseTasaCIF =
  | 'unidades'
  | 'horas_mo'
  | 'costo_mo'
  | 'horas_maquina'
  | 'costo_material'
  | 'costo_primo'

/**
 * Como se aplica el margen para sugerir el precio de venta.
 *
 * - 'sobre_costo':  precio = costo x (1 + margen)   — markup sobre el costo
 * - 'sobre_precio': precio = costo / (1 - margen)   — margen sobre la venta
 */
export type MetodoMargen = 'sobre_costo' | 'sobre_precio'

/** Los recargos de nomina, como FACTOR sobre el valor de la hora ordinaria. */
/**
 * Los siete recargos, como FACTOR sobre el valor de la hora ordinaria.
 *
 * Hay dos clases y la diferencia es lo que mas se equivoca:
 *
 *   COMPLETO   la hora es adicional a la jornada y se paga entera por ese
 *              numero. Extra diurna 1.25 = la hora se paga al 125%.
 *   ADICIONAL  la hora YA se pago como ordinaria y esto es solo el recargo
 *              que se le suma encima. Recargo nocturno 0.35 = +35%.
 *
 * El motor multiplica horas x valor_hora x factor en los dos casos: la
 * diferencia vive en como se registran las horas, no en la formula. Una hora
 * dominical de un trabajador por hora se anota dos veces (como ordinaria para
 * pagar la hora, y como dominical para pagar el recargo).
 *
 * ACADEMICO: los numeros son editables desde Configuracion.
 */
export interface RecargosNomina {
  /** COMPLETO. Hora extra diurna: se paga al 125% => 1.25 */
  extra_diurna: number
  /** COMPLETO. Hora extra nocturna: se paga al 175% => 1.75 */
  extra_nocturna: number
  /** ADICIONAL. Recargo nocturno sobre la hora ordinaria: +35% => 0.35 */
  recargo_nocturno: number
  /** ADICIONAL. Dominical o festivo sobre la hora ordinaria: +90% => 0.90 */
  dominical: number
  /** ADICIONAL. Recargo nocturno en dominical o festivo: +125% => 1.25 */
  recargo_nocturno_dominical: number
  /** COMPLETO. Hora extra diurna en dominical o festivo: se paga al 215% => 2.15 */
  extra_diurna_dominical: number
  /** COMPLETO. Hora extra nocturna en dominical o festivo: se paga al 265% => 2.65 */
  extra_nocturna_dominical: number
}

/** Clase de riesgo de la ARL. Decide el porcentaje que paga el empleador. */
export type ClaseRiesgoARL = 'I' | 'II' | 'III' | 'IV' | 'V'

/** En que bloque del costo laboral cae un aporte del empleador. */
export type GrupoAporte = 'prestaciones' | 'seguridad_social' | 'parafiscales'

/**
 * Una linea de lo que el empleador paga POR ENCIMA del salario.
 *
 * Reemplaza al viejo `factor_prestacional` de un solo numero: ahora el factor
 * se DERIVA de estas lineas, asi que se puede ver de donde sale cada punto
 * porcentual y cambiarlo uno por uno.
 *
 * ACADEMICO: los porcentajes son de ejercicio y se editan desde Configuracion.
 * No hay topes, ni IBC minimo, ni reglas de salario integral.
 */
export interface AporteEmpleador {
  id: string
  grupo: GrupoAporte
  nombre: string
  /** Porcentaje sobre el IBC (8.33 = 8,33%). */
  pct: number
  /** Si la linea entra al calculo. Es lo unico que decide. */
  activo: boolean
  /**
   * Marca que esta linea esta sujeta a la EXONERACION DEL ART. 114-1 (salud
   * del empleador, SENA e ICBF).
   *
   * No decide por si sola: lo que decide es `activo`. Sirve para que la
   * pantalla explique por que se puede apagar, y para el boton que apaga las
   * tres de un golpe. Un trabajador que gane 10 SMLMV o mas SI las causa, y
   * eso se resuelve con un override en su ficha.
   */
  cuando_corresponda: boolean
  /**
   * Si esta linea se calcula sobre el IBC MAS el auxilio de transporte.
   *
   * Es la segunda base de la nomina colombiana y la unica excepcion que el
   * sistema modela: cesantias, prima e intereses sobre cesantias se liquidan
   * sobre salario + auxilio de transporte, mientras que pension, salud, ARL,
   * parafiscales y vacaciones van solo sobre el salario.
   *
   * Sin el campo (false) la linea usa el IBC salarial, que es lo que hacia el
   * sistema antes de que existiera esta marca.
   *
   * ACADEMICO y editable, como todo lo demas.
   */
  base_con_auxilio?: boolean
}

/**
 * Todo lo que el usuario puede mover sin tocar codigo. Vive en
 * data/config.json como semilla y se edita desde la pantalla de Configuracion.
 */
export interface ParametrosCalculo {
  /** Horas de la jornada mensual con las que se divide el salario para sacar el valor hora. */
  horas_mes: number
  recargos: RecargosNomina
  /**
   * Lo que el empleador paga por encima del salario, linea por linea.
   *
   * El factor prestacional YA NO SE ESCRIBE A MANO: se deriva de aqui con
   * `factorPrestacionalDe(trabajador, parametros)`, sumando las lineas que
   * apliquen a esa persona mas el porcentaje de su clase de ARL.
   */
  aportes_empleador: AporteEmpleador[]
  /** El porcentaje de ARL de cada clase de riesgo. Editable. */
  arl_clases: Record<ClaseRiesgoARL, number>
  /**
   * Si un trabajador MENSUAL con menos horas ordinarias de las esperadas
   * cobra proporcional.
   *
   * Por defecto false: el salario mensual es el salario, y lo unico que lo
   * baja son las ausencias registradas. En true, las horas que falten para
   * completar `horas_mes` se tratan igual que una ausencia. Solo prorratea si
   * de verdad hay horas registradas: a alguien sin tarjeta de tiempo no se le
   * deja el sueldo en cero por descuido.
   */
  prorratear_ordinarias?: boolean
  /**
   * LEGADO. El factor de un solo numero que se usaba antes de desglosar los
   * aportes. Solo se mira cuando `aportes_empleador` viene vacio o no existe,
   * para que una configuracion vieja guardada en el navegador siga calculando.
   */
  factor_prestacional?: number
  /**
   * Si la mano de obra directa entra a la hoja de costos con el factor
   * prestacional aplicado, o sea al COSTO-EMPRESA de la hora.
   *
   * Por defecto true, y es lo que recomienda la contabilidad de costos: lo que
   * cuesta el producto es lo que la empresa paga por esa hora, prestaciones
   * incluidas, no lo que recibe el trabajador. Se puede apagar si el ejercicio
   * pide costear solo el salario puro.
   *
   * Sin el campo (una config vieja) se asume true.
   */
  mod_con_factor_prestacional?: boolean
  /**
   * CON QUE TARIFA SE COSTEA UNA HORA IMPUTADA A UNA ORDEN.
   *
   * - 'valor_hora' (por defecto): salario / horas_mes, cargado con el factor
   *   prestacional de esa persona. Es rapido y no depende de que la nomina
   *   del periodo este liquidada, pero deja por fuera todo lo que no es
   *   salario: el auxilio de transporte, una bonificacion, un recargo que ya
   *   se pago. Esos pesos existen y hay que ponerlos en algun lado.
   *
   * - 'liquidacion': la TARIFA REAL DEL PERIODO, que es
   *
   *       costo_empresa de la persona en el periodo / horas de la jornada
   *
   *   o sea lo que de verdad costo una hora de esa persona ese mes, auxilio y
   *   prestaciones incluidos. Es el metodo que piden casi todos los talleres
   *   («el costo total de la nomina se reparte entre las horas disponibles»),
   *   y tiene una consecuencia que es justamente lo que se quiere ver: las
   *   horas que NO se imputaron a ninguna orden quedan sin absorber, y eso es
   *   el costo del tiempo ocioso.
   *
   *   En este modo la tarifa YA TRAE las prestaciones, asi que
   *   `mod_con_factor_prestacional` no se vuelve a aplicar: hacerlo cobraria
   *   el factor dos veces.
   *
   * Sin el campo (una config vieja) se asume 'valor_hora'.
   */
  tarifa_mod_desde?: 'valor_hora' | 'liquidacion'
  metodo_inventario: MetodoInventario
  base_cif: BaseTasaCIF
  /**
   * LA CAPACIDAD NORMAL del periodo, en la unidad de `base_cif`.
   *
   * En 0 o sin el campo (por defecto) la tasa de CIF se calcula sobre la
   * actividad REAL del mes: todo lo incurrido se reparte y la variacion da
   * cero.
   *
   * Con un numero, la tasa se calcula sobre ESE nivel —es la TASA
   * PREDETERMINADA de siempre— y entonces aparece la variacion: si la planta
   * trabajo menos que su capacidad normal, parte de los CIF no la absorbe
   * ninguna orden y queda SUBAPLICADA. Eso no es un error del sistema: es el
   * costo de la capacidad que no se uso, y casi todos los talleres lo piden.
   *
   * OJO CON LA UNIDAD: va en la unidad de la base elegida. Con la base en
   * horas de MOD son horas (5 operarios x 210 = 1.050); con la base en
   * unidades son unidades. Si se cambia la base hay que volver a escribirla.
   */
  nivel_actividad_normal?: number
  /**
   * Con que CIF se calcula la tasa del periodo.
   *
   * - 'real' (por defecto): la tasa sale de los CIF realmente causados. Es el
   *   modelo simplificado: lo aplicado cuadra con lo incurrido y la variacion
   *   da cero.
   * - 'presupuestado': la tasa sale de los CIF presupuestados, que es el
   *   modelo de tasa predeterminada. Ahi si aparece la variacion entre CIF
   *   aplicados e incurridos, sub o sobreaplicados.
   *
   * Sin el campo (una config vieja) se asume 'real'.
   */
  cif_tasa_desde?: 'presupuestado' | 'real'
  metodo_margen: MetodoMargen
  /** Margen que se usa cuando el producto no define uno propio, en porcentaje (30 = 30%). */
  margen_por_defecto_pct: number
  /** Multiplo al que se redondean ARRIBA los precios sugeridos. 1 = sin redondeo. */
  redondeo_precio_multiplo: number
}

/** Los datos de la empresa, para encabezados e informes. */
export interface Empresa {
  nombre: string
  razon_social: string
  nit: string
  ciudad: string
  /** Solo informativo: toda la plata se formatea como COP. */
  moneda: string
  /** Que hace la empresa. Sale en la portada de los informes. */
  actividad: string
}

export interface Config {
  /** Version del formato de los datos, para poder migrar un respaldo viejo. */
  version: number
  empresa: Empresa
  parametros: ParametrosCalculo
}

// =====================================================================
// 2. NOMINA
// =====================================================================

/**
 * A donde va el costo de una persona. Es la decision mas importante de todo
 * el sistema:
 *
 * - 'directa':        mano de obra directa, va a la hoja de costos de la orden.
 * - 'indirecta':      mano de obra indirecta, entra al pozo de CIF.
 * - 'administracion': gasto del periodo, NO es costo del producto.
 * - 'ventas':         gasto del periodo, NO es costo del producto.
 */
export type ClasificacionMO = 'directa' | 'indirecta' | 'administracion' | 'ventas'

export type TipoContrato = 'termino_indefinido' | 'termino_fijo' | 'obra_labor' | 'aprendiz'

/**
 * Como se le paga a la persona. Cambia por completo de donde sale el valor de
 * la hora, y es el error clasico de estos ejercicios:
 *
 * - 'mensual':  gana un salario fijo al mes. valor_hora = salario / horas_mes.
 *               Las horas ordinarias YA ESTAN pagadas dentro del salario: no
 *               se vuelven a pagar. Solo se suman extras y recargos.
 * - 'por_hora': gana por hora trabajada. valor_hora = tarifa_hora, y las horas
 *               ordinarias SI se pagan una por una.
 */
export type ModalidadRemuneracion = 'mensual' | 'por_hora'

/** Una persona en la nomina. */
export interface Trabajador {
  id: ID
  codigo: string
  /** Cedula o documento. Opcional: en el ejercicio puede no estar. */
  documento?: string
  nombre: string
  cargo: string
  /** Donde trabaja: 'Planta', 'Taller de corte', 'Oficina'. Libre, para informar. */
  area: string
  clasificacion: ClasificacionMO
  modalidad: ModalidadRemuneracion
  /** Salario del mes. Solo se usa con modalidad 'mensual'. */
  salario_basico: number
  /** Tarifa por hora. Solo se usa con modalidad 'por_hora'. */
  tarifa_hora: number
  /** Si recibe auxilio de transporte. El monto sale del catalogo de conceptos. */
  tiene_auxilio_transporte: boolean
  tipo_contrato: TipoContrato
  /** Clase de riesgo de la ARL. Decide el porcentaje de ARL de esta persona. */
  clase_riesgo: ClaseRiesgoARL
  /**
   * Prestaciones distintas a las globales, SOLO para esta persona.
   *
   * La clave es el id de la linea de `aportes_empleador`. Lo que no este aqui
   * se hereda de la configuracion, asi que cambiar un porcentaje global
   * recalcula a todos los que heredan y deja quietos a los que tienen
   * override. Sirve para el que gana 10 SMLMV o mas y si causa salud, SENA e
   * ICBF aunque la empresa este exonerada.
   */
  aportes_override?: Record<string, { pct?: number; activo?: boolean }>
  /**
   * Si su costo es un COSTO FIJO del periodo, para el analisis de punto de
   * equilibrio.
   *
   * Sin el campo se deriva de la modalidad: 'mensual' es fija (el sueldo se
   * paga igual se produzcan 1 o 1.000 unidades) y 'por_hora' es variable (si
   * no hay produccion no hay horas). Se puede forzar: un trabajador por hora
   * con jornada garantizada se comporta como fijo, y un mensual contratado
   * solo para la temporada alta, como variable.
   */
  mano_obra_fija?: boolean
  fecha_ingreso: Fecha
  activo: boolean
  nota?: string
}

/** Quincena o mes de nomina. Las horas y las liquidaciones cuelgan de aqui. */
export interface PeriodoNomina {
  id: ID
  nombre: string
  mes: Mes
  desde: Fecha
  hasta: Fecha
  /** Un periodo cerrado ya no deberia recibir horas nuevas. */
  estado: 'abierto' | 'cerrado'
}

/** Los tipos de hora que se pagan distinto. Cada uno tiene su factor en RecargosNomina. */
export type TipoHora =
  | 'ordinaria'
  | 'extra_diurna'
  | 'extra_nocturna'
  | 'recargo_nocturno'
  | 'dominical'
  | 'recargo_nocturno_dominical'
  | 'extra_diurna_dominical'
  | 'extra_nocturna_dominical'

/**
 * La tarjeta de tiempo: cuantas horas de cada clase trabajo una persona.
 *
 * OJO con la diferencia frente a AsignacionMO: esto es lo que se le PAGA al
 * trabajador y entra a la liquidacion de nomina. AsignacionMO es a que orden
 * de produccion se le CARGA ese tiempo. Las dos cosas no tienen por que
 * cuadrar: las horas de un trabajador indirecto se pagan pero no se cargan a
 * ninguna orden.
 */
export interface RegistroHoras {
  id: ID
  trabajador_id: ID
  periodo_id: ID
  fecha: Fecha
  tipo_hora: TipoHoraRegistro
  horas: number
  nota?: string
}

/**
 * Lo que se puede anotar en la tarjeta de tiempo: las cinco clases de hora
 * que se pagan, mas las horas que NO se trabajaron.
 *
 * 'ausencia' no es una hora pagada, asi que no vive en `TipoHora`: no tiene
 * recargo y no se puede imputar a una orden. Lo unico que hace es descontarle
 * el salario a un trabajador MENSUAL (a uno por hora no hay que descontarle
 * nada: si no trabajo la hora, no se le paga y punto).
 */
export type TipoHoraRegistro = TipoHora | 'ausencia'

/**
 * Un concepto del catalogo de nomina: que se devenga, que se deduce y que
 * paga el empleador por encima del salario.
 *
 * ACADEMICO: los porcentajes son editables y salen de la semilla, no de una
 * tabla oficial.
 */
export interface ConceptoRemuneracion {
  id: ID
  nombre: string
  /**
   * - 'devengado':       suma a lo que recibe el trabajador (auxilio, bonificacion).
   * - 'deduccion':       resta de lo que recibe (salud, pension, prestamo).
   * - 'aporte_patronal': lo paga la empresa aparte (ARL, caja, SENA, ICBF).
   * - 'prestacion':      provision de la empresa (prima, cesantias, intereses, vacaciones).
   */
  tipo: 'devengado' | 'deduccion' | 'aporte_patronal' | 'prestacion'
  /** Sobre que se calcula. 'fijo' usa monto_fijo y no mira ninguna base. */
  base: 'salario_basico' | 'total_devengado' | 'base_prestacional' | 'fijo'
  /** Porcentaje sobre la base (4 = 4%). Va en null cuando es monto fijo. */
  porcentaje: number | null
  /** Valor fijo. Va en null cuando el concepto es porcentual. */
  monto_fijo: number | null
  /** Si el concepto entra o no en la base prestacional de los demas calculos. */
  afecta_base_prestacional: boolean
  /**
   * true: se le aplica a TODO el mundo en cada liquidacion, sin que haya que
   * anotar nada (salud, pension, auxilio de transporte).
   *
   * false: solo entra cuando alguien registra una `Novedad` que lo invoca
   * (una bonificacion de produccion, la cuota de un prestamo).
   */
  automatico: boolean
  /** Solo para conceptos automaticos: aplica unicamente a quien tenga auxilio de transporte. */
  requiere_auxilio_transporte?: boolean
  activo: boolean
  nota?: string
}

/**
 * Una novedad del periodo: la plata que no sale de las horas.
 *
 * Apunta a un concepto del catalogo, asi que lo que se puede registrar es
 * configurable. El `monto` se deja en null cuando el concepto es porcentual o
 * de monto fijo y se quiere que el motor lo resuelva; se llena para darle un
 * valor puntual a esta novedad (los $80.000 de bonificacion de ESTE mes).
 */
export interface Novedad {
  id: ID
  trabajador_id: ID
  periodo_id: ID
  concepto_id: ID
  monto: number | null
  nota?: string
}

/** Una linea de la liquidacion, ya resuelta a plata. */
export interface LineaLiquidacion {
  concepto_id: ID
  nombre: string
  tipo: ConceptoRemuneracion['tipo']
  /** Sobre que se calculo. 0 cuando el concepto es de monto fijo. */
  base: number
  monto: number
}

/** Una clase de hora ya valorada, para el detalle de la liquidacion. */
export interface LineaHoras {
  tipo_hora: TipoHoraRegistro
  horas: number
  valor_hora: number
  /** El factor de `RecargosNomina`. 1 para las ordinarias, 0 para las ausencias. */
  recargo: number
  monto: number
  /**
   * false cuando las horas se cuentan pero no se pagan aparte: las ordinarias
   * de un trabajador mensual (ya van dentro del salario) y las ausencias.
   */
  se_paga: boolean
}

/**
 * Un aporte del empleador ya resuelto a plata para una persona y un periodo.
 *
 * `origen` dice si el porcentaje salio de la configuracion global o del
 * override de esa persona, para que la liquidacion lo pueda mostrar.
 */
export interface LineaAporte {
  id: string
  grupo: GrupoAporte
  nombre: string
  pct: number
  /** El IBC sobre el que se calculo. */
  base: number
  monto: number
  origen: 'global' | 'trabajador'
}

/**
 * El resultado de liquidar a una persona en un periodo. Es un DERIVADO: lo
 * calcula el motor a partir de trabajador + horas + novedades + conceptos +
 * parametros.
 *
 * LAS DOS CIFRAS QUE NUNCA HAY QUE CONFUNDIR:
 *
 *   `neto_pagar`   lo que recibe la persona  = devengado - deducciones
 *   `costo_empresa` lo que le cuesta a la empresa = devengado x (1 + factor)
 *
 * No son el mismo numero ni se parecen: el neto es MENOR que el devengado y el
 * costo-empresa es MAYOR. El que entra a la hoja de costos es el costo-empresa,
 * nunca el neto.
 */
export interface Liquidacion {
  trabajador_id: ID
  periodo_id: ID
  clasificacion: ClasificacionMO
  modalidad: ModalidadRemuneracion
  /** Mensual: salario / horas_mes. Por hora: la tarifa. */
  valor_hora: number
  horas_por_tipo: Record<TipoHoraRegistro, number>
  lineas_horas: LineaHoras[]
  /**
   * El salario del periodo antes de extras.
   *
   * Mensual: el salario del mes menos las ausencias. Por hora: las horas
   * ordinarias x la tarifa.
   */
  salario_base_periodo: number
  /** Lo que se paga por extras y recargos, sin el salario base. */
  extras_y_recargos: number
  /** Devengados que no vienen de las horas: auxilio, bonificaciones. */
  bonificaciones: number
  /** salario_base_periodo + extras_y_recargos + bonificaciones */
  total_devengado: number
  /**
   * EL IBC: la base sobre la que se calculan los aportes del empleador.
   *
   * Es el DEVENGADO SALARIAL: el salario del periodo, las extras y los
   * recargos, mas los devengados marcados como `afecta_base_prestacional`. El
   * auxilio de transporte y las bonificaciones no salariales NO entran, asi
   * que el IBC puede ser menor que el total devengado.
   *
   * ACADEMICO: no hay tope de 25 SMLMV, ni IBC minimo, ni reglas de salario
   * integral.
   */
  base_prestacional: number
  /**
   * El auxilio de transporte del periodo, aparte.
   *
   * Es la SEGUNDA BASE: no causa pension, salud, ARL ni parafiscales, pero si
   * entra a cesantias, prima e intereses. Las lineas de aporte marcadas
   * `base_con_auxilio` se calculan sobre `base_prestacional + esto`.
   */
  auxilio_transporte: number
  lineas: LineaLiquidacion[]
  total_deducciones: number
  /** Lo que recibe la persona. Nunca negativo. */
  neto_pagar: number
  /** El desglose de lo que paga el empleador por encima del salario. */
  aportes: LineaAporte[]
  /** Suma de `aportes`. Es la carga prestacional de este periodo. */
  carga_prestacional: number
  /** Lo que le cuesta a la empresa: total_devengado + carga_prestacional. */
  costo_empresa: number
  /** El factor derivado de esta persona: suma de sus lineas activas mas su ARL. */
  factor_prestacional: number
  /** valor_hora x (1 + factor de esta persona). Es la tarifa con la que se costea una orden. */
  costo_hora_cargado: number
  /** Horas pagadas que se pueden imputar a una orden (todas menos las ausencias). */
  horas_pagadas: number
  /** Las horas de la jornada del periodo. Solo informativo para un mensual. */
  horas_esperadas: number
  /** Horas que bajaron el salario de un mensual: ausencias, mas el faltante si se prorratea. */
  horas_descontadas: number
  /** La plata que se le descontó al salario mensual por esas horas. */
  descuento_por_horas: number
  alertas: string[]
}

/** El consolidado de un periodo de nomina, repartido por a donde va el costo. */
export interface ResumenNomina {
  periodo_id: ID
  liquidaciones: number
  total_devengado: number
  total_deducciones: number
  total_neto: number
  total_costo_empresa: number
  /**
   * El costo-empresa partido por clasificacion. Es el reparto que evita el
   * doble conteo: lo directo va a las hojas de costos, lo indirecto es insumo
   * de CIF, y administracion y ventas son gasto del periodo.
   */
  por_clasificacion: Record<ClasificacionMO, number>
}

// =====================================================================
// 3. INVENTARIO: MATERIAS PRIMAS, COMPRAS Y KARDEX
// =====================================================================

export interface MateriaPrima {
  id: ID
  codigo: string
  nombre: string
  descripcion: string
  unidad: UnidadMedida
  /** Agrupacion libre para filtrar e informar: 'Maderas', 'Pegantes', 'Empaques'. */
  categoria: string
  /**
   * EL SALDO DE APERTURA, y la unica fuente de verdad de ese saldo.
   *
   * No se guarda como movimiento: el Kardex SINTETIZA la primera fila a
   * partir de estos dos campos. Asi, corregir la apertura es editar la materia
   * prima, y no hay dos sitios donde pueda estar la misma cifra.
   */
  cantidad_inicial: number
  costo_unitario_inicial: number
  /** Cantidad bajo la cual la UI avisa. 0 = no avisar. */
  stock_minimo: number
  proveedor: string
  activo: boolean
  nota?: string
}

/** Una linea de factura de compra. */
export interface ItemCompra {
  materia_prima_id: ID
  cantidad: number
  /** Costo unitario antes de IVA, fletes y descuentos. */
  costo_unitario: number
  iva_pct?: number
}

/**
 * Una compra a un proveedor. Es el documento; lo que entra al Kardex son los
 * movimientos que el motor genera a partir de aqui.
 */
export interface Compra {
  id: ID
  fecha: Fecha
  proveedor: string
  /** Numero de factura o remision. */
  documento: string
  items: ItemCompra[]
  /** Flete del total de la factura. Se reparte entre los items. */
  flete: number
  /** Descuento del total de la factura, en plata. */
  descuento: number
  nota?: string
}

/**
 * Por que se movio el inventario. El signo lo pone el tipo, no la cantidad:
 * las cantidades se guardan siempre positivas.
 */
export type TipoMovimientoKardex =
  | 'saldo_inicial'
  | 'entrada_compra'
  | 'salida_consumo'
  | 'devolucion_a_proveedor'
  | 'devolucion_de_produccion'
  | 'ajuste_entrada'
  | 'ajuste_salida'

/** Un movimiento crudo de inventario, antes de valorarlo. */
export interface MovimientoKardex {
  id: ID
  fecha: Fecha
  materia_prima_id: ID
  tipo: TipoMovimientoKardex
  /** De que se trata, en palabras: 'Compra a Maderas El Roble', 'Faltante de bodega'. */
  concepto: string
  /** Numero de factura, requisicion o acta. Lo que respalda el movimiento. */
  documento: string
  /** Siempre POSITIVA. El signo lo pone `tipo`. */
  cantidad: number
  /**
   * Costo unitario de la ENTRADA. En las salidas va en null: lo resuelve el
   * metodo de inventario (promedio, PEPS o UEPS) al recorrer la tarjeta.
   */
  costo_unitario: number | null
  /** De donde viene: una compra, una orden de produccion, un ajuste. */
  compra_id?: ID
  orden_id?: ID
  /**
   * Deja pasar una salida que deja el saldo en negativo.
   *
   * Es la «regla explicita de ajuste»: sin esto el motor NO aplica una salida
   * mayor al saldo y la reporta como alerta. Se marca a mano, movimiento por
   * movimiento, para que un faltante de bodega se pueda registrar sin apagar
   * la validacion para todo lo demas.
   */
  forzar?: boolean
  nota?: string
}

/**
 * Una fila de la tarjeta de Kardex ya valorada: el movimiento con el saldo
 * que queda despues de aplicarlo. DERIVADO del motor.
 */
export interface FilaKardex extends MovimientoKardex {
  /** Costo unitario con el que de verdad se valoro este movimiento. */
  costo_unitario_aplicado: number
  entrada_cantidad: number
  entrada_total: number
  salida_cantidad: number
  salida_total: number
  saldo_cantidad: number
  saldo_total: number
  /** saldo_total / saldo_cantidad. Con saldo en cero queda en 0. */
  saldo_costo_unitario: number
  /**
   * false cuando el motor NO movio el saldo: una salida mayor al saldo sin
   * `forzar`. La fila se muestra igual, tachada, para que se vea que el
   * movimiento existe pero no se aplico.
   */
  aplicado: boolean
  /** Por que no se aplico, o que tiene de raro. */
  alerta?: string
}

/** Algo que el motor de Kardex quiere que el usuario vea. */
export interface AlertaKardex {
  materia_prima_id: ID
  movimiento_id: ID
  fecha: Fecha
  clase:
    | 'saldo_insuficiente'
    | 'saldo_negativo'
    | 'entrada_sin_costo'
    | 'cantidad_invalida'
    | 'duplicado'
    | 'unidad_incompatible'
  mensaje: string
}

/**
 * La tarjeta de Kardex de UNA materia prima: todas sus filas y el saldo al
 * final. DERIVADO del motor.
 */
export interface Tarjeta {
  materia_prima_id: ID
  metodo: MetodoInventario
  filas: FilaKardex[]
  /** Existencias actuales. */
  saldo_cantidad: number
  /** Valor del inventario: saldo_cantidad x costo_promedio. */
  saldo_total: number
  costo_promedio: number
  alertas: AlertaKardex[]
  /** Ids que llegaron repetidos y se ignoraron. La idempotencia, hecha visible. */
  descartados: ID[]
}

/** Una linea de material consumido por una orden, ya valorada. */
export interface LineaMaterialOrden {
  consumo_id: ID
  materia_prima_id: ID
  codigo: string
  nombre: string
  unidad: UnidadMedida
  cantidad: number
  /** El promedio ponderado vigente en el momento de consumir. */
  costo_unitario: number
  costo_total: number
  /** false si la salida no se pudo aplicar (saldo insuficiente). */
  aplicado: boolean
}

/**
 * El material directo de una orden. Es exactamente lo que la hoja de costos
 * necesita leer: el total y el detalle por linea.
 */
export interface MaterialesOrden {
  orden_id: ID
  lineas: LineaMaterialOrden[]
  /** Suma de las lineas APLICADAS: el costo de materia prima directa. */
  total: number
}

// =====================================================================
// 4. PRODUCTOS Y RECETAS
// =====================================================================

export interface Producto {
  id: ID
  codigo: string
  nombre: string
  unidad: UnidadMedida
  /** Margen propio en porcentaje. En null usa margen_por_defecto_pct. */
  margen_objetivo_pct: number | null
  /**
   * Precio de referencia: lo que hoy se cobra o se piensa cobrar. En null la
   * UI muestra solo el sugerido que sale del costo.
   */
  precio_referencia: number | null
  activo: boolean
  nota?: string
}

/** Una linea de la lista de materiales. */
export interface ItemReceta {
  materia_prima_id: ID
  /** Cantidad por `rendimiento` unidades de producto, no por una sola. */
  cantidad: number
  unidad: UnidadMedida
  /** Desperdicio esperado en porcentaje (5 = 5% de merma). */
  desperdicio_pct: number
}

/**
 * La lista de materiales de un producto (BOM). De 1 a N materiales: la lista
 * no tiene largo fijo y se edita desde la UI.
 *
 * Se versiona para no perder el historico cuando cambia la formula.
 *
 * POR UNIDAD O POR LOTE, con un solo campo: las cantidades de `items` son por
 * `rendimiento` unidades de producto. Con rendimiento 1 la receta es por
 * unidad; con rendimiento 50 es por lote de 50.
 */
export interface Receta {
  id: ID
  producto_id: ID
  version: number
  /** Cuantas unidades de producto salen con las cantidades de `items`. */
  rendimiento: number
  items: ItemReceta[]
  /** Horas de mano de obra directa estimadas por `rendimiento` unidades. */
  horas_mo_estandar: number
  /** Horas de maquina estimadas por `rendimiento` unidades. Sirve de base de CIF. */
  horas_maquina_estandar: number
  vigente: boolean
  nota?: string
}

/**
 * Cuanto cuesta en materiales fabricar el producto segun su receta y los
 * costos de hoy. Es una ESTIMACION para cotizar: el costo real sale de los
 * consumos de la orden. DERIVADO.
 */
export interface CostoReceta {
  receta_id: ID
  producto_id: ID
  lineas: Array<{
    materia_prima_id: ID
    nombre: string
    unidad: UnidadMedida
    /** Ya con el desperdicio sumado. */
    cantidad: number
    costo_unitario: number
    costo_total: number
  }>
  /** Costo de los materiales de un lote de `rendimiento` unidades. */
  total_lote: number
  /** total_lote / rendimiento. */
  por_unidad: number
  /** Materiales que no se pudieron costear, con el por que. */
  faltantes: string[]
}

// =====================================================================
// 5. PRODUCCION: ORDENES, CONSUMOS Y MANO DE OBRA
// =====================================================================

export type EstadoOrden = 'abierta' | 'en_proceso' | 'terminada' | 'anulada'

/** Una orden de produccion por ordenes especificas. Es la unidad de costeo. */
export interface OrdenProduccion {
  id: ID
  numero: string
  producto_id: ID
  cantidad_programada: number
  /** Lo que de verdad salio bueno. En null mientras la orden no termine. */
  cantidad_terminada: number | null
  fecha_inicio: Fecha
  fecha_fin: Fecha | null
  estado: EstadoOrden
  /** Si la orden es contra pedido de un cliente concreto. */
  cliente_id?: ID
  nota?: string
}

/**
 * Material que de verdad salio de bodega hacia una orden (requisicion).
 *
 * NO se duplica como movimiento de Kardex: el motor convierte cada consumo en
 * una salida con id derivado (`consumo:<id>`). Por eso borrar el consumo
 * devuelve el material al saldo y es imposible que una misma salida se
 * descuente dos veces.
 */
export interface ConsumoMaterial {
  id: ID
  orden_id: ID
  materia_prima_id: ID
  fecha: Fecha
  /** Numero de la requisicion o vale de bodega. */
  documento: string
  cantidad: number
  /** En que unidad se pidio. Tiene que ser compatible con la de la materia prima. */
  unidad: UnidadMedida
  /**
   * Normalmente va en null: el costo lo pone el Kardex segun el metodo de
   * inventario. Se llena solo para forzar un costo en un ejercicio.
   */
  costo_unitario: number | null
  /** Deja pasar una salida que deja el saldo negativo. Ver MovimientoKardex.forzar. */
  forzar?: boolean
  nota?: string
}

/**
 * Tiempo de una persona cargado a una orden.
 *
 * Ver el comentario de RegistroHoras: eso es lo que se PAGA, esto es lo que
 * se CARGA al producto. Solo los trabajadores 'directa' llegan aqui.
 */
export interface AsignacionMO {
  id: ID
  orden_id: ID
  trabajador_id: ID
  /** A que periodo de nomina pertenece el tiempo. Sirve para cuadrar horas pagadas vs. imputadas. */
  periodo_id?: ID
  fecha: Fecha
  tipo_hora: TipoHora
  horas: number
  /**
   * Tarifa por hora, SIN el factor prestacional. En null la resuelve el valor
   * hora del trabajador (salario / horas_mes, o su tarifa). Se llena solo para
   * forzar una tarifa en un ejercicio.
   */
  tarifa_hora: number | null
  nota?: string
}

/** Una linea de mano de obra directa imputada a una orden, ya valorada. */
export interface LineaMODOrden {
  asignacion_id: ID
  trabajador_id: ID
  codigo: string
  nombre: string
  tipo_hora: TipoHora
  horas: number
  valor_hora: number
  /** El factor del tipo de hora: 1 para ordinaria, 1.25 para extra diurna... */
  recargo: number
  /** horas x valor_hora x recargo. El salario puro, sin prestaciones. */
  costo_salario: number
  /** costo_salario x (1 + factor_prestacional). */
  costo_empresa: number
  /** El que de verdad se lleva la hoja de costos, segun `mod_con_factor_prestacional`. */
  total: number
}

/**
 * La mano de obra directa de una orden. Es lo que la hoja de costos necesita
 * leer, igual que `MaterialesOrden` con los materiales.
 */
export interface ManoObraOrden {
  orden_id: ID
  lineas: LineaMODOrden[]
  horas: number
  /** Suma de las lineas sin el factor prestacional. */
  total_salario: number
  /** Suma de las lineas con el factor prestacional. */
  total_con_factor: number
  /** El total que entra a la hoja de costos. */
  total: number
}

/** Algo que el motor de nomina quiere que el usuario vea. */
export interface AlertaNomina {
  clase:
    | 'mo_indirecta_en_orden'
    | 'trabajador_inexistente'
    | 'trabajador_inactivo'
    | 'horas_invalidas'
    | 'horas_mes_invalida'
    | 'sin_tarifa'
    | 'horas_sin_imputar'
    | 'imputa_mas_de_lo_pagado'
  mensaje: string
  trabajador_id?: ID
  orden_id?: ID
  periodo_id?: ID
}

// =====================================================================
// 6. CIF (COSTOS INDIRECTOS DE FABRICACION)
// =====================================================================

/**
 * A donde va el costo de una categoria. Es lo que separa los CIF de los
 * gastos, y la razon por la que un arriendo de oficina no puede terminar
 * dentro del costo de un producto.
 *
 * - 'cif':            es de FABRICA y se reparte entre las ordenes.
 * - 'administracion' / 'ventas' / 'financiero': gasto del periodo. Se puede
 *   registrar para tenerlo medido, pero NO entra a ninguna hoja de costos.
 */
export type NaturalezaCategoria = 'cif' | 'administracion' | 'ventas' | 'financiero'

/**
 * Una categoria de costo indirecto, creada por el usuario.
 *
 * El codigo no trae una lista cerrada: la semilla propone las de siempre
 * (materiales indirectos, mano de obra indirecta, servicios, mantenimiento,
 * arriendo de planta, depreciacion, otros) y desde la UI se agregan las que
 * haga falta.
 */
export interface CategoriaCIF {
  id: ID
  nombre: string
  naturaleza: NaturalezaCategoria
  /** 'fijo' no cambia con el volumen; 'variable' si. Informativo. */
  comportamiento: 'fijo' | 'variable'
  /**
   * Base propia para repartir esta categoria. En null usa la general de la
   * configuracion. Queda enganchado para el dia en que el ejercicio pida
   * repartir cada categoria por su propia base.
   */
  base: BaseTasaCIF | null
  activa: boolean
  nota?: string
}

/**
 * Un concepto de CIF causado en un periodo: el arriendo de la planta, la
 * energia, la depreciacion de las maquinas, el mantenimiento.
 *
 * La NATURALEZA no esta aqui sino en la categoria: asi el usuario decide, una
 * sola vez y por categoria, si eso es costo de fabrica o gasto del periodo.
 */
export interface CIF {
  id: ID
  fecha: Fecha
  periodo: Mes
  categoria_id: ID
  concepto: string
  monto: number
  /** Factura, recibo o comprobante que lo respalda. */
  documento: string
  /**
   * true: es un PRESUPUESTADO, y sirve para calcular una tasa predeterminada.
   * false: es lo REAL causado en el periodo.
   *
   * Con los dos se puede comparar aplicado contra incurrido. Ver `TasaCIF`.
   */
  presupuestado: boolean
  nota?: string
}

/**
 * La tasa de CIF de un periodo, ya calculada, con el cuadre entre lo aplicado
 * y lo incurrido. DERIVADO.
 *
 *   tasa = CIF asignables del periodo / nivel de actividad del periodo
 *   CIF de una orden = tasa x nivel de actividad de esa orden
 */
export interface TasaCIF {
  periodo: Mes
  base: BaseTasaCIF
  /** El pozo con el que se calculo la tasa. */
  total_cif: number
  /** De donde salio ese pozo: de los presupuestados o de los reales. */
  desde: 'presupuestado' | 'real'
  /** Unidades, horas o pesos de la base, sumados sobre las ordenes del periodo. */
  nivel_actividad: number
  /**
   * ENTRE QUE SE DIVIDIO DE VERDAD.
   *
   * Normalmente es `nivel_actividad`. Pero si la configuracion fijo una
   * CAPACIDAD NORMAL (`nivel_actividad_normal`), se divide entre esa, y ahi
   * esta la gracia: la tasa deja de depender de que tan ocupada estuvo la
   * planta este mes, y lo que no se alcanza a repartir queda SUBAPLICADO.
   */
  nivel_divisor: number
  /** true cuando el divisor fue la capacidad normal y no la actividad real. */
  desde_capacidad: boolean
  tasa: number
  /** false cuando el nivel de actividad es 0: no hay tasa posible y nada se reparte. */
  valida: boolean
  /** Lo REAL causado en el periodo. */
  cif_incurrido: number
  /** Lo que de verdad se repartio entre las ordenes. */
  cif_aplicado: number
  /**
   * incurrido - aplicado.
   *
   * Positivo = CIF SUBAPLICADOS (se repartio menos de lo que costo).
   * Negativo = CIF SOBREAPLICADOS (se repartio mas de lo que costo).
   *
   * Con la tasa calculada sobre los reales del mismo periodo la variacion da
   * cero por construccion; solo aparece cuando la tasa viene de un
   * presupuesto, que es para lo que sirve el modo 'presupuestado'.
   */
  variacion: number
  /** Las ordenes que cayeron en este periodo. */
  ordenes: ID[]
  /** Lo que se registro pero NO es CIF: gasto del periodo, por naturaleza. */
  gastos_del_periodo: number
}

/** El CIF que le toca a UNA orden. */
export interface CIFOrden {
  orden_id: ID
  periodo: Mes
  base: BaseTasaCIF
  tasa: number
  /** El valor de la base para esta orden: sus unidades, sus horas o sus pesos. */
  nivel_actividad: number
  importe: number
  /** false si la tasa del periodo no se pudo calcular. */
  valido: boolean
  /** true cuando el nivel de actividad es una estimacion y no un dato registrado. */
  estimado: boolean
  /** Por que no se pudo, o que tiene de raro. */
  nota?: string
}

// =====================================================================
// 7. HOJA DE COSTOS
// =====================================================================

/** Un renglon de materiales, mano de obra, CIF u otros dentro de la hoja. */
export interface RenglonHoja {
  concepto: string
  /** La segunda linea, mas chica: el codigo, la clase de hora, la tasa. */
  detalle?: string
  cantidad: number
  unidad: string
  costo_unitario: number
  total: number
}

/**
 * Un costo directo de la orden que no es material ni mano de obra: un flete
 * de entrega, el alquiler de una herramienta para ese trabajo, un troquel.
 *
 * OJO CON DUPLICAR. Esto es para lo que NO pasa por el Kardex ni por la
 * nomina. Si un material ya se consumio como requisicion, no se vuelve a
 * poner aqui; si una hora ya se imputo, tampoco.
 */
export interface OtroCostoDirecto {
  id: ID
  orden_id: ID
  fecha: Fecha
  concepto: string
  monto: number
  nota?: string
}

export type EstadoHoja = 'borrador' | 'finalizada'

/**
 * Lo que se GUARDA de una hoja de costos. Todo lo demas se calcula.
 *
 * La hoja no almacena ni un peso de los tres elementos del costo: esos salen
 * del Kardex, de la nomina y del modulo de CIF cada vez que se mira. Lo unico
 * propio de la hoja es su numero, su fecha, sus observaciones, el override de
 * margen y, cuando se finaliza, la foto congelada.
 */
export interface HojaRegistro {
  id: ID
  orden_id: ID
  numero: string
  fecha_elaboracion: Fecha
  observaciones: string
  estado: EstadoHoja
  /** Override del metodo de margen. null = el de la configuracion. */
  margen_metodo: MetodoMargen | null
  /** Override del porcentaje. null = el del producto, y si no, el de la configuracion. */
  margen_pct: number | null
  /** Sube cada vez que se corrige una hoja ya finalizada. Arranca en 1. */
  version: number
  /**
   * La foto del momento en que se finalizo. Una hoja finalizada muestra e
   * imprime ESTO, no el calculo de hoy: si despues cambia un costo, la hoja
   * firmada no se mueve.
   */
  congelada: HojaCostos | null
  /** Que cambio en cada correccion. La trazabilidad. */
  historial: CambioHoja[]
}

/** Una correccion de una hoja ya finalizada. */
export interface CambioHoja {
  /** La version que queda DESPUES de este cambio. */
  version: number
  /** Fecha y hora en ISO. */
  fecha: string
  motivo: string
  costo_total_antes: number
  costo_total_despues: number
  costo_unitario_antes: number
  costo_unitario_despues: number
  /** Que se movio, en palabras. */
  diferencias: string[]
}

/**
 * LA HOJA DE COSTOS COMPLETA. El derivado central del sistema: integra los
 * tres elementos del costo mas los otros directos, y de ahi sale el costo
 * unitario, el precio sugerido y la utilidad.
 *
 * Ninguna cifra de aqui se escribe a mano. Los materiales vienen del Kardex,
 * la mano de obra de la nomina, los CIF de la tasa del periodo.
 */
export interface HojaCostos {
  // ---------- encabezado ----------
  hoja_id: ID
  numero: string
  orden_id: ID
  orden_numero: string
  empresa: string
  empresa_nit: string
  cliente: string
  fecha_elaboracion: Fecha
  fecha_inicio: Fecha
  fecha_fin: Fecha | null
  producto: string
  producto_codigo: string
  unidad: string
  cantidad_solicitada: number
  cantidad_producida: number
  estado_orden: EstadoOrden
  estado: EstadoHoja
  observaciones: string
  version: number

  // ---------- discriminacion ----------
  /** (A) Materia prima directa, leida del Kardex. */
  materiales: RenglonHoja[]
  /** (B) Mano de obra directa, leida de la nomina. */
  mano_obra: RenglonHoja[]
  /** (C) CIF aplicados: base, tasa y nivel de actividad. */
  cif: RenglonHoja[]
  /** (D) Otros costos directos. */
  otros: RenglonHoja[]

  // ---------- resumen ----------
  total_materiales: number
  total_mano_obra: number
  total_cif: number
  total_otros: number
  /** materiales + mano de obra directa */
  costo_primo: number
  /** mano de obra + CIF */
  costo_conversion: number
  costo_total: number
  /** costo_total / cantidad_producida. Con cantidad 0 queda en 0 y la hoja es borrador. */
  costo_unitario: number

  // ---------- margen y precio ----------
  margen_metodo: MetodoMargen
  margen_pct: number
  /** De donde salio el porcentaje que se aplico. */
  margen_origen: 'hoja' | 'producto' | 'configuracion'
  /** null cuando no se puede calcular (margen sobre venta >= 100%). */
  precio_sugerido: number | null
  /** precio_sugerido - costo_unitario. null si no hay precio. */
  utilidad_unitaria: number | null

  // ---------- completitud ----------
  /** true solo si no falta nada esencial. Es lo que habilita finalizar. */
  completa: boolean
  /** Lo que falta para poder finalizar. Si hay algo aqui, la hoja es borrador. */
  faltantes: string[]
  /** Cosas que conviene mirar pero no impiden finalizar. */
  advertencias: string[]
  /** El detalle del CIF, por si la pantalla quiere mostrar la tasa y la base. */
  cif_detalle: CIFOrden | null
}

// =====================================================================
// 8. COMERCIAL: CLIENTES, VENTAS Y GASTOS
// =====================================================================

export interface Cliente {
  id: ID
  nombre: string
  nit?: string
  contacto?: string
  ciudad?: string
  activo: boolean
  nota?: string
}

export interface ItemVenta {
  producto_id: ID
  cantidad: number
  precio_unitario: number
  /** La orden de la que salio, si la venta es contra pedido. */
  orden_id?: ID
}

export interface Venta {
  id: ID
  fecha: Fecha
  cliente_id: ID
  documento: string
  items: ItemVenta[]
  descuento: number
  nota?: string
}

/**
 * Gasto del periodo: NO es costo del producto. Administracion, ventas y
 * financieros van al estado de resultados directo, no a la hoja de costos.
 */
export interface Gasto {
  id: ID
  fecha: Fecha
  concepto: string
  monto: number
  clasificacion: 'administracion' | 'ventas' | 'financiero' | 'otro'
  nota?: string
}

/**
 * UN DATO QUE LA EMPRESA PROVEE A MANO para el analisis de punto de equilibrio.
 *
 * El sistema DERIVA todo: los costos fijos del periodo, el costo variable
 * unitario de cada producto y su precio. Pero el equilibrio es una herramienta
 * de DECISION, y la empresa tiene que poder decir «corramos el analisis con
 * estos numeros»: un precio que todavia no esta en ninguna hoja, un arriendo
 * que sube el mes que viene, la mezcla de ventas que se espera y no la que ya
 * paso. Esta fila guarda ESO, sin tocar ni un dato real.
 *
 * Cada campo en null significa «usá el derivado». Solo lo que tenga numero
 * reemplaza al calculo, y la pantalla siempre dice cual de los dos esta
 * usando.
 *
 * Con `producto_id: null` la fila es el supuesto DEL PERIODO (los costos
 * fijos). Con un id de producto, es el supuesto de ese producto.
 */
export interface SupuestoEquilibrio {
  id: ID
  periodo: Mes
  /** null = la fila del periodo. Con id = la fila de ese producto. */
  producto_id: ID | null
  /** Solo se mira en la fila del periodo. */
  costos_fijos: number | null
  precio_venta: number | null
  costo_variable_unitario: number | null
  /** Unidades de este producto en una canasta de ventas, para la mezcla. */
  mezcla_unidades: number | null
  nota?: string
}

/**
 * UN NUMERO QUE LA PERSONA ESCRIBE EN UN INFORME.
 *
 * Los dos estados financieros son MIXTOS: el sistema sabe el inventario, el
 * costo de ventas y la utilidad, porque los calculo el. No sabe cuanta plata
 * hay en el banco, ni cuanto se le debe al proveedor, ni que tasa de renta
 * aplica. Eso lo pone la empresa, y se guarda aca.
 *
 * Una sola entidad para los dos informes, con `clave` diciendo que cosa es:
 * el id de una cuenta del balance ('efectivo', 'ppe'...) o un parametro del
 * estado de resultados ('er_tasa_impuesto'...). Asi agregar una cuenta nueva
 * no obliga a migrar nada.
 */
export interface ValorInforme {
  id: ID
  periodo: Mes
  clave: string
  monto: number
}

// =====================================================================
// 9. LOS DATOS CRUDOS, AGRUPADOS POR MODULO
// =====================================================================

/*
  El estado se parte en rebanadas que coinciden con los archivos de `data/` y
  con las claves de localStorage. Asi un respaldo se exporta y se importa por
  modulo, y agregar una entidad no obliga a migrar todo.
*/

export interface DatosNomina {
  trabajadores: Trabajador[]
  periodos: PeriodoNomina[]
  registros_horas: RegistroHoras[]
  conceptos: ConceptoRemuneracion[]
  novedades: Novedad[]
}

export interface DatosInventario {
  materias_primas: MateriaPrima[]
  compras: Compra[]
  movimientos: MovimientoKardex[]
}

export interface DatosProduccion {
  productos: Producto[]
  recetas: Receta[]
  ordenes: OrdenProduccion[]
  consumos: ConsumoMaterial[]
  asignaciones_mo: AsignacionMO[]
  otros_directos: OtroCostoDirecto[]
  /** Las hojas de costos. Solo lo propio de la hoja: el costo se calcula. */
  hojas: HojaRegistro[]
}

export interface DatosCIF {
  categorias: CategoriaCIF[]
  cif: CIF[]
}

export interface DatosComercial {
  clientes: Cliente[]
  ventas: Venta[]
  gastos: Gasto[]
  /** Los numeros que la empresa pone a mano en el punto de equilibrio. */
  supuestos_equilibrio: SupuestoEquilibrio[]
  /** Los numeros que la empresa pone a mano en los estados financieros. */
  valores_informe: ValorInforme[]
}

/** Todo lo crudo junto. Es lo que entra a `calcularTodo` y lo que se respalda. */
export interface DatosCrudos {
  config: Config
  nomina: DatosNomina
  inventario: DatosInventario
  produccion: DatosProduccion
  cif: DatosCIF
  comercial: DatosComercial
}

/** El archivo que sale del boton de Exportar y que espera el de Importar. */
export interface Respaldo extends DatosCrudos {
  /** Marca de agua para reconocer el archivo y no importar cualquier JSON. */
  app: 'sistema-costos'
  version: number
  /** Fecha y hora en que se genero, en ISO. */
  exportado: string
}
