"use client";

import React, { useEffect, useState } from "react";
import MarsCesiumProViewer, { AllTenSitesGdalPayload } from "./MarsCesiumProViewer";
import { useMissionStore } from "@/lib/mission-store";

export default function CesiumMarsStandalonePage() {
  const setQgisTerrainData = useMissionStore((s) => s.setQgisTerrainData);
  const selectTarget = useMissionStore((s) => s.selectTarget);
  const selectLandmark = useMissionStore((s) => s.selectLandmark);
  const [allSitesPayload, setAllSitesPayload] = useState<AllTenSitesGdalPayload | null>(null);

  useEffect(() => {
    selectLandmark("JEZERO_CRATER", "TERRAIN_3D");
    selectTarget("JEZERO-CHEYAVA-2024");

    fetch("/cesium-mars/assets/all_10_sites_qgis_gdal.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AllTenSitesGdalPayload | null) => {
        if (data?.sites) {
          setAllSitesPayload(data);
          setQgisTerrainData(data.sites as any, {
            generator: data.generator,
            blender_version: data.blender_version,
            mars_radius_m: data.mars_radius_m,
          });
        }
      })
      .catch(() => {
        // Fallback if asset fetch is still warming up
      });
  }, [selectLandmark, selectTarget, setQgisTerrainData]);

  return <MarsCesiumProViewer allSitesPayload={allSitesPayload} />;
}
