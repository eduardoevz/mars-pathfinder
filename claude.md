# ROL Y OBJETIVO: ARQUITECTO PRINCIPAL FULL-STACK AEROESPACIAL Y GEOESPACIAL

Actúa como el Arquitecto Principal de Software e Ingeniero de Sistemas Científicos encargado de construir **MARS PATHFINDER: Intelligent Planetary Exploration & Human Mission Planning System** para el **NASA Space Apps Challenge 2026**.
- **Lema:** *EXPLORE WITH PURPOSE. DISCOVER BEYOND THE KNOWN.*
- **Subtítulo:** *FROM DATA TO DISCOVERY (From Orbital Data to Human Discovery).*

Tu misión es construir una **aplicación web interactiva, de nivel de producción y $100\%$ funcional**, con cero marcadores de posición vacíos (`TODOs`), cero estados rotos y con ejecución matemática y algorítmica real. Cada botón, control deslizante (*slider*), interruptor de capa, cálculo de ruta ($A^*$ y Dijkstra), simulación metabólica de $\text{O}_2$, predicción de tormentas de polvo, consulta RAG y sincronización bidireccional entre **Mission Control** y el **Astronaut Field HUD** debe funcionar de inmediato al ejecutar el proyecto.

---

## 1. ESTRATEGIA ARQUITECTÓNICA Y DE EJECUCIÓN (A PRUEBA DE HACKATHON)

Construye una aplicación Full-Stack unificada y autocontenida utilizando **Next.js (App Router) + TypeScript + Tailwind CSS + Lucide Icons + Recharts + Motor de Terreno 3D en Three.js / HTML5 Canvas + FastAPI/Python (o API Routes de Next.js con motores científicos deterministas en TypeScript para que la aplicación se ejecute de manera confiable con un único comando `npm run dev` sin fallos por configuración de bases de datos externas)**.
- **Sincronización de Estado:** Utiliza un almacén de estado persistente compartido (`Zustand` + API `BroadcastChannel` + persistencia en `localStorage`) de modo que si el usuario abre **Mission Control** y el **Astronaut Field HUD** en pestañas separadas o cambia de vista en la misma ventana, todos los cambios se sincronicen en tiempo real.
- **Estética de Interfaz (UI):** Estética de telemetría en modo oscuro de alto contraste inspirada en NASA JPL, SpaceX y FUI (*Futuristic User Interface* estilo Robyn Haddow y NASA SUITS): fondo de espacio profundo (`#07090E`), paneles (`#0F172A`), acento Marte (`#FF5722`), cian HUD (`#00F0FF`), verde nominal (`#10B981`), ámbar de precaución (`#F59E0B`), rojo crítico (`#EF4444`) y tipografía monoespaciada para datos numéricos y telemetría.
- **Rigor Científico Estricto (Cero Afirmaciones Falsas):** Cada capa y medición debe mostrar su **Insignia de Procedencia de la NASA (*NASA Provenance Badge*)** incluyendo: `mission`, `instrument`, `product_id`, `observation_date`, `spatial_resolution`, `coverage`, `uncertainty` y `temporal_class`.

---

## 2. REGIONES CIENTÍFICAS PRECARGADAS Y LOS 3 OBJETIVOS REALES DE LA NASA

Precarga dos regiones planetarias con matrices digitales de elevación (grillas DEM con cráteres realistas, escarpes, canales deltaicos y crestas poligonales), coordenadas reales y metadatos oficiales del *Planetary Data System (PDS)* de la NASA:

### Región 1: Cráter Jezero — Región Piloto Principal ($18.4^\circ\text{ N}, 77.7^\circ\text{ E}$)
- **Objetivo 1 (`JZ-TARGET-001`): Afloramiento Cheyava Falls (Canal Bright Angel)**
  - **Coordenadas:** $18.56^\circ\text{ N}, 77.40^\circ\text{ E}$ | **Elevación:** $-2,540\text{ m}$
  - **Contexto Científico:** Roca sedimentaria con forma de punta de flecha estudiada por el rover *Perseverance* en julio de 2024 (Sol 1215). Contiene vetas brillantes de sulfato de calcio depositadas por antigua agua líquida, compuestos orgánicos detectados por **SHERLOC** y manchas milimétricas blanquecinas con bordes oscuros ("manchas de leopardo" o *leopard spots*) que contienen hierro y fosfato (**vivianita / greigita**) identificados por **PIXL**.
  - **Procedencia PDS:** `MRO HiRISE (ESP_065842_1985, 0.25 m/px)`, `MRO CRISM (FRT000047A3, 18 m/px)`, `Mars 2020 SHERLOC & PIXL (SOL_1215_CHEYAVA_FALLS)`, `Mars 2020 Mastcam-Z (ZCAM_SOL1215)`.
  - **Valores Base para $SOI$:** $M=0.96, G=0.95, T=0.98, Q=0.94$.
