export type TemporalClass =
  | "Static / Relatively Stable"
  | "Historical Observation"
  | "Derived Product"
  | "Modelled / Parametric Forecast";

export type RegionId = "JEZERO_CRATER" | "GALE_MOUNT_SHARP";

export type LandmarkId =
  | "JEZERO_CRATER"
  | "GALE_MOUNT_SHARP"
  | "OLYMPUS_MONS"
  | "VALLES_MARINERIS"
  | "HELLAS_PLANITIA"
  | "MARS_PATHFINDER_ARES"
  | "VIKING_1"
  | "INSIGHT_ELYSIUM"
  | "SPIRIT_GUSEV"
  | "OPPORTUNITY_MERIDIANI";

export interface NasaProvenanceBadge {
  mission: string;
  instrument: string;
  product_id: string;
  observation_date: string;
  spatial_resolution: string;
  coverage: string;
  uncertainty: string;
  temporal_class: TemporalClass;
  pds_url: string;
}

export interface CartographicLayerDef {
  id: string;
  code: string;
  category: "SCIENTIFIC" | "SAFETY_EVA";
  name: string;
  name_es: string;
  description: string;
  defaultVisible: boolean;
  defaultOpacity: number;
  color: string;
  globeTextureKey?: "viking" | "mola_color" | "mola_dem" | "thermal" | "geology" | "coverage";
  qgisLayerName: string;
  provenance: NasaProvenanceBadge;
}

export interface ScientificTargetDef {
  target_id: string;
  region_id: RegionId;
  name: string;
  title_es: string;
  coordinates: { latitude: number; longitude: number; elevation_m: number };
  grid_pos: { x: number; y: number };
  rover_mission: string;
  challenge_mandate_quote?: string;
  scientific_summary_es: string;
  key_findings: string[];
  sampling_checklist: string[];
  soi_base: { M: number; G: number; T: number; Q: number };
  pds_evidence: Array<{
    source_type: "Orbital" | "Surface" | "Subsurface";
    mission: string;
    instrument: string;
    product_id: string;
    resolution: string;
    date: string;
    finding: string;
  }>;
  surface_photos: Array<{
    id: string;
    title: string;
    instrument: string;
    sol_or_date: string;
    product_id: string;
    georef_status: "EXACT_GEOREF" | "CONTEXTUAL_ROVER_FRAME";
    caption: string;
    orbital_crop_url: string;
    surface_visual_mode: "BOXWORK_PANORAMA" | "BOXWORK_NODULES" | "CHEYAVA_VEINS" | "LEOPARD_SPOTS" | "MARGIN_SHORELINE" | "RIMFAX_SUBSURFACE";
    nasa_gallery_url: string;
  }>;
  pre_eva_weather_default: {
    sensor_source: string;
    pressure_pa: number;
    pressure_drop_3h_pa: number;
    optical_depth_tau: number;
    solar_longitude_ls_deg: number;
    wind_gust_ms: number;
    delta_t_surf_air_k: number;
  };
  radiation_reference: {
    sensor_note: string;
    surface_dose_rate_usv_h: number;
    gcr_baseline_ugy_day: number;
  };
}

export interface GlobalMarsLandmark {
  id: string;
  name: string;
  category: "ACTIVE_REGION" | "LANDMARK" | "HISTORIC_MISSION";
  lat: number;
  lon: number;
  elevation_m: number;
  region_id?: RegionId;
  target_id?: string;
  coverage_class: "HIGH_RES_PDS" | "CTX_STRIPS" | "MOLA_GLOBAL_ONLY";
  resolution_summary: string;
  summary: string;
  terrain_feature_es?: string;
  first_person_desc_es?: string;
  base_grid_pos?: [number, number];
  target_grid_pos?: [number, number];
  local_relief_span_m?: number;
}

export interface OrbitalCoverageFootprint {
  id: string;
  name: string;
  instrument: string;
  resolution: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  color: string;
  uncertainty: number;
}

/**
 * 20 INTEGRATED CARTOGRAPHIC LAYERS (7 Scientific + 13 Environmental, Terrain & EVA Safety)
 * Exactly matching Section 6 of MARS PATHFINDER Master Specification.
 */
