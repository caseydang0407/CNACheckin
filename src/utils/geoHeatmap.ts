import { ComplianceSummary, RegionalBranch } from '../types/union';

export interface BranchGeoHub {
  branch: RegionalBranch;
  lon: number;
  lat: number;
  regionLabel: string;
}

export const CALIFORNIA_BRANCH_HUBS: BranchGeoHub[] = [
  { branch: 'San Francisco', lon: -122.4194, lat: 37.7749, regionLabel: 'Bay Area' },
  { branch: 'Sacramento', lon: -121.4944, lat: 38.5816, regionLabel: 'Central Valley' },
  { branch: 'Los Angeles', lon: -118.2437, lat: 34.0522, regionLabel: 'LA Basin' },
  { branch: 'Irvine', lon: -117.8265, lat: 33.6846, regionLabel: 'Orange County' },
  { branch: 'San Diego', lon: -117.1611, lat: 32.7157, regionLabel: 'San Diego County' },
];

// Self-contained California boundary polygon [lon, lat] for offline-safe d3-geo projection
export const CALIFORNIA_GEOJSON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { name: 'California' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-124.21, 41.99],
        [-122.0, 42.0],
        [-120.0, 42.0],
        [-120.0, 39.0],
        [-119.0, 38.0],
        [-117.1, 36.6],
        [-114.63, 35.0],
        [-114.13, 34.25],
        [-114.52, 33.4],
        [-114.72, 32.72],
        [-117.12, 32.53],
        [-117.28, 32.85],
        [-117.6, 33.38],
        [-118.18, 33.74],
        [-118.52, 34.02],
        [-119.25, 34.18],
        [-120.47, 34.45],
        [-120.64, 34.95],
        [-121.3, 35.79],
        [-121.95, 36.6],
        [-122.39, 37.18],
        [-122.51, 37.78],
        [-123.02, 38.03],
        [-123.72, 38.95],
        [-124.35, 40.26],
        [-124.15, 41.15],
        [-124.21, 41.99],
      ],
    ],
  },
};

export interface GeoHeatSample {
  branch: RegionalBranch;
  lon: number;
  lat: number;
  weight: number;
}

/**
 * Expands branch compliance counts into deterministic weighted spatial samples
 * for smooth d3.contourDensity rendering without relying on Math.random().
 */
export function buildBranchDensitySamples(
  compliance: ComplianceSummary[],
  hubs: BranchGeoHub[] = CALIFORNIA_BRANCH_HUBS
): GeoHeatSample[] {
  const samples: GeoHeatSample[] = [];
  for (const summary of compliance) {
    const hub = hubs.find((h) => h.branch === summary.branch);
    if (!hub || summary.checkedInToday <= 0) continue;

    // Central weighted point + deterministic ring offsets scaled by attendance
    samples.push({
      branch: hub.branch,
      lon: hub.lon,
      lat: hub.lat,
      weight: summary.checkedInToday,
    });

    const ringCount = Math.min(8, summary.checkedInToday);
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const spread = 0.14;
      samples.push({
        branch: hub.branch,
        lon: hub.lon + Math.cos(angle) * spread,
        lat: hub.lat + Math.sin(angle) * spread,
        weight: Math.max(1, summary.checkedInToday / ringCount),
      });
    }
  }
  return samples;
}

export function getBranchHeatSummary(compliance: ComplianceSummary[]): {
  maxCount: number;
  topBranch: ComplianceSummary | null;
  totalAcrossMap: number;
} {
  if (compliance.length === 0) {
    return { maxCount: 0, topBranch: null, totalAcrossMap: 0 };
  }
  let top = compliance[0];
  let total = 0;
  for (const item of compliance) {
    total += item.checkedInToday;
    if (item.checkedInToday > top.checkedInToday) {
      top = item;
    }
  }
  return {
    maxCount: top.checkedInToday,
    topBranch: top.checkedInToday > 0 ? top : null,
    totalAcrossMap: total,
  };
}