- **Objetivo 2 (`JZ-TARGET-002`): Unidad Marginal de Carbonatos (Borde Occidental / Antigua Línea de Costa)**
  - **Coordenadas:** $18.52^\circ\text{ N}, 77.38^\circ\text{ E}$ | **Elevación:** $-2,490\text{ m}$
  - **Contexto Científico:** Antigua línea de costa lacustre y depósito fluvio-lacustre rico en carbonatos de $\text{Mg/Fe}$ y olivino alterado, identificado desde la órbita por **CRISM** y confirmado in situ por **SuperCam**, **PIXL** y el radar de penetración terrestre **RIMFAX** (mostrando estratos sedimentarios inclinados en el subsuelo y antiguas superficies de erosión).
  - **Procedencia PDS:** `MRO CRISM (HRL000040FF, 18 m/px)`, `MRO HiRISE DEM (DTEEC_045994_1985, 1.0 m/px)`, `Mars 2020 RIMFAX (RIMFAX_L2_PERSEVERANCE_MARGIN)`, `Mars 2020 SuperCam (SCAM_LIBS_MARGIN_2024)`.
  - **Valores Base para $SOI$:** $M=0.92, G=0.90, T=0.94, Q=0.91$.

### Región 2: Cráter Gale / Monte Sharp (Aeolis Mons) — Región Comparativa y Oficial del Reto ($4.6^\circ\text{ S}, 137.4^\circ\text{ E}$)
- **Objetivo 3 (`GALE-TARGET-001`): Formaciones de Retículas en el Monte Sharp (Boxwork Formations 2025)**
  - **Coordenadas:** $4.68^\circ\text{ S}, 137.42^\circ\text{ E}$ | **Elevación:** $-3,820\text{ m}$
  - **Cita Textual Obligatoria del Reto:** Muestra textualmente en su ficha científica destacada: *"aprender más sobre las formaciones de retículas, un fenómeno geológico que el rover Curiosity estudió en 2025, deberías seleccionar una ubicación donde estas formaciones sean abundantes, como la región del Monte Sharp, donde Curiosity las observó."*
  - **Contexto Científico:** Extensa red de crestas minerales poligonales que se intersectan (*estructuras boxwork* similares a telarañas vistas desde órbita) en las laderas del Monte Sharp, exploradas por **Curiosity** en 2025. Se formaron cuando el agua subterránea rica en minerales circuló a través de fracturas en la roca madre durante la fase de desecación de Marte, cementando las grietas con minerales resistentes (sulfatos/sílice) que soportaron la erosión eólica posterior mientras la roca más blanda circundante fue erosionada, dejando depresiones arenosas huecas entre las crestas y nódulos minerales del tamaño de un guisante.
  - **Procedencia PDS:** `MSL Curiosity Mastcam & ChemCam (MSL_2025_MOUNT_SHARP_BOXWORK)`, `MSL APXS (APXS_2025_RIDGE_CEMENT)`, `MRO HiRISE (PSP_009149_1750, 0.25 m/px)`, `MRO CRISM (FRT0000B6F1, 18 m/px)`.
  - **Valores Base para $SOI$:** $M=0.91, G=0.97, T=1.00, Q=0.89$.

---

## 3. CARTOGRAFÍA MULTICAPA Y CLASIFICACIÓN TEMPORAL (16 CAPAS)

Implementa un Gestor de Capas interactivo con interruptores de visibilidad, controles deslizantes de opacidad ($0\text{--}100\%$) y tarjetas de inspección de procedencia para las **16 capas**:

1. **Capas Científicas (7):**
   - `A. Optical Imaging Layer` (HiRISE $0.25\text{ m/px}$, CTX $6\text{ m/px}$, superposición de fotografías de rovers) — *Static / Relatively Stable*
   - `B. Topographic Layer` (HiRISE Stereo DEM $1\text{ m/px}$, HRSC, MOLA regional $463\text{ m/px}$) — *Static / Relatively Stable*
   - `C. Spectral & Mineralogical Layer` (Filosilicatos, carbonatos de $\text{Mg/Fe}$ y sulfatos de CRISM) — *Static / Relatively Stable*
   - `D. Thermal Layer` (Inercia térmica e IR diurno/nocturno de Mars Odyssey THEMIS; distingue arena suelta de roca madre consolidada) — *Historical Observation & Derived Product*
   - `E. Geological Layer` (Unidades geológicas USGS/NASA: depósitos deltaicos, unidades de fracturas *boxwork*, piso de cráter) — *Static / Relatively Stable*
   - `F. Subsurface & Geophysical Layer` (Perfiles de radargramas RIMFAX de Perseverance a lo largo de su ruta y datos de hidrógeno/agua equivalente de DAN de Curiosity) — *Historical Observation*
   - `G. Chemical Observation Layer` (Mediciones puntuales de PIXL, SuperCam, ChemCam, APXS) — *Historical Observation*

2. **Capas Ambientales, de Terreno y de Seguridad de Exploración Humana (9):**
   - `H. Atmosphere Layer` (MEDA en Jezero / REMS en Gale: presión en $\text{Pa}$, temperatura en $^\circ\text{C}$, velocidad/dirección del viento, profundidad óptica de polvo $\tau$) — *Historical Observation*
   - `I. Surface Radiation Layer` (Radiación superficial de alta energía de Curiosity RAD en $\mu\text{Gy/día}$ — **etiquetada estrictamente como observación histórica del Cráter Gale, nunca falsificada como un sensor directo en Jezero**) — *Historical Observation*
   - `J. Solar & Space Weather Layer` (Contexto de eventos de partículas solares SEP y eyecciones de masa coronal CME de NASA DONKI) — *Historical Observation & Modelled Context*
   - `K. Slope Layer` (Gradiente derivado en grados $0^\circ\text{--}45^\circ$) — *Derived Product*
   - `L. Roughness & Geomechanical Slip Hazard Layer` (Irregularidad superficial + riesgo de deslizamiento/punción del traje sobre arena suelta según THEMIS) — *Derived Product*
   - `M. Boulders & Obstacles Layer` (Campos de rocas cartografiados, dunas, depresiones arenosas y escarpes pronunciados) — *Derived Product*
   - `N. Data Coverage & Uncertainty Layer` (Resalta zonas con DEM HiRISE de alta resolución de $1\text{ m}$ frente a zonas MOLA de baja resolución de $463\text{ m}$ donde los microobstáculos $<1\text{ m}$ son desconocidos) — *Derived Product*
   - `O. Radio Line-of-Sight (Comm Blackout) & Radiation Shelters Layer` (Muestra zonas de sombra de radio respecto a la estación base dentro de cañones y paredes con apantallamiento topográfico natural) — *Derived Product*
   - `P. Human Traverse & Robotic Support Layer` (Rutas EVA planificadas, radio de retorno seguro *Bingo* $\text{O}_2$ y trayectorias de exploración robótica) — *Modelled / Operational*

**REGLA CRÍTICA:** Nunca mezcles capas de baja resolución con capas de alta resolución sin mostrar una advertencia de remuestreo y penalizar el índice de incertidumbre local $U$.

---

## 4. ALGORITMOS MATEMÁTICOS Y DE SEGURIDAD DEL NÚCLEO (MARS PATHFINDER CORE)

Implementa un motor de cálculo modular y limpio (`src/lib/mars-core.ts`) que alimente ambas interfaces:

### 4.1. Pendiente del Terreno y Clasificación de Transitabilidad
Para cada celda $(x,y)$ en el DEM:
$$S = \arctan\left(\sqrt{\left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}\right) \times \frac{180}{\pi}$$
Clasifica cada celda en 5 estados según los umbrales configurados por el usuario:
1. `LOW_COST` ($S \le 6^\circ$, baja rugosidad, alta cobertura de datos)
2. `MODERATE_COST` ($6^\circ < S \le 12^\circ$)
3. `HIGH_COST` ($12^\circ < S \le S_{\max}$)
4. `EXCLUDED_ZONE` ($S > S_{\max}$ u obstáculo intransitable de bloques/acantilado cartografiado)
5. `INSUFFICIENT_DATA` (Baja resolución orbital / alta incertidumbre $U > 0.6$ — **nunca se clasifica automáticamente como segura**)