export const TWENTY_MARS_LAYERS: CartographicLayerDef[] = [
  // 7 SCIENTIFIC LAYERS
  {
    id: "OPTICAL",
    code: "A",
    category: "SCIENTIFIC",
    name: "Optical Imaging Layer",
    name_es: "Imagen Óptica Orbital y Rover (Viking / CTX / HiRISE)",
    description:
      "Mosaico global NASA Viking MDIM 2.1 (232 m/px), CTX contextual (6 m/px) e imágenes HiRISE de alta resolución (0.25 m/px) acopladas a panoramas Mastcam/Mastcam-Z.",
    defaultVisible: true,
    defaultOpacity: 100,
    color: "#E87D4B",
    globeTextureKey: "viking",
    qgisLayerName: "NASA Mars Trek — Viking MDIM21 Global Color Mosaic (232m)",
    provenance: {
      mission: "MRO / Viking Orbiter / Mars 2020 / MSL",
      instrument: "HiRISE, CTX & Viking VIS",
      product_id: "ESP_065842_1985 / PSP_009149_1750 / MDIM21_232m",
      observation_date: "1976–2025 (Multi-epoch)",
      spatial_resolution: "0.25 m/px (HiRISE) · 6 m/px (CTX) · 232 m/px (Global)",
      coverage: "100% Global (232m) · Local HiRISE Strips en Jezero y Gale",
      uncertainty: "±0.25 m local; micro-rocas <15 cm no resueltas",
      temporal_class: "Static / Relatively Stable",
      pds_url: "https://www.uahirise.org/",
    },
  },
  {
    id: "TOPOGRAPHY",
    code: "B",
    category: "SCIENTIFIC",
    name: "Topographic Layer (DEM & MOLA)",
    name_es: "Topografía y Elevación DEM (MOLA / HiRISE Stereo)",
    description:
      "Elevación global MOLA (-8,200 m a +21,229 m), relieve sombreado GDAL y modelos digitales estereoscópicos HiRISE (1 m/px) con curvas de nivel cada 25 m procesadas en QGIS.",
    defaultVisible: true,
    defaultOpacity: 65,
    color: "#38BDF8",
    globeTextureKey: "mola_color",
    qgisLayerName: "Mars Global MOLA DEM + Regional DEM (GDAL)",
    provenance: {
      mission: "Mars Global Surveyor (MGS) / MRO / Mars Express",
      instrument: "MOLA Laser Altimeter & HiRISE Stereo DTM",
      product_id: "DTEEC_045994_1985 / DTEEC_009149_1750 / MOLA_463m",
      observation_date: "1999–2024",
      spatial_resolution: "1.0 m/px (HiRISE DTM) · 463 m/px (MOLA Global)",
      coverage: "100% Global MOLA · 25 m/px Grilla Operacional QGIS",
      uncertainty: "±1.0 m vertical (HiRISE) · ±10 m (MOLA global)",
      temporal_class: "Static / Relatively Stable",
      pds_url: "https://ode.rsl.wustl.edu/mars/",
    },
  },
  {
    id: "SPECTRAL",
    code: "C",
    category: "SCIENTIFIC",
    name: "Spectral & Mineralogical Layer",
    name_es: "Espectroscopía y Mineralogía (CRISM)",
    description:
      "Firmas orbitales de carbonatos de Mg/Fe y olivino en la Margin Unit de Jezero, filosilicatos en Bright Angel y sulfatos hidratados en las retículas del Monte Sharp.",
    defaultVisible: false,
    defaultOpacity: 70,
    color: "#A855F7",
    qgisLayerName: "CRISM Mineralogical Signatures (Carbonates/Sulfates/Phyllosilicates)",
    provenance: {
      mission: "Mars Reconnaissance Orbiter (MRO)",
      instrument: "CRISM (Compact Reconnaissance Imaging Spectrometer)",
      product_id: "FRT000047A3 / HRL000040FF / FRT0000B6F1",
      observation_date: "2007–2022",
      spatial_resolution: "18 m/px (Targeted FRT) · 36 m/px (HRL)",
      coverage: "Targeted regional strips over Jezero & Gale",
      uncertainty: "Mezcla espectral sub-píxel; cobertura de polvo atenúa bandas",
      temporal_class: "Static / Relatively Stable",
      pds_url: "https://pds-geosciences.wustl.edu/missions/mro/crism.htm",
    },
  },
  {
    id: "THERMAL",
    code: "D",
    category: "SCIENTIFIC",
    name: "Thermal Inertia Layer (THEMIS)",
    name_es: "Inercia Térmica e Infrarrojo (THEMIS)",
    description:
      "Distingue roca madre consolidada (alta inercia térmica) de arena suelta y polvo fino (baja inercia térmica), clave para evitar trampas de arena entre crestas boxwork.",
    defaultVisible: false,
    defaultOpacity: 60,
    color: "#F97316",
    globeTextureKey: "thermal",
    qgisLayerName: "Mars Odyssey THEMIS Thermal Inertia & Sand Hollow Mask",
    provenance: {
      mission: "2001 Mars Odyssey",
      instrument: "THEMIS (Thermal Emission Imaging System)",
      product_id: "I01045002 / THEMIS_TI_GLOBAL_100M",
      observation_date: "2002–2024",
      spatial_resolution: "100 m/px (Global IR Mosaic)",
      coverage: "Near-Global (±87° latitud)",
      uncertainty: "±35 J·m⁻²·K⁻¹·s⁻¹/²; mezcla térmica sub-100 m",
      temporal_class: "Historical Observation",
      pds_url: "https://trek.nasa.gov/mars/",
    },
  },
  {
    id: "GEOLOGICAL",
    code: "E",
    category: "SCIENTIFIC",
    name: "Geological Units Layer",
    name_es: "Unidades Geológicas y Fracturas Boxwork",
    description:
      "Unidades estratigráficas globales (Noachiano/Hesperiano/Amazoniano) y locales: frente deltaico, canales fluviales (Neretva Vallis) y redes poligonales boxwork en Monte Sharp.",
    defaultVisible: false,
    defaultOpacity: 55,
    color: "#EC4899",
    globeTextureKey: "geology",
    qgisLayerName: "USGS/NASA Mars Geological Units & Boxwork Polygon Network",
    provenance: {
      mission: "USGS Astrogeology / NASA MRO",
      instrument: "SIM 3292 Global Map + HiRISE Photogeology",
      product_id: "USGS_SIM3292_2014 / JEZERO_GEO_MAP_2023",
      observation_date: "2014–2025",
      spatial_resolution: "1:20M Global · 1:5,000 Regional",
      coverage: "100% Global + Cartografía detallada de Jezero y Gale",
      uncertainty: "Contactos geológicos cubiertos por regolito eólico",
      temporal_class: "Static / Relatively Stable",
      pds_url: "https://pubs.usgs.gov/sim/3292/",
    },
  },
  {
    id: "SUBSURFACE",
    code: "F",
    category: "SCIENTIFIC",
    name: "Subsurface & Geophysical Layer",
    name_es: "Radar Subsuperficial RIMFAX y Neutrones DAN",
    description:
      "Perfiles de radar de penetración terrestre RIMFAX a lo largo del ascenso por la Margin Unit de Jezero e hidratación subsuperficial DAN en la ruta de Curiosity en Gale.",
    defaultVisible: false,
    defaultOpacity: 75,
    color: "#14B8A6",
    qgisLayerName: "RIMFAX Ground Penetrating Radar & DAN Subsurface Traverse",
    provenance: {
      mission: "Mars 2020 (Perseverance) & MSL (Curiosity)",
      instrument: "RIMFAX GPR & DAN Active Neutron Spectrometer",
      product_id: "RIMFAX_L2_PERSEVERANCE_MARGIN / MSL_DAN_SOL4500",
      observation_date: "2012–2026",
      spatial_resolution: "10 cm vertical (RIMFAX hasta 15 m profundidad)",
      coverage: "Restringido a las trazas reales recorridas por los rovers",
      uncertainty: "Interpretación dieléctrica requiere calibración de densidad",
      temporal_class: "Historical Observation",
      pds_url: "https://pds-geosciences.wustl.edu/missions/mars2020/",
    },
  },
  {
    id: "CHEMICAL",
    code: "G",
    category: "SCIENTIFIC",
    name: "Chemical & Astrobiological Layer",
    name_es: "Observaciones Químicas y Astrobiológicas (PIXL/SHERLOC/ChemCam)",
    description:
      "Puntos vectoriales con análisis elementales y moleculares in situ: vivianita/greigita y orgánicos en Cheyava Falls (Sol 1215) y nódulos evaporíticos en Monte Sharp (2025).",
    defaultVisible: true,
    defaultOpacity: 95,
    color: "#FACC15",
    qgisLayerName: "NASA 3 Scientific Targets (2024-2026)",
    provenance: {
      mission: "Mars 2020 & Mars Science Laboratory",
      instrument: "PIXL, SHERLOC/WATSON, SuperCam, ChemCam, APXS",
      product_id: "SOL_1215_CHEYAVA_FALLS / MSL_2025_MOUNT_SHARP_BOXWORK",
      observation_date: "Julio 2024 – Septiembre 2025",
      spatial_resolution: "100 μm – 1 mm puntual in situ",
      coverage: "Muestreo puntual georreferenciado sobre afloramientos clave",
      uncertainty: "No confirma vida por sí sola; requiere retorno de muestras",
      temporal_class: "Historical Observation",
      pds_url: "https://pds-geosciences.wustl.edu/missions/msl/",
    },
  },

  // 13 ENVIRONMENTAL, TOPOGRAPHIC & EVA SAFETY LAYERS
  {
    id: "ATMOSPHERE",
    code: "1",
    category: "SAFETY_EVA",
    name: "Atmosphere (MEDA / REMS)",
    name_es: "Atmósfera Histórica (MEDA Jezero / REMS Gale)",
    description:
      "Series reales de presión superficial (~720–780 Pa), temperatura (-75 °C a -5 °C), viento y opacidad de polvo τ como contexto climatológico de la misión.",
    defaultVisible: false,
    defaultOpacity: 50,
    color: "#60A5FA",
    qgisLayerName: "MEDA & REMS Atmospheric Context Grid",
    provenance: {
      mission: "Mars 2020 (MEDA) & MSL (REMS)",
      instrument: "MEDA & REMS Environmental Stations",
      product_id: "MEDA_CALIBRATED_JZR / REMS_MODR_GALE",
      observation_date: "2012–2025",
      spatial_resolution: "Estación puntual representativa de cuenca local",
      coverage: "Cráter Jezero (MEDA) y Cráter Gale (REMS)",
      uncertainty: "Observación histórica; no es sensor meteorológico en vivo",
      temporal_class: "Historical Observation",
      pds_url: "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/mars2020.html",
    },
  },
  {
    id: "DUST_RISK",
    code: "2",
    category: "SAFETY_EVA",
    name: "Dust Storm & Weather Risk",
    name_es: "Riesgo Pre-EVA de Tormentas de Polvo y Dust Devils",
    description:
      "Mapa de probabilidad paramétrica (0–100%) de tormentas de polvo y vórtices convectivos en base a ΔP, τ, Ls y viento para emitir semáforo GO/CAUTION/NO-GO.",
    defaultVisible: false,
    defaultOpacity: 55,
    color: "#F59E0B",
    qgisLayerName: "Pre-EVA Dust Storm & Convective Vortex Risk Layer",
    provenance: {
      mission: "MARS PATHFINDER CORE / MEDA & REMS Climatology",
      instrument: "Modelo Predictivo Paramétrico Pre-EVA",
      product_id: "CORE_PRE_EVA_DUST_MODEL_V1",
      observation_date: "Simulación operativa en tiempo real",
      spatial_resolution: "Escala regional (cuenca de cráter)",
      coverage: "100% área operativa EVA",
      uncertainty: "Modelo paramétrico; no sustituye GCM atmosférico global",
      temporal_class: "Modelled / Parametric Forecast",
      pds_url: "https://pds-atmospheres.nmsu.edu/",
    },
  },
  {
    id: "RADIATION",
    code: "3",
    category: "SAFETY_EVA",
    name: "Radiation (RAD Surface Ref)",
    name_es: "Radiación Superficial Histórica (Curiosity RAD)",
    description:
      "Referencia de dosis en superficie (~210–250 μGy/día GCR) medida por Curiosity RAD en el Cráter Gale; etiquetada estrictamente como referencia histórica cuando se visualiza Jezero.",
    defaultVisible: false,
    defaultOpacity: 55,
    color: "#A3E635",
    qgisLayerName: "Curiosity RAD Surface Radiation Reference",
    provenance: {
      mission: "Mars Science Laboratory (Curiosity)",
      instrument: "RAD (Radiation Assessment Detector)",
      product_id: "MSL_RAD_SURFACE_RDR_GALE",
      observation_date: "2012–2025",
      spatial_resolution: "Puntual en Gale (extrapolada con ajuste topográfico)",
      coverage: "Medida directa en Cráter Gale; referencia física en Jezero",
      uncertainty: "Varía ±18% con ciclo solar y apantallamiento de paredes",
      temporal_class: "Historical Observation",
      pds_url: "https://pds-ppi.igpp.ucla.edu/",
    },
  },
  {
    id: "SOLAR_DONKI",
    code: "4",
    category: "SAFETY_EVA",
    name: "Solar & Space Weather (DONKI)",
    name_es: "Clima Espacial y Eventos Solares (NASA DONKI)",
    description:
      "Contexto de eyecciones de masa coronal (CME) y eventos de partículas energéticas solares (SEP) que multiplican la dosis aguda durante una EVA.",
    defaultVisible: false,
    defaultOpacity: 45,
    color: "#FBBF24",
    qgisLayerName: "NASA CCMC DONKI Space Weather Context",
    provenance: {
      mission: "NASA Community Coordinated Modeling Center",
      instrument: "DONKI (SEP / CME Event Catalog)",
      product_id: "CCMC_DONKI_SEP_MARS_CONTEXT",
      observation_date: "Archivo histórico y alertas simuladas",
      spatial_resolution: "Planetario (helioesférico en órbita marciana)",
      coverage: "Global Marte",
      uncertainty: "Requiere corrección de ángulo Tierra-Sol-Marte",
      temporal_class: "Modelled / Parametric Forecast",
      pds_url: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
    },
  },
  {
    id: "SLOPE",
    code: "5",
    category: "SAFETY_EVA",
    name: "Slope (S°)",
    name_es: "Pendiente del Terreno S (°) [GDAL / QGIS]",
    description:
      "Gradiente local en grados calculado con gdaldem slope sobre Marte (R=3,396,190 m). Excluye automáticamente celdas con pendiente superior al límite del traje espacial.",
    defaultVisible: false,
    defaultOpacity: 70,
    color: "#EF4444",
    qgisLayerName: "Jezero/Gale Slope (deg) - GDAL 3.13",
    provenance: {
      mission: "QGIS 3.44.15 + GDAL 3.13.3 Processing",
      instrument: "gdaldem slope sobre DEM regional",
      product_id: "QGIS_GDALDEM_SLOPE_DEG",
      observation_date: "Procesado localmente en QGIS",
      spatial_resolution: "Grilla métrica local (~115 m celda operativa)",
      coverage: "100% Jezero y Monte Sharp",
      uncertainty: "Suaviza micro-escarpes < celda operacional",
      temporal_class: "Derived Product",
      pds_url: "https://ode.rsl.wustl.edu/mars/",
    },
  },
  {
    id: "ROUGHNESS",
    code: "6",
    category: "SAFETY_EVA",
    name: "Roughness (R)",
    name_es: "Rugosidad Topográfica 3×3 (GDAL)",
    description:
      "Desviación estándar local del relieve en ventana 3×3 procesada con gdaldem roughness para detectar terreno abrupto que aumenta la fatiga y el consumo de O₂.",
    defaultVisible: false,
    defaultOpacity: 65,
    color: "#FB7185",
    qgisLayerName: "Jezero/Gale Roughness (3x3) - GDAL 3.13",
    provenance: {
      mission: "QGIS 3.44.15 + GDAL 3.13.3 Processing",
      instrument: "gdaldem roughness",
      product_id: "QGIS_GDALDEM_ROUGHNESS_3X3",
      observation_date: "Procesado localmente en QGIS",
      spatial_resolution: "Ventana 3×3 sobre DEM",
      coverage: "100% Jezero y Monte Sharp",
      uncertainty: "Sensible a resolución nativa del DEM de entrada",
      temporal_class: "Derived Product",
      pds_url: "https://ode.rsl.wustl.edu/mars/",
    },
  },
  {
    id: "BOULDERS_SAND",
    code: "7",
    category: "SAFETY_EVA",
    name: "Boulders & Sand Hollows (O)",
    name_es: "Bloques Rocosos y Depresiones de Arena Boxwork",
    description:
      "Cartografía de trampas de arena suelta entre crestas boxwork (Monte Sharp) y campos de bloques en el cauce de Neretva Vallis.",
    defaultVisible: false,
    defaultOpacity: 75,
    color: "#D97706",
    qgisLayerName: "Sand Hollows & Boulder Obstacles Mask",
    provenance: {
      mission: "MRO HiRISE + Mars Odyssey THEMIS",
      instrument: "Detección de arena suelta y obstáculos",
      product_id: "HIRISE_THEMIS_SAND_TRAPS",
      observation_date: "2023–2025",
      spatial_resolution: "0.25–100 m/px compuesto",
      coverage: "100% corredores EVA Jezero y Gale",
      uncertainty: "Rocas aisladas <25 cm pueden permanecer ocultas",
      temporal_class: "Derived Product",
      pds_url: "https://www.uahirise.org/",
    },
  },
  {
    id: "SLIP_HAZARD",
    code: "8",
    category: "SAFETY_EVA",
    name: "Slip & Suit Puncture Hazard",
    name_es: "Riesgo Geomecánico de Deslizamiento y Punción",
    description:
      "Índice H_slip ∈ [0,1] que cruza pendiente, rugosidad y arena suelta/rocas angulosas para prevenir caídas o daños en el traje presurizado.",
    defaultVisible: false,
    defaultOpacity: 70,
    color: "#DC2626",
    qgisLayerName: "Geomechanical Slip & Puncture Hazard Index",
    provenance: {
      mission: "MARS PATHFINDER CORE",
      instrument: "Geomechanical Hazard Model (S, R, THEMIS)",
      product_id: "CORE_H_SLIP_INDEX",
      observation_date: "Calculado dinámicamente",
      spatial_resolution: "Sincronizado al límite S_max configurado",
      coverage: "100% Jezero y Monte Sharp",
      uncertainty: "Paramétrico; no mide cohesión geotécnica directa",
      temporal_class: "Derived Product",
      pds_url: "https://pds.nasa.gov/",
    },
  },
  {
    id: "O2_COST",
    code: "9",
    category: "SAFETY_EVA",
    name: "O₂ Metabolic Cost Heatmap",
    name_es: "Mapa de Calor de Consumo Metabólico de O₂ (L/m)",
    description:
      "Estima el gasto de oxígeno por celda bajo gravedad marciana (3.721 m/s²) considerando masa total, pendiente y hundimiento en arena (η hasta 1.6).",
    defaultVisible: false,
    defaultOpacity: 65,
    color: "#22D3EE",
    qgisLayerName: "PLSS Metabolic O2 Cost Surface",
    provenance: {
      mission: "MARS PATHFINDER CORE (PLSS Engine)",
      instrument: "Modelo Biomecánico EVA (g = 3.721 m/s²)",
      product_id: "PLSS_METABOLIC_O2_GRID",
      observation_date: "Calculado en tiempo real según configuración del traje",
      spatial_resolution: "Por celda de enrutamiento A*",
      coverage: "100% Jezero y Monte Sharp",
      uncertainty: "Estimador de planificación; no telemetría médica certificada",
      temporal_class: "Modelled / Parametric Forecast",
      pds_url: "https://pds.nasa.gov/",
    },
  },
  {
    id: "BINGO_O2",
    code: "10",
    category: "SAFETY_EVA",
    name: "Bingo O₂ Safe Walk-Back Zone",
    name_es: "Zona Segura de Retorno Bingo O₂ (+20% Reserva)",
    description:
      "Muestra el alcance máximo seguro alrededor de la Base desde donde el astronauta puede regresar conservando intacta la reserva obligatoria del 20% de oxígeno.",
    defaultVisible: true,
    defaultOpacity: 65,
    color: "#10B981",
    qgisLayerName: "Bingo O2 Safe Walk-Back Perimeter",
    provenance: {
      mission: "MARS PATHFINDER CORE (PLSS Safety)",
      instrument: "Algoritmo Bingo O₂ Walk-Back",
      product_id: "PLSS_BINGO_O2_CONTOUR",
      observation_date: "Calculado en tiempo real",
      spatial_resolution: "Dependiente de carga y S_max",
      coverage: "100% área de excursión",
      uncertainty: "Asume velocidad nominal degradada por pendiente",
      temporal_class: "Derived Product",
      pds_url: "https://pds.nasa.gov/",
    },
  },
  {
    id: "SHELTERS",
    code: "11",
    category: "SAFETY_EVA",
    name: "Topographic Radiation Shelters",
    name_es: "Refugios Topográficos contra Radiación y Viento",
    description:
      "Identifica paredes de cañón y escarpes pronunciados en el DEM que bloquean geométricamente >40% del horizonte ante tormentas o eventos solares.",
    defaultVisible: true,
    defaultOpacity: 90,
    color: "#34D399",
    qgisLayerName: "Topographic Radiation Shelters",
    provenance: {
      mission: "QGIS DEM Geometric Horizon Shielding",
      instrument: "Análisis de apantallamiento de relieve",
      product_id: "CORE_TOPO_SHELTERS_DEM",
      observation_date: "Derivado del DEM regional",
      spatial_resolution: "Por celda topográfica",
      coverage: "100% Jezero y Monte Sharp",
      uncertainty: "Mitigación parcial (geometría sólida); no sustituye hábitat blindado",
      temporal_class: "Derived Product",
      pds_url: "https://ode.rsl.wustl.edu/mars/",
    },
  },
  {
    id: "COMM_LOS",
    code: "12",
    category: "SAFETY_EVA",
    name: "Comm Line-of-Sight (LoS)",
    name_es: "Línea de Vista de Radio y Sombra (GDAL Viewshed)",
    description:
      "Cuenca visual calculada con gdal_viewshed desde la antena de la Base (+12 m). Las zonas bloqueadas (ej. Neretva Vallis) se marcan COMM_BLACKOUT y activan caché offline.",
    defaultVisible: true,
    defaultOpacity: 60,
    color: "#00F0FF",
    qgisLayerName: "Jezero/Gale Comm Line-of-Sight Viewshed (GDAL)",
    provenance: {
      mission: "QGIS 3.44.15 + GDAL gdal_viewshed",
      instrument: "Raycasting topográfico LoS (12 m mástil Base)",
      product_id: "GDAL_VIEWSHED_COMM_LOS",
      observation_date: "Procesado localmente en QGIS",
      spatial_resolution: "100% grilla DEM",
      coverage: "Jezero (Neretva Vallis) y Gale (Monte Sharp)",
      uncertainty: "No modela rebotes multitrayecto RF en laderas",
      temporal_class: "Derived Product",
      pds_url: "https://pds.nasa.gov/",
    },
  },
  {
    id: "UNCERTAINTY",
    code: "13",
    category: "SAFETY_EVA",
    name: "Data Coverage & Uncertainty (U)",
    name_es: "Cobertura de Datos e Incertidumbre Cartográfica (U)",
    description:
      "Distingue zonas cubiertas por HiRISE de alta resolución (0.25–1 m) frente a zonas con solo cobertura global MOLA (463 m) donde los microobstáculos son desconocidos.",
    defaultVisible: false,
    defaultOpacity: 60,
    color: "#818CF8",
    globeTextureKey: "coverage",
    qgisLayerName: "Data Coverage & Resampling Uncertainty Mask",
    provenance: {
      mission: "MARS PATHFINDER CORE / PDS Metadata Audit",
      instrument: "Auditoría de resolución nativa (HiRISE vs MOLA)",
      product_id: "CORE_DATA_UNCERTAINTY_U",
      observation_date: "2026",
      spatial_resolution: "Multi-escala (0.25 m vs 463 m)",
      coverage: "100% Global y Regional",
      uncertainty: "Celdas con U > 0.6 se marcan INSUFFICIENT_DATA",
      temporal_class: "Derived Product",
      pds_url: "https://pds.nasa.gov/",
    },
  },
];

/**
 * 3 REAL NASA SCIENTIFIC TARGETS (Section 5 of Master Specification + claude.md)
 */
export const SCIENTIFIC_TARGETS: ScientificTargetDef[] = [
  {
    target_id: "GALE-BOXWORK-2025",
    region_id: "GALE_MOUNT_SHARP",
    name: "Mount Sharp Boxwork Formations (2025 Curiosity Study Area)",
    title_es: "Formaciones de Retículas (Boxwork) en el Monte Sharp (Curiosity 2025)",
    coordinates: { latitude: -4.682, longitude: 137.405, elevation_m: -3850 },
    grid_pos: { x: 45, y: 46 },
    rover_mission: "MSL Curiosity (2025) + MRO HiRISE / CRISM",
    challenge_mandate_quote:
      "aprender más sobre las formaciones de retículas, un fenómeno geológico que el rover Curiosity estudió en 2025, deberías seleccionar una ubicación donde estas formaciones sean abundantes, como la región del Monte Sharp, donde Curiosity las observó.",
    scientific_summary_es:
      "Extensa red de crestas minerales poligonales que se intersectan (similares a gigantescas telarañas desde órbita) en las laderas del Monte Sharp. Se formaron cuando agua subterránea rica en minerales circuló por fracturas durante la desecación de Marte, cementando las grietas con minerales resistentes mientras el viento erosionaba la roca más blanda dejando depresiones arenosas huecas entre crestas y nódulos del tamaño de un guisante observados por Curiosity en agosto–septiembre de 2025.",
    key_findings: [
      "Panoramas Mastcam (21 ago y 26 sep 2025) y macro MAHLI confirman crestas cementadas por sulfatos y sílice.",
      "Nódulos minerales del tamaño de un guisante (pea-sized nodules) en paredes exteriores de las crestas y depresiones huecas revelan múltiples episodios tardíos de agua subterránea.",
      "Riesgo EVA crítico: las depresiones arenosas disparan el gasto de O₂ en >40% por metro avanzado; la Ruta B rodea por crestas consolidadas ahorrando ~28% de O₂.",
    ],
    sampling_checklist: [
      "Documentar contacto entre cresta cementada y pared exterior con nódulos evaporíticos.",
      "Tomar lectura LIBS/espectrómetro portátil sobre venas sulfatadas (referencia ChemCam/APXS).",
      "Evitar pisar las depresiones centrales de arena suelta (baja inercia térmica THEMIS).",
      "Verificar margen Bingo O₂ antes de ascender hacia el escarpe sur.",
    ],
    soi_base: { M: 0.91, G: 0.97, T: 1.0, Q: 0.89 },
    pds_evidence: [
      {
        source_type: "Surface",
        mission: "MSL Curiosity",
        instrument: "Mastcam & MAHLI",
        product_id: "MSL_2025_MOUNT_SHARP_BOXWORK",
        resolution: "Sub-mm macro / Panorámico",
        date: "2025-08-21 / 2025-09-26",
        finding: "Crestas poligonales cementadas y nódulos minerales del tamaño de un guisante en paredes externas.",
      },
      {
        source_type: "Surface",
        mission: "MSL Curiosity",
        instrument: "ChemCam & APXS",
        product_id: "APXS_2025_RIDGE_CEMENT",
        resolution: "Punto láser / 1.7 cm",
        date: "2025-08",
        finding: "Enriquecimiento en sulfatos de Mg/Ca y sílice que resistieron la erosión eólica.",
      },
      {
        source_type: "Orbital",
        mission: "MRO",
        instrument: "HiRISE & CRISM",
        product_id: "PSP_009149_1750 / FRT0000B6F1",
        resolution: "0.25 m/px (HiRISE) · 18 m/px (CRISM)",
        date: "2008–2024",
        finding: "Patrón reticular kilométrico tipo telaraña en la unidad portadora de sulfatos.",
      },
    ],
    surface_photos: [
      {
        id: "gale-boxwork-pan",
        title: "Panorama Retículas Boxwork — Monte Sharp",
        instrument: "MSL Mastcam (Mosaico Superficie)",
        sol_or_date: "26 de septiembre de 2025",
        product_id: "MSL_2025_MOUNT_SHARP_BOXWORK",
        georef_status: "EXACT_GEOREF",
        caption: "Crestas poligonales entrecruzadas elevándose sobre depresiones arenosas en la ladera del Monte Sharp.",
        orbital_crop_url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/5/16/56.jpg",
        surface_visual_mode: "BOXWORK_PANORAMA",
        nasa_gallery_url: "https://science.nasa.gov/mission/msl-curiosity/",
      },
      {
        id: "gale-nodules-mahli",
        title: "Macro Nódulos Minerales ('Pea-sized Nodules')",
        instrument: "MSL MAHLI",
        sol_or_date: "Agosto de 2025",
        product_id: "MSL_MAHLI_2025_BOXWORK_NODULES",
        georef_status: "CONTEXTUAL_ROVER_FRAME",
        caption: "Nódulos esféricos milimétricos hallados fuera de la fractura central, evidenciando un nivel freático elevado tardío.",
        orbital_crop_url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/5/16/56.jpg",
        surface_visual_mode: "BOXWORK_NODULES",
        nasa_gallery_url: "https://mars.nasa.gov/msl/multimedia/images/",
      },
    ],
    pre_eva_weather_default: {
      sensor_source: "MSL REMS Historical Reference (Gale Crater)",
      pressure_pa: 742,
      pressure_drop_3h_pa: -4.2,
      optical_depth_tau: 0.65,
      solar_longitude_ls_deg: 142,
      wind_gust_ms: 11.4,
      delta_t_surf_air_k: 22.0,
    },
    radiation_reference: {
      sensor_note: "Medición directa histórica en superficie de MSL RAD (Cráter Gale)",
      surface_dose_rate_usv_h: 9.2,
      gcr_baseline_ugy_day: 221,
    },
  },
  {
    target_id: "JEZERO-CHEYAVA-2024",
    region_id: "JEZERO_CRATER",
    name: "Cheyava Falls Outcrop - Bright Angel (Neretva Vallis)",
    title_es: "Afloramiento Cheyava Falls — Bright Angel (Biofirmas Potenciales)",
    coordinates: { latitude: 18.444, longitude: 77.303, elevation_m: -2495 },
    grid_pos: { x: 21, y: 40 },
    rover_mission: "Mars 2020 Perseverance (Sol 1215, 2024) + MRO",
    scientific_summary_es:
      "Lutita sedimentaria con forma de punta de flecha estudiada por Perseverance en julio de 2024 (Sol 1215) dentro del antiguo canal fluvial Neretva Vallis. Exhibe vetas blancas de sulfato de calcio precipitadas por agua líquida, compuestos orgánicos detectados por SHERLOC y 'manchas de leopardo' milimétricas ricas en hierro y fosfato (vivianita/greigita) identificadas por PIXL.",
    key_findings: [
      "Frentes de reacción redox (vivianita y greigita) asociados a carbono orgánico en sedimentos lacustres antiguos.",
      "Encajonado en Neretva Vallis: genera Zona de Sombra de Radio (COMM_BLACKOUT) que activa el Field Log Offline.",
      "Las paredes norte del cañón proveen un Refugio Topográfico Natural con 65% de apantallamiento geométrico.",
    ],
    sampling_checklist: [
      "Inspeccionar las 'manchas de leopardo' de halo oscuro y núcleo blanquecino (muestra #25 Sapphire Canyon).",
      "Registrar espectro Raman portátil sobre las vetas blancas de sulfato de calcio.",
      "Confirmar activación de buffer OFFLINE_LOCAL_CACHE dentro del cañón Neretva Vallis.",
      "Validar posición del Rover Scout en el borde del cañón si se requiere enlace repetidor.",
    ],
    soi_base: { M: 0.96, G: 0.95, T: 0.98, Q: 0.94 },
    pds_evidence: [
      {
        source_type: "Surface",
        mission: "Mars 2020 Perseverance",
        instrument: "PIXL & SHERLOC/WATSON",
        product_id: "SOL_1215_CHEYAVA_FALLS",
        resolution: "120 μm (PIXL) · 10 μm (WATSON)",
        date: "2024-07-21 (Sol 1215)",
        finding: "Orgánicos detectados por SHERLOC y manchas redox con hierro/fosfato (vivianita) y sulfuro (greigita) por PIXL.",
      },
      {
        source_type: "Surface",
        mission: "Mars 2020 Perseverance",
        instrument: "Mastcam-Z",
        product_id: "ZCAM_SOL1215",
        resolution: "mm-scale",
        date: "2024-07",
        finding: "Roca lutita rojiza atravesada por vetas paralelas de sulfato de calcio e inclusiones milimétricas.",
      },
      {
        source_type: "Orbital",
        mission: "MRO",
        instrument: "HiRISE & CRISM",
        product_id: "ESP_065842_1985 / FRT000047A3",
        resolution: "0.25 m/px · 18 m/px",
        date: "2020–2024",
        finding: "Unidad estratificada Bright Angel de tono claro expuesta en el cauce de Neretva Vallis.",
      },
    ],
    surface_photos: [
      {
        id: "jezero-leopard-spots",
        title: "Manchas de Leopardo — WATSON / SHERLOC (Sol 1215)",
        instrument: "Mars 2020 WATSON & PIXL",
        sol_or_date: "Sol 1215 · Julio 2024",
        product_id: "SOL_1215_CHEYAVA_FALLS",
        georef_status: "EXACT_GEOREF",
        caption: "Anillos oscuros milimétricos ricos en hierro y fosfato (vivianita/greigita) sobre matriz rojiza con sulfato de calcio.",
        orbital_crop_url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/5/12/45.jpg",
        surface_visual_mode: "LEOPARD_SPOTS",
        nasa_gallery_url: "https://science.nasa.gov/mission/mars-2020-perseverance/",
      },
      {
        id: "jezero-cheyava-veins",
        title: "Afloramiento Cheyava Falls y Vetas de Sulfato",
        instrument: "Mars 2020 Mastcam-Z",
        sol_or_date: "Sol 1215 · Julio 2024",
        product_id: "ZCAM_SOL1215",
        georef_status: "CONTEXTUAL_ROVER_FRAME",
        caption: "Roca punta de flecha (~1 m × 0.6 m) en Bright Angel con vetas blancas hidratadas.",
        orbital_crop_url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/5/12/45.jpg",
        surface_visual_mode: "CHEYAVA_VEINS",
        nasa_gallery_url: "https://mars.nasa.gov/mars2020/multimedia/raw-images/",
      },
    ],
    pre_eva_weather_default: {
      sensor_source: "Mars 2020 MEDA Historical Reference (Jezero Crater)",
      pressure_pa: 768,
      pressure_drop_3h_pa: -9.8,
      optical_depth_tau: 0.92,
      solar_longitude_ls_deg: 215,
      wind_gust_ms: 18.2,
      delta_t_surf_air_k: 31.0,
    },
    radiation_reference: {
      sensor_note: "Referencia histórica RAD (Gale) ajustada por geometría de cañón en Jezero (sin sensor RAD directo en Jezero)",
      surface_dose_rate_usv_h: 8.8,
      gcr_baseline_ugy_day: 212,
    },
  },
  {
    target_id: "JEZERO-MARGIN-CARB",
    region_id: "JEZERO_CRATER",
    name: "Jezero Western Margin Carbonate Unit (Ancient Lakeshore)",
    title_es: "Unidad Marginal de Carbonatos y Paleo-Costa Lacustre",
    coordinates: { latitude: 18.418, longitude: 77.358, elevation_m: -2380 },
    grid_pos: { x: 47, y: 28 },
    rover_mission: "Mars 2020 Perseverance (2023–2026) + CRISM + RIMFAX",
    scientific_summary_es:
      "Antigua línea de costa lacustre en el borde interior occidental de Jezero rica en carbonatos de Mg/Fe y olivino alterado. Perseverance fusionó espectroscopía orbital CRISM con mediciones in situ de PIXL, SuperCam y georradar RIMFAX a lo largo de ~265 m de ascenso estratigráfico.",
    key_findings: [
      "Transición entre playa lacustre carbonatada en cotas bajas y rocas ígneas de olivino en cotas altas.",
      "Radargramas RIMFAX revelan estratos sedimentarios inclinados y antiguas superficies de erosión.",
      "Ascenso sostenido de hasta 18° en ruta directa agota el tanque de O₂ (78%); Ruta B en zigzag ahorra ~26% del oxígeno.",
    ],
    sampling_checklist: [
      "Contrastar textura de grano de olivino alterado con matriz carbonatada de paleo-costa.",
      "Correlacionar horizonte reflector RIMFAX con afloramiento visible en el escarpe.",
      "Monitorear descarga del tanque O₂ y límite Bingo O₂ durante el ascenso de la terraza.",
    ],
    soi_base: { M: 0.92, G: 0.9, T: 0.94, Q: 0.91 },
    pds_evidence: [
      {
        source_type: "Orbital",
        mission: "MRO",
        instrument: "CRISM & HiRISE DEM",
        product_id: "HRL000040FF / DTEEC_045994_1985",
        resolution: "18 m/px (CRISM) · 1.0 m/px (DEM)",
        date: "2008–2024",
        finding: "Banda de absorción de carbonatos de magnesio/hierro ('bañera de carbonatos') bordeando el delta.",
      },
      {
        source_type: "Subsurface",
        mission: "Mars 2020 Perseverance",
        instrument: "RIMFAX GPR",
        product_id: "RIMFAX_L2_PERSEVERANCE_MARGIN",
        resolution: "10 cm vertical",
        date: "2023–2025",
        finding: "Capas subsuperficiales inclinadas hacia la cuenca confirmando deposición marginal.",
      },
      {
        source_type: "Surface",
        mission: "Mars 2020 Perseverance",
        instrument: "SuperCam & PIXL",
        product_id: "SCAM_LIBS_MARGIN_2024",
        resolution: "Sub-mm / LIBS",
        date: "2024",
        finding: "Alteración acuosa alcalina de cumulados de olivino a carbonato y sílice amorfa.",
      },
    ],
    surface_photos: [
      {
        id: "jezero-margin-shoreline",
        title: "Paleo-Costa de Carbonatos — Margin Unit",
        instrument: "Mars 2020 Mastcam-Z",
        sol_or_date: "Campaña Margin Unit 2024",
        product_id: "ZCAM_MARGIN_AMHERST_POINT",
        georef_status: "EXACT_GEOREF",
        caption: "Estratos erosionados ricos en carbonatos de Mg/Fe en la transición hacia el anillo interno del cráter.",
        orbital_crop_url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/5/12/45.jpg",
        surface_visual_mode: "MARGIN_SHORELINE",
        nasa_gallery_url: "https://science.nasa.gov/mission/mars-2020-perseverance/",
      },
      {
        id: "jezero-rimfax-profile",
        title: "Perfil Georradar RIMFAX (Subsuelo 0–15 m)",
        instrument: "Mars 2020 RIMFAX",
        sol_or_date: "Campaña Ascenso 2023–2025",
        product_id: "RIMFAX_L2_PERSEVERANCE_MARGIN",
        georef_status: "CONTEXTUAL_ROVER_FRAME",
        caption: "Radargrama mostrando reflectores inclinados bajo el regolito de la Margin Unit.",
        orbital_crop_url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/5/12/45.jpg",
        surface_visual_mode: "RIMFAX_SUBSURFACE",
        nasa_gallery_url: "https://pds-geosciences.wustl.edu/missions/mars2020/",
      },
    ],
    pre_eva_weather_default: {
      sensor_source: "Mars 2020 MEDA Historical Reference (Jezero Crater)",
      pressure_pa: 755,
      pressure_drop_3h_pa: -3.1,
      optical_depth_tau: 0.48,
      solar_longitude_ls_deg: 110,
      wind_gust_ms: 9.5,
      delta_t_surf_air_k: 19.0,
    },
    radiation_reference: {
      sensor_note: "Referencia histórica RAD (Gale) sin sensor RAD directo en Jezero",
      surface_dose_rate_usv_h: 9.5,
      gcr_baseline_ugy_day: 228,
    },
  },
];