### 4.2. Índice de Oportunidad Científica ($SOI$)
$$SOI = \alpha M + \beta G + \gamma T + \delta Q$$
- Proporciona controles deslizantes interactivos para los pesos $\alpha$ (Evidencia mineralógica), $\beta$ (Relevancia geológica), $\gamma$ (Relación con la pregunta científica) y $\delta$ (Calidad, resolución y cobertura de los datos), normalizados de modo que $\alpha+\beta+\gamma+\delta = 1$.
- Renderiza una barra apilada transparente para cada objetivo que explique el desglose exacto de su puntuación.

### 4.3. Motor de Enrutamiento Multicriterio $A^*$ y Dijkstra
Implementa la búsqueda de caminos real sobre grafos/cuadrículas tanto para **$A^*$ ($f(n)=g(n)+h(n)$) como para Dijkstra** (incluyendo una métrica comparativa que muestre los nodos explorados y el tiempo de cómputo en $\text{ms}$ para validar la optimalidad de $A^*$).
Función de coste de transición por celda:
$$C(r) = w_D D + w_S S + w_R R + w_O O + w_U U + w_L L$$
Calcula y muestra automáticamente **3 rutas comparativas** entre la Base/Módulo de Aterrizaje y el Objetivo Científico seleccionado:
- **Ruta A (Menor Distancia):** Minimiza $D$. Más corta en kilómetros (ej. $2.8\text{ km}$), pero atraviesa pendientes fuertes (hasta $18^\circ\text{--}19^\circ$) o depresiones arenosas, disparando el consumo metabólico de $\text{O}_2$.
- **Ruta B (Máxima Seguridad Humana y Mínimo Coste de $\text{O}_2$):** Penaliza fuertemente la pendiente $S$, la rugosidad $R$, el riesgo de deslizamiento y la incertidumbre $U$. Mayor longitud (ej. $3.6\text{ km}$), pendiente máxima $\le 9^\circ$ y un ahorro sustancial del tanque de $\text{O}_2$.
- **Ruta C (Máximo Valor Científico):** Visita puntos de interés intermedios con alto $SOI$ respetando siempre el límite de pendiente máxima del traje $S_{\max}$ y el presupuesto de $\text{O}_2$.

### 4.4. Soporte Vital EVA, Consumo del Tanque de $\text{O}_2$ y Motor "Bingo $\text{O}_2$"
Modela la locomoción humana bajo gravedad marciana ($g_{\text{Mars}} = 3.721\text{ m/s}^2 \approx 0.38\,g_{\text{Earth}}$):
- **Entradas:** Masa corporal del astronauta ($m_{\text{body}}$, por defecto $75\text{ kg}$), masa del traje presurizado + mochila PLSS ($m_{\text{suit}}$, por defecto $65\text{ kg}$), masa de herramientas científicas y muestras recolectadas ($m_{\text{load}}$, configurable de $5\text{ a }40\text{ kg}$), velocidad de marcha $v$ ($\text{m/s}$), pendiente de la celda $S$ ($^\circ$), factor de hundimiento/rugosidad del terreno $\eta$ ($1.0$ en roca firme hasta $1.6$ en arena suelta de depresiones *boxwork*) y tiempo de observación científica en los objetivos ($t_{\text{obs}}$).
- **Tasa Metabólica ($M_E$ en Watts):**
  $$M_E = \left[ 1.5\,m_{\text{total}} + 2.0\,(m_{\text{total}})\left(\frac{m_{\text{load}} + m_{\text{suit}}}{m_{\text{body}}}\right)^2 + \eta\,m_{\text{total}}\left(1.5\,v^2 + 0.35\,v\,G_{\text{slope}}\right) \right] \times \text{GravityFactor}_{\text{Mars}}$$
  (Incluye el consumo metabólico basal de soporte vital + penalización por ascenso en pendiente).
- **Consumo Volumétrico de $\text{O}_2$ ($\text{L/min}$ y porcentaje sobre un tanque primario utilizable estándar de $600\text{ L}$):**
  $$\dot{V}_{\text{O}_2} (\text{L/min}) = 0.0028 \times M_E(\text{W}) + 0.35$$