export const GLOBAL_MARS_LANDMARKS: GlobalMarsLandmark[] = [
  {
    id: "JEZERO_CRATER",
    name: "Cráter Jezero (Perseverance / Mars 2020)",
    category: "ACTIVE_REGION",
    lat: 18.45,
    lon: 77.38,
    elevation_m: -2540,
    region_id: "JEZERO_CRATER",
    target_id: "JEZERO-CHEYAVA-2024",
    coverage_class: "HIGH_RES_PDS",
    resolution_summary: "HiRISE 0.25 m/px · DEM 1.0 m/px · CRISM 18 m/px · MEDA/RIMFAX",
    summary: "Región Piloto Principal: antiguo lago y delta fluvial con Cheyava Falls y Unidad Marginal de Carbonatos.",
    terrain_feature_es: "Cañón Neretva Vallis & Frente Deltaico Lacustre",
    first_person_desc_es: "Vista de superficie entre terrazas fluviales esculpidas y sedimentos estratificados de Bright Angel rumbo a Cheyava Falls.",
    base_grid_pos: [72, 46],
    target_grid_pos: [21, 40],
    local_relief_span_m: 440,
  },
  {
    id: "GALE_MOUNT_SHARP",
    name: "Cráter Gale / Monte Sharp (Curiosity 2025)",
    category: "ACTIVE_REGION",
    lat: -4.682,
    lon: 137.405,
    elevation_m: -3850,
    region_id: "GALE_MOUNT_SHARP",
    target_id: "GALE-BOXWORK-2025",
    coverage_class: "HIGH_RES_PDS",
    resolution_summary: "HiRISE 0.25 m/px · DEM 1.0 m/px · CRISM 18 m/px · RAD/REMS/DAN",
    summary: "Región Oficial del Reto 2025: formaciones de retículas (boxwork) y nódulos evaporíticos en Aeolis Mons.",
    terrain_feature_es: "Crestas Poligonales Boxwork & Laderas del Monte Sharp",
    first_person_desc_es: "Travesía en ladera sulfatada entre crestas poligonales endurecidas de sulfato y depresiones arenosas huecas.",
    base_grid_pos: [18, 76],
    target_grid_pos: [45, 46],
    local_relief_span_m: 640,
  },
  {
    id: "OLYMPUS_MONS",
    name: "Olympus Mons (+21,229 m)",
    category: "LANDMARK",
    lat: 18.65,
    lon: -133.8,
    elevation_m: 21229,
    coverage_class: "CTX_STRIPS",
    resolution_summary: "MOLA 463 m/px · CTX 6 m/px · THEMIS 100 m/px",
    summary: "El volcán en escudo más alto del Sistema Solar (aprox. 600 km de diámetro).",
    terrain_feature_es: "Caldera Anidada Somital & Flanco Escudo Basáltico",
    first_person_desc_es: "Borde de colapso de caldera a 21 km de altitud con escarpes escalonados basálticos y atmósfera extremadamente tenue.",
    base_grid_pos: [14, 50],
    target_grid_pos: [40, 26],
    local_relief_span_m: 780,
  },
  {
    id: "VALLES_MARINERIS",
    name: "Valles Marineris",
    category: "LANDMARK",
    lat: -13.9,
    lon: -59.2,
    elevation_m: -6800,
    coverage_class: "HIGH_RES_PDS",
    resolution_summary: "HiRISE Strips 0.25 m/px · CTX 6 m/px · MOLA 463 m/px",
    summary: "Sistema de cañones tectónicos de más de 4,000 km de longitud y hasta 7 km de profundidad.",
    terrain_feature_es: "Fosa Tectónica Coprates Chasma & Terrazas de Deslizamiento",
    first_person_desc_es: "Fondo profundo del cañón flanqueado por paredes estratificadas de hasta 1.8 km y sombra severa de radio LoS.",
    base_grid_pos: [14, 34],
    target_grid_pos: [48, 28],
    local_relief_span_m: 1850,
  },
  {
    id: "HELLAS_PLANITIA",
    name: "Hellas Planitia (-8,200 m)",
    category: "LANDMARK",
    lat: -42.4,
    lon: 70.0,
    elevation_m: -8200,
    coverage_class: "MOLA_GLOBAL_ONLY",
    resolution_summary: "MOLA 463 m/px · Viking 232 m/px · Cobertura HiRISE dispersa",
    summary: "La mayor cuenca de impacto visible en Marte y punto más bajo (presión atmosférica máxima).",
    terrain_feature_es: "Cuenca de Impacto Profunda, Escarpes Anulares & Dunas",
    first_person_desc_es: "Planicie abismal de mayor presión superficial (~1,155 Pa) rodeada de escarpes concéntricos y cordones de dunas eólicas.",
    base_grid_pos: [48, 46],
    target_grid_pos: [22, 24],
    local_relief_span_m: 650,
  },
  {
    id: "MARS_PATHFINDER_ARES",
    name: "Ares Vallis (Mars Pathfinder 1997)",
    category: "HISTORIC_MISSION",
    lat: 19.13,
    lon: -33.22,
    elevation_m: -3680,
    coverage_class: "CTX_STRIPS",
    resolution_summary: "IMP Rover + Viking/CTX 6 m/px",
    summary: "Sitio histórico de aterrizaje de Mars Pathfinder y el primer rover Sojourner.",
    terrain_feature_es: "Valle de Inundación Ares Vallis & Colinas Twin Peaks",
    first_person_desc_es: "Llanura pedregosa de mega-inundación con islas hidrodinámicas e inspección hacia las colinas Twin Peaks.",
    base_grid_pos: [16, 48],
    target_grid_pos: [46, 22],
    local_relief_span_m: 190,
  },
  {
    id: "VIKING_1",
    name: "Chryse Planitia (Viking 1, 1976)",
    category: "HISTORIC_MISSION",
    lat: 22.27,
    lon: -47.95,
    elevation_m: -3620,
    coverage_class: "CTX_STRIPS",
    resolution_summary: "Viking Orbiter/Lander · MOLA 463 m/px",
    summary: "Primer aterrizador operativo a largo plazo en la superficie marciana.",
    terrain_feature_es: "Planicie Volcánica Chryse, Crestas Arrugadas & Cráteres",
    first_person_desc_es: "Regolito ferruginoso salpicado de bloques basálticos angulosos y dorsales tectónicas de compresión.",
    base_grid_pos: [14, 46],
    target_grid_pos: [44, 24],
    local_relief_span_m: 165,
  },
  {
    id: "INSIGHT_ELYSIUM",
    name: "Elysium Planitia (InSight)",
    category: "HISTORIC_MISSION",
    lat: 4.5,
    lon: 135.62,
    elevation_m: -2655,
    coverage_class: "HIGH_RES_PDS",
    resolution_summary: "HiRISE + Sismómetro SEIS",
    summary: "Estación geofísica que midió más de 1,300 martemotos revelando la estructura del núcleo marciano.",
    terrain_feature_es: "Hondonada Homestead Hollow & Planicie Sismológica",
    first_person_desc_es: "Depresión suave rellena de arena compactada junto a llanuras lisas óptimas para despliegue sísmico.",
    base_grid_pos: [48, 44],
    target_grid_pos: [24, 28],
    local_relief_span_m: 95,
  },
  {
    id: "SPIRIT_GUSEV",
    name: "Cráter Gusev (Spirit MER-A)",
    category: "HISTORIC_MISSION",
    lat: -14.57,
    lon: 175.47,
    elevation_m: -1910,
    coverage_class: "HIGH_RES_PDS",
    resolution_summary: "HiRISE + Pancam/APXS",
    summary: "Llanura basáltica y Colinas Columbia exploradas por el rover Spirit.",
    terrain_feature_es: "Ascenso a Colinas Columbia (Husband Hill) & Home Plate",
    first_person_desc_es: "Travesía ascendente desde llanuras basálticas hacia las cimas estratificadas y ricos afloramientos silíceos de Columbia Hills.",
    base_grid_pos: [14, 50],
    target_grid_pos: [46, 18],
    local_relief_span_m: 340,
  },
  {
    id: "OPPORTUNITY_MERIDIANI",
    name: "Meridiani Planum (Opportunity MER-B)",
    category: "HISTORIC_MISSION",
    lat: -1.95,
    lon: -5.53,
    elevation_m: -1420,
    coverage_class: "HIGH_RES_PDS",
    resolution_summary: "HiRISE + CRISM + Mini-TES",
    summary: "Depósitos de hematita ('arándanos marcianos') y cráter Endeavour.",
    terrain_feature_es: "Planicie de Hematita & Borde Festoneado Cráter Victoria/Endeavour",
    first_person_desc_es: "Suelo oscuro rico en esférulas de hematita bordeando bahías y promontorios expuestos de cráteres antiguos.",
    base_grid_pos: [14, 46],
    target_grid_pos: [42, 26],
    local_relief_span_m: 220,
  },
];

export const ORBITAL_COVERAGE_FOOTPRINTS: OrbitalCoverageFootprint[] = [
  {
    id: "FP_JEZERO",
    name: "MRO HiRISE + CRISM + Perseverance Survey (Jezero)",
    instrument: "HiRISE (0.25 m) + DTM (1 m) + CRISM (18 m)",
    resolution: "0.25 m/px – 1.0 m/px",
    minLon: 75.5,
    maxLon: 79.5,
    minLat: 16.5,
    maxLat: 20.5,
    color: "#00F0FF",
    uncertainty: 0.12,
  },
  {
    id: "FP_GALE",
    name: "MRO HiRISE + CRISM + Curiosity Survey (Gale)",
    instrument: "HiRISE (0.25 m) + DTM (1 m) + CRISM (18 m)",
    resolution: "0.25 m/px – 1.0 m/px",
    minLon: 135.5,
    maxLon: 139.5,
    minLat: -6.5,
    maxLat: -2.5,
    color: "#00F0FF",
    uncertainty: 0.14,
  },
  {
    id: "FP_VALLES",
    name: "Corredor HiRISE / CRISM Valles Marineris",
    instrument: "HiRISE Strips + CTX (6 m)",
    resolution: "0.25 m/px (discontinuo) – 6 m/px",
    minLon: -92.0,
    maxLon: -45.0,
    minLat: -17.0,
    maxLat: -5.0,
    color: "#10B981",
    uncertainty: 0.34,
  },
  {
    id: "FP_OXIA",
    name: "Mawrth Vallis & Oxia Planum",
    instrument: "HiRISE + CRISM Filosilicatos",
    resolution: "0.25 m/px – 18 m/px",
    minLon: -26.0,
    maxLon: -14.0,
    minLat: 16.0,
    maxLat: 25.0,
    color: "#10B981",
    uncertainty: 0.3,
  },
  {
    id: "FP_ELYSIUM",
    name: "Elysium Planitia (InSight)",
    instrument: "HiRISE + CTX",
    resolution: "0.25 m/px – 6 m/px",
    minLon: 132.0,
    maxLon: 139.0,
    minLat: 1.0,
    maxLat: 8.0,
    color: "#F59E0B",
    uncertainty: 0.28,
  },
];