- **Bingo $\text{O}_2$ (Punto de No Retorno):** En cada waypoint $i$, calcula el $\text{O}_2$ de retorno de emergencia requerido para regresar a la Base más una **reserva de seguridad obligatoria del $20\%$**. Si $\text{O}_2\text{ restante} \le \text{O}_2\text{ retorno} + 20\%$, dispara la alerta crítica `BINGO O2 - INICIAR REGRESO INMEDIATO`.
- **Presupuesto de Batería del Traje PLSS y Estrés Térmico:** Calcula el porcentaje de descarga de batería y la carga de sublimación de agua de enfriamiento según el calor metabólico generado y la temperatura superficial ambiente de MEDA/THEMIS ($-75^\circ\text{C}$ a $-5^\circ\text{C}$).

### 4.5. Predictor Pre-EVA de Tormentas de Polvo y Fenómenos Atmosféricos
Construye un **Clasificador Interactivo de Riesgo Atmosférico Pre-EVA** utilizando variables meteorológicas marcianas reales de **MEDA (Jezero)** y **REMS (Gale)**:
- **Entradas Configurables / Históricas:**
  1. Caída de presión barométrica en 3 horas ($\Delta P$ en $\text{Pa}$; marea diurna normal frente a caída brusca $> 15\text{ Pa}$).
  2. Profundidad óptica atmosférica / Opacidad de polvo ($\tau$; cielo despejado $0.4$ hasta tormenta de polvo $> 2.5$).
  3. Estación por Longitud Solar ($L_s \in [0^\circ, 360^\circ]$; temporada de tormentas de polvo en el perihelio $L_s = 180^\circ\text{--}330^\circ$).
  4. Gradiente térmico superficie-aire ($\Delta T = T_{\text{suelo}} - T_{\text{aire}}$, que impulsa remolinos convectivos *dust devils* cerca del mediodía local).
  5. Velocidad máxima de ráfagas de viento ($v_{\text{wind}}$ en $\text{m/s}$).
- **Salidas del Modelo:**
  - Probabilidad ($\%$) de **Tormenta de Polvo Local/Regional**, **Actividad Convectiva de Dust Devils** y **Degradación Crítica de Visibilidad ($<100\text{ m}$)**.
  - **Semáforo Operativo Pre-EVA:** `GO (NOMINAL)`, `CAUTION (VENTANA EVA REDUCIDA / MANTENERSE A <1 KM DE REFUGIO)` o `NO-GO (ABORTAR EVA - ALTO RIESGO ATMOSFÉRICO/SOLAR)`.

### 4.6. Presupuesto de Dosis de Radiación, Refugios Topográficos y Línea de Vista de Radio (LoS)
- **Dosis de Radiación ($\mu\text{Sv}$):** Calcula la dosis estimada de la misión combinando los Rayos Cósmicos Galácticos (línea base de Curiosity RAD $\approx 210\text{--}250\text{ }\mu\text{Gy/día}$) + multiplicador por Evento de Partículas Solares (SPE) según el estado de NASA DONKI.
- **Refugios por Apantallamiento Topográfico:** Identifica paredes de cráter o escarpes pronunciados en el DEM que bloquean geométricamente una fracción del horizonte, marcándolos como **Refugios de Emergencia contra Radiación y Viento** con su distancia y rumbo desde la posición actual del astronauta.
- **Línea de Vista de Radio (Zonas de Sombra / Comm Blackout):** Calcula mediante trazado de rayos (*raycasting*) desde la antena de la Estación Base hacia cada celda. Las celdas profundas dentro de canales (como en *Bright Angel* o quebradas del Monte Sharp) bloqueadas por crestas topográficas se marcan como `COMM_BLACKOUT`. Cuando el astronauta entra en una celda sin señal en el HUD, el **Scientific Field Log** cambia automáticamente a modo `OFFLINE_LOCAL_CACHE` hasta recuperar la línea de vista.

---

## 5. SISTEMA 1: MISSION CONTROL (10 MÓDULOS)

Crea un espacio de trabajo completo y fluido para **Mission Control** que contenga:
1. **Planetary Intelligence Map (Visor 3D/2.5D Interactivo en Canvas/WebGL):** Renderizado interactivo del terreno del Cráter Jezero y del Cráter Gale (Monte Sharp) con extrusión de elevación 3D, superposición de las 16 capas, cursor de inspección de coordenadas/pendiente, marcadores de objetivos, zonas de sombra de radio, refugios de radiación y trazado de las Rutas A, B y C.
2. **Scientific Evidence Engine:** Inspector de expedientes científicos que correlaciona la evidencia orbital con la de los rovers, etiquetas de instrumentos, IDs de productos PDS, resolución espacial y notas explícitas de incertidumbre.
3. **Scientific Discovery Engine:** Calculadora interactiva del índice $SOI$ con controles deslizantes para $\alpha, \beta, \gamma, \delta$, reordenamiento de prioridad en vivo y gráficos de desglose explicables.
4. **Smart Traverse Planner:** Selector de Origen/Objetivo, interruptor de validación $A^*$ vs. Dijkstra, tarjetas comparativas lado a lado para la **Ruta A (Más Corta)**, **Ruta B (Más Segura / Menor Consumo de $\text{O}_2$)** y **Ruta C (Máxima Ciencia)**, además de un **Gráfico Interactivo de Perfil de Elevación, Pendiente y Descarga de $\text{O}_2$** (Recharts).
5. **Environmental, Radiation & Dust Storm Predictor Panel:** Gráficos de telemetría histórica de MEDA/REMS, panel dual RAD (Gale) + DONKI (Clima Espacial) y el **Simulador Predictivo Pre-EVA de Tormentas de Polvo** con semáforo `GO / CAUTION / NO-GO`.
6. **Human Mobility & EVA Life Support Configurator:** Controles deslizantes para masa de equipo transportado ($5\text{--}40\text{ kg}$), pendiente máxima admisible ($8^\circ\text{--}25^\circ$), número de astronautas y tiempo de observación. Al modificar estos parámetros se actualizan dinámicamente las celdas excluidas en el mapa, se recalculan las rutas $A^*$ y se actualizan el porcentaje del tanque de $\text{O}_2$ y los márgenes de *Bingo* $\text{O}_2$.
7. **Scientific Mission Planner (Asistente Guiado de 10 Pasos):** Flujo paso a paso desde la formulación de la pregunta científica hasta el botón **"Aprobar Plan de Misión y Transmitir al Astronaut HUD"**.
8. **Mission Twin (Simulador Interactivo de la Excursión):** Reproductor con línea de tiempo (`Play`, `Pause`, `Velocidad 1x/5x/10x`, barra de progreso) que anima el avance de los astronautas y del rover de apoyo sobre la ruta seleccionada, actualizando en vivo el $\text{O}_2$ restante, la batería PLSS, la pendiente, el estado de radio y lanzando alertas al cruzar celdas empinadas o de alta incertidumbre.
9. **Mission Dashboard:** Tarjetas ejecutivas de KPIs y gráficos que muestran el área cubierta por alta resolución ($\text{km}^2$), capas activas, objetivos documentados, porcentaje de la ruta con DEM de alta resolución, distancia total, desnivel acumulado, pendiente máxima, porcentaje estimado del tanque de $\text{O}_2$ consumido, dosis de radiación ($\mu\text{Sv}$) y **contador en vivo de registros de campo sincronizados desde el HUD**.
10. **Robotic Support Planner:** Permite asignar un *Rover Scout* o *Dron Aéreo Conceptual* simulado para inspeccionar previamente zonas de alta incertidumbre ($U$), establecer puntos de encuentro (*rendezvous*) para entrega de herramientas y actuar como repetidor móvil de radio.

---

## 6. SISTEMA 2: ASTRONAUT FIELD HUD (9 MÓDULOS)