export const NASA_INSTRUMENT_CATALOG = [
  { mission: "MRO", instrument: "HiRISE", dataType: "Óptico (0.25–0.5 m/px) y DEM Estéreo (1 m)", role: "Retículas boxwork en Monte Sharp, Neretva Vallis, bloques y pendientes", url: "https://www.uahirise.org/" },
  { mission: "MRO", instrument: "CTX", dataType: "Óptico Contextual (5–6 m/px)", role: "Mapa base regional continuo de Gale y Jezero", url: "https://ode.rsl.wustl.edu/mars/" },
  { mission: "MRO", instrument: "CRISM", dataType: "Espectrómetro Visible/IR (18 m/px)", role: "Firmas de carbonatos, olivino, filosilicatos y sulfatos", url: "https://pds-geosciences.wustl.edu/" },
  { mission: "MGS", instrument: "MOLA", dataType: "Altímetro Láser Global (463 m/px)", role: "Elevación global de toda la esfera marciana (-8.2 km a +21.2 km)", url: "https://trek.nasa.gov/mars/" },
  { mission: "Mars Odyssey", instrument: "THEMIS", dataType: "Térmico / Infrarrojo (100 m/px)", role: "Inercia térmica para detectar trampas de arena suelta y estrés térmico", url: "https://trek.nasa.gov/mars/" },
  { mission: "Mars Express", instrument: "HRSC", dataType: "Óptico y Topográfico Regional (12.5–50 m)", role: "Modelos digitales de terreno intermedios", url: "https://ode.rsl.wustl.edu/mars/" },
  { mission: "Viking 1 & 2 Orbiters", instrument: "VIS MDIM 2.1", dataType: "Mosaico Óptico Global (232 m/px)", role: "Textura base planetaria 100% continua en la esfera 3D", url: "https://trek.nasa.gov/mars/" },
  { mission: "Mars 2020 (Perseverance)", instrument: "PIXL", dataType: "Fluorescencia de Rayos X Sub-mm", role: "Mapas elementales de vivianita/greigita en Cheyava Falls", url: "https://pds-geosciences.wustl.edu/missions/mars2020/" },
  { mission: "Mars 2020 (Perseverance)", instrument: "SHERLOC & WATSON", dataType: "Espectroscopía Raman/UV y Macro", role: "Detección de orgánicos y macro de manchas de leopardo", url: "https://pds-geosciences.wustl.edu/missions/mars2020/" },
  { mission: "Mars 2020 (Perseverance)", instrument: "Mastcam-Z & Navcam", dataType: "Imágenes Estereoscópicas de Superficie", role: "First-Person Surface Viewer en Jezero", url: "https://science.nasa.gov/mission/mars-2020-perseverance/" },
  { mission: "Mars 2020 (Perseverance)", instrument: "SuperCam", dataType: "LIBS, Raman y VISIR", role: "Química remota en la Margin Unit de carbonatos", url: "https://pds-geosciences.wustl.edu/missions/mars2020/" },
  { mission: "Mars 2020 (Perseverance)", instrument: "RIMFAX", dataType: "Radar de Penetración Terrestre", role: "Perfiles subsuperficiales de estratos inclinados", url: "https://pds-geosciences.wustl.edu/missions/mars2020/" },
  { mission: "Mars 2020 (Perseverance)", instrument: "MEDA", dataType: "Estación Ambiental (P, T, viento, τ)", role: "Telemetría histórica para predictor Pre-EVA de polvo en Jezero", url: "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/mars2020.html" },
  { mission: "MSL (Curiosity)", instrument: "Mastcam, MAHLI & Navcam", dataType: "Cámaras Multiespectrales y Macro", role: "Panoramas 2025 de formaciones boxwork y nódulos en Monte Sharp", url: "https://science.nasa.gov/mission/msl-curiosity/" },
  { mission: "MSL (Curiosity)", instrument: "ChemCam & APXS", dataType: "Espectroscopía LIBS y Rayos X", role: "Composición de crestas cementadas y sulfatos en Gale", url: "https://pds-geosciences.wustl.edu/missions/msl/" },
  { mission: "MSL (Curiosity)", instrument: "RAD", dataType: "Detector de Radiación Superficial", role: "Referencia histórica de dosis (~210–250 μGy/día)", url: "https://pds.nasa.gov/" },
  { mission: "MSL (Curiosity) & DONKI", instrument: "REMS, DAN & CCMC DONKI", dataType: "Clima Gale, Hidrógeno Subsuelo y Clima Espacial", role: "Caídas de ΔP, hidratación y alertas SEP/CME", url: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/" },
];

export const HISTORICAL_ENV_SERIES = {
  JEZERO_CRATER: [
    { sol: "Sol 1190", ls: 195, pressurePa: 774, tempMinC: -74, tempMaxC: -9, windMs: 9.2, tau: 0.54, radUsvDay: 214 },
    { sol: "Sol 1195", ls: 198, pressurePa: 772, tempMinC: -73, tempMaxC: -8, windMs: 11.4, tau: 0.61, radUsvDay: 218 },
    { sol: "Sol 1200", ls: 201, pressurePa: 769, tempMinC: -71, tempMaxC: -7, windMs: 14.0, tau: 0.72, radUsvDay: 220 },
    { sol: "Sol 1205", ls: 205, pressurePa: 764, tempMinC: -70, tempMaxC: -6, windMs: 16.5, tau: 0.85, radUsvDay: 216 },
    { sol: "Sol 1210", ls: 209, pressurePa: 760, tempMinC: -69, tempMaxC: -5, windMs: 18.2, tau: 0.92, radUsvDay: 215 },
    { sol: "Sol 1215", ls: 215, pressurePa: 768, tempMinC: -72, tempMaxC: -8, windMs: 13.8, tau: 0.74, radUsvDay: 212 },
  ],
  GALE_MOUNT_SHARP: [
    { sol: "Sol 4605", ls: 128, pressurePa: 749, tempMinC: -71, tempMaxC: -6, windMs: 8.6, tau: 0.48, radUsvDay: 221 },
    { sol: "Sol 4615", ls: 132, pressurePa: 747, tempMinC: -70, tempMaxC: -5, windMs: 9.8, tau: 0.52, radUsvDay: 224 },
    { sol: "Sol 4625", ls: 136, pressurePa: 745, tempMinC: -69, tempMaxC: -4, windMs: 10.5, tau: 0.58, radUsvDay: 219 },
    { sol: "Sol 4635", ls: 139, pressurePa: 744, tempMinC: -68, tempMaxC: -3, windMs: 11.4, tau: 0.65, radUsvDay: 221 },
    { sol: "Sol 4645", ls: 142, pressurePa: 742, tempMinC: -70, tempMaxC: -4, windMs: 12.1, tau: 0.62, radUsvDay: 226 },
    { sol: "Sol 4655", ls: 146, pressurePa: 746, tempMinC: -72, tempMaxC: -6, windMs: 9.4, tau: 0.51, radUsvDay: 222 },
  ],
};