Crea una interfaz inmersiva en primera persona que simule el visor de realidad aumentada del casco del astronauta (`Astronaut Field HUD`) con encuadre curvo de visor, superposiciones telemétricas y total interactividad:
1. **Astronaut Navigation System:** Cinta de brújula superior ($0^\circ\text{--}360^\circ$), coordenadas actuales, distancia restante al siguiente waypoint, flechas de ruta proyectadas en 3D/AR e indicador de desviación lateral respecto al recorrido aprobado.
2. **Scientific Target Recognition:** Retículas flotantes AR sobre *Cheyava Falls*, la *Unidad Marginal de Carbonatos* o las *Formaciones de Retículas del Monte Sharp (2025)*. Al hacer clic en una retícula se despliega la lista de verificación de muestreo en campo, las firmas minerales a observar y la procedencia PDS.
3. **Terrain Awareness, Geomechanical Slip & Uncertainty Alerts:** Inclinómetro en vivo ($^\circ$), indicador de riesgo de deslizamiento/punción del traje, alertas de proximidad a rocas/trampas de arena y una **Advertencia Destacada de Incertidumbre Cartográfica** cada vez que se atraviesan celdas con baja resolución orbital (citando la resolución exacta de la fuente DEM).
4. **Environmental, Dust & Radiation Visor Widget:** Telemetría compacta con temperatura, tendencia barométrica ($\Delta P$), velocidad del viento, opacidad de polvo ($\tau$), estado solar DONKI, contexto de referencia RAD y distancia/flecha hacia el **Refugio Topográfico contra Radiación** más cercano.
5. **First-Person Surface Viewer (Vista Dividida Orbital vs. Superficie Real del Rover):** Comparador visual interactivo que contrasta el recorte orbital de HiRISE con visualizaciones/panoramas reales a nivel de superficie tomados por Perseverance (*Mastcam-Z / Navcam*) y Curiosity (*Mastcam / MAHLI* sobre las crestas de retículas), indicando explícitamente cuándo la georreferenciación es exacta y cuándo es contextual.
6. **Human Mobility, $\text{O}_2$ Tank & Suit Status:** Indicador de alta visibilidad del **Nivel del Tanque de $\text{O}_2$ ($\%$)**, tasa de consumo metabólico ($\text{L/min}$), **Margen de Retorno Seguro *Bingo* $\text{O}_2$**, barra térmica/batería del traje PLSS, carga transportada ($\text{kg}$) y cronómetro de EVA transcurrido/restante. Incluye un botón **"Simular Emergencia (Evento Solar / Ráfaga de Polvo / Bajo $\text{O}_2$)"** que demuestra el desvío automático hacia el refugio más cercano.
7. **AI Scientific Assistant (Consola RAG Verificable en Campo):** Asistente científico con preguntas predefinidas de campo y entrada de texto libre. Cada respuesta **DEBE** estructurarse obligatoriamente en 3 bloques codificados por color:
   - `[1] DATOS MEDIDOS POR LA NASA`: Observaciones directas de los instrumentos con citas exactas de su `product_id` en PDS.
   - `[2] PRODUCTOS DERIVADOS Y MODELOS`: Pendiente calculada, índices espectrales o métricas metabólicas y de ruta.
   - `[3] INTERPRETACIÓN CIENTÍFICA Y LIMITACIONES`: Hipótesis astrobiológicas o geológicas vigentes (ej. explicaciones abióticas vs. bióticas para *Cheyava Falls* o cementación por agua subterránea para las *Retículas del Monte Sharp*) con notas explícitas sobre sus limitaciones.
8. **Scientific Field Log (Offline-First y Sincronización en Tiempo Real):** Formulario para registrar hallazgos de campo (ID de objetivo, título de observación, descripción geológica, lectura de espectrómetro portátil simulado, ID de tubo de muestra, coordenadas, fecha y hora). Incluye un **Interruptor Online / Sombra de Radio Offline**: los registros guardados sin señal se almacenan en una cola local y se sincronizan hacia **Mission Control** con un clic al recuperar línea de vista (apareciendo instantáneamente en el mapa de Mission Control y actualizando los KPIs del dashboard).
9. **Cooperative Exploration Interface:** Minimapa táctico de escuadrón que muestra las posiciones y estados en tiempo real de `EVA-1 (Comandante)`, `EVA-2 (Geólogo)` (incluyendo el nivel de su tanque de $\text{O}_2$) y el `Rover Scout`, junto con los puntos de encuentro compartidos.

---

## 7. MÓDULO TRANSVERSAL: CENTRO DE RÚBRICA Y PITCH NASA SPACE APPS 2026

Añade un botón destacado en la barra de navegación superior **`[NASA Space Apps Rubric & Guided Demo]`** que abra un centro interactivo de evaluación y presentación con:
1. **Recorrido Guiado de Demostración en 1 Clic (Modo Pitch de 3 Minutos):** Una barra interactiva paso a paso que guía automáticamente al usuario o al jurado a través de las etapas completas de la expedición:
   - *Paso 1:* Seleccionar el objetivo oficial del reto (**Formaciones de Retículas de 2025 en el Monte Sharp** en Gale) y **Cheyava Falls** en Jezero.
   - *Paso 2:* Inspeccionar las capas multimisión y calcular el **Science Opportunity Index ($SOI$)**.
   - *Paso 3:* Ejecutar el **Predictor Pre-EVA de Tormentas de Polvo** y configurar la carga del traje espacial.
   - *Paso 4:* Comparar la **Ruta A ($2.8\text{ km}$, pendiente $18^\circ$, $78\%$ del tanque de $\text{O}_2$ - Insegura por *Bingo* $\text{O}_2$)** frente a la **Ruta B ($3.6\text{ km}$, pendiente $9^\circ$, $52\%$ del tanque de $\text{O}_2$ - Óptima y Segura)**.
   - *Paso 5:* Ejecutar la simulación en vivo en el **Mission Twin**.
   - *Paso 6:* Cambiar al **Astronaut Field HUD**, inspeccionar las imágenes de superficie, consultar al **Asistente RAG**, registrar una muestra de roca dentro de una **Zona de Sombra de Radio (Offline)** y sincronizarla de vuelta a **Mission Control**.
2. **Matriz de Impacto y Beneficiarios (Criterio 4 de la Rúbrica):** Tarjetas detalladas explicando:
   - *Exploración Humana en Marte (Artemis / Moon-to-Mars / NASA SUITS):* Optimización de rutas EVA y mitigación de riesgos de soporte vital.
   - *Campañas Terrestres en Terrenos Análogos:* Aplicabilidad directa para expediciones geológicas humanas en terrenos volcánicos extremos y calderas en la Tierra (como los terrenos basálticos y calderas volcánicas de Nicaragua y Centroamérica).
   - *Comunidad Académica y de Investigación Planetaria:* Puente educativo y científico que unifica archivos fragmentados del PDS.
3. **Catálogo Oficial de Datos NASA y Declaración de Transparencia de IA (Criterios 1, 3 y Apartado 8 de la Guía Oficial):** Tabla interactiva con los 17 instrumentos de la NASA, enlaces directos a los repositorios oficiales (`PDS`, `ODE`, `Mars Trek`, `HiRISE`, `THEMIS`, `JMARS`, `NASA DONKI`), nota técnica sobre el descarte de APIs obsoletas, las 10 limitaciones científicas respetadas y la **Declaración Transparente de Uso de IA**.

---

## 8. ORDEN DE IMPLEMENTACIÓN PARA CLAUDE CODE

Ejecuta la construcción de manera sistemática en este orden exacto sin detenerte a pedir confirmación intermedia:
1. **Estructura Base y Dependencias:** Inicializa la estructura del proyecto, instala `lucide-react`, `recharts`, `clsx`, `tailwind-merge` (y Three.js si es necesario) y verifica `package.json`.
2. **Motor Científico y Matemático Central (`src/lib/mars-core.ts` y `src/lib/nasa-seed-data.ts`):** Implementa las matrices DEM de elevación e incertidumbre precargadas para Jezero y Gale (Monte Sharp), los 3 objetivos reales de la NASA con todos sus metadatos PDS, las 16 capas cartográficas, la calculadora de pendiente por gradiente $\arctan$, la calculadora de $SOI$, los algoritmos reales de búsqueda de rutas $A^*$ y Dijkstra, el modelo metabólico EVA de consumo de $\text{O}_2$ y *Bingo* $\text{O}_2$, el modelo predictivo Pre-EVA de riesgo de tormentas de polvo, el calculador de línea de vista de radio (LoS) y refugios topográficos, y la base de conocimientos verificada para el asistente RAG.
3. **Almacén de Estado Compartido y Motor de Sincronización (`src/lib/mission-store.ts`):** Construye el gestor de estado reactivo con sincronización vía `localStorage` y `BroadcastChannel` para que Mission Control y el Astronaut Field HUD permanezcan $100\%$ sincronizados en tiempo real.
4. **Interfaz del Sistema 1 (`src/components/mission-control/...`):** Construye el visor interactivo de terreno 3D/2.5D en Canvas (con zoom, paneo, inclinación 3D, renderizado de capas, trazado de rutas e inspección por clic) y todos los módulos de Mission Control.
5. **Interfaz del Sistema 2 (`src/components/astronaut-hud/...`):** Construye el visor AR en primera persona del Astronaut Field HUD con todos sus módulos, simulador de emergencias, Field Log con modo offline y asistente RAG.
6. **Centro de Rúbrica y Tour Guiado (`src/components/rubric-modal/...`):** Construye el controlador del Recorrido Guiado de 1 Clic y el modal de Evaluación y Procedencia de NASA Space Apps.
7. **Compilación y Verificación Final:** Ejecuta `npm run build` / verificación de tipos, corrige cualquier error de TypeScript o de renderizado y asegúrate de que la aplicación funcione limpiamente en `localhost:3000`. Comienza la implementación de inmediato.