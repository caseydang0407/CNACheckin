import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { MapPin } from 'lucide-react';
import { ComplianceSummary, RegionalBranch } from '../types/union';
import {
  buildBranchDensitySamples,
  CALIFORNIA_BRANCH_HUBS,
  CALIFORNIA_GEOJSON,
  getBranchHeatSummary,
} from '../utils/geoHeatmap';

interface RegionalHeatmapProps {
  compliance: ComplianceSummary[];
  accessibleBranches: RegionalBranch[];
  selectedBranch: RegionalBranch | 'All Branches';
  onSelectBranch: (branch: RegionalBranch | 'All Branches') => void;
}

const SVG_WIDTH = 480;
const SVG_HEIGHT = 420;

export const RegionalHeatmap: React.FC<RegionalHeatmapProps> = ({
  compliance,
  accessibleBranches,
  selectedBranch,
  onSelectBranch,
}) => {
  const [hoveredBranch, setHoveredBranch] = useState<RegionalBranch | null>(null);

  const summaryByBranch = useMemo(() => {
    const map = new Map<RegionalBranch, ComplianceSummary>();
    for (const c of compliance) {
      map.set(c.branch, c);
    }
    return map;
  }, [compliance]);

  const { maxCount, topBranch, totalAcrossMap } = useMemo(
    () => getBranchHeatSummary(compliance),
    [compliance]
  );

  // D3 Mercator projection fitted to California polygon
  const { projection, statePath, graticulePath } = useMemo(() => {
    const proj = d3
      .geoMercator()
      .fitExtent(
        [
          [46, 20],
          [SVG_WIDTH - 46, SVG_HEIGHT - 22],
        ],
        CALIFORNIA_GEOJSON
      );
    const pathGen = d3.geoPath(proj);
    const grat = d3
      .geoGraticule()
      .extent([
        [-125, 32],
        [-114, 43],
      ])
      .step([2, 2])();
    return {
      projection: proj,
      statePath: pathGen(CALIFORNIA_GEOJSON) ?? '',
      graticulePath: pathGen(grat) ?? '',
    };
  }, []);

  // D3 Contour Density computation from weighted regional branch coordinates
  const { contourPaths, colorScale, radiusScale, projectedHubs } = useMemo(() => {
    const samples = buildBranchDensitySamples(compliance);
    const projectedSamples = samples
      .map((s) => {
        const coords = projection([s.lon, s.lat]);
        if (!coords) return null;
        return { x: coords[0], y: coords[1], weight: s.weight };
      })
      .filter((v): v is { x: number; y: number; weight: number } => v !== null);

    const densityGenerator = d3
      .contourDensity<{ x: number; y: number; weight: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .weight((d) => d.weight)
      .size([SVG_WIDTH, SVG_HEIGHT])
      .cellSize(6)
      .bandwidth(34)
      .thresholds(8);

    const contours = projectedSamples.length > 0 ? densityGenerator(projectedSamples) : [];
    const maxDensity = d3.max(contours, (c) => c.value) ?? 1;

    const heatInterpolator = d3.interpolateRgbBasis([
      '#fef3c7',
      '#fb923c',
      '#dc2626',
      '#7f1d1d',
    ]);
    const cScale = d3.scaleSequential(heatInterpolator).domain([0, maxDensity]);
    const rScale = d3
      .scaleSqrt()
      .domain([0, Math.max(1, maxCount)])
      .range([5, 16]);

    const contourGeo = d3.geoPath();
    const cPaths = contours.map((contour, idx) => ({
      id: idx,
      d: contourGeo(contour) ?? '',
      fill: cScale(contour.value),
      opacity: 0.28 + (idx / Math.max(1, contours.length)) * 0.55,
    }));

    const hubs = CALIFORNIA_BRANCH_HUBS.map((hub) => {
      const pt = projection([hub.lon, hub.lat]) ?? [0, 0];
      const item = summaryByBranch.get(hub.branch);
      const accessible = accessibleBranches.includes(hub.branch);
      return {
        ...hub,
        x: pt[0],
        y: pt[1],
        count: item?.checkedInToday ?? 0,
        target: item?.quorumTarget ?? 0,
        percent: item?.compliancePercent ?? 0,
        quorumMet: item?.quorumMet ?? false,
        accessible,
      };
    });

    return {
      contourPaths: cPaths,
      colorScale: cScale,
      radiusScale: rScale,
      projectedHubs: hubs,
    };
  }, [compliance, maxCount, projection, summaryByBranch, accessibleBranches]);

  const activeDetailBranch = hoveredBranch ?? (selectedBranch !== 'All Branches' ? selectedBranch : null);
  const activeHubDetail = activeDetailBranch
    ? projectedHubs.find((h) => h.branch === activeDetailBranch)
    : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-700 dark:text-red-400" />
            California Geospatial Attendance Heatmap
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            D3 spatial density across regional chapters · click a branch hub to filter
          </p>
        </div>
        {selectedBranch !== 'All Branches' && accessibleBranches.length > 1 && (
          <button
            type="button"
            onClick={() => onSelectBranch('All Branches')}
            className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline whitespace-nowrap"
          >
            Reset map filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-center">
        {/* D3 California Geospatial Map SVG */}
        <div className="xl:col-span-7 relative rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-2">
          <svg
            data-testid="geospatial-heatmap-svg"
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            role="img"
            aria-label="D3 geospatial heatmap of California Nurses Association regional chapter attendance density"
            className="w-full h-auto max-h-[360px] block"
          >
            <defs>
              <clipPath id="ca-landmass-clip">
                <path d={statePath} />
              </clipPath>
            </defs>

            {/* California Base Landmass */}
            <path
              d={statePath}
              className="fill-slate-100 dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700"
              strokeWidth={1.5}
            />

            {/* Clipped Geographic Graticule + D3 Density Contours */}
            <g clipPath="url(#ca-landmass-clip)">
              <path
                d={graticulePath}
                fill="none"
                className="stroke-slate-200/80 dark:stroke-slate-800/80"
                strokeWidth={0.75}
                strokeDasharray="2 3"
              />
              {contourPaths.map((contour) => (
                <path
                  key={contour.id}
                  d={contour.d}
                  fill={contour.fill}
                  fillOpacity={contour.opacity}
                  stroke="none"
                />
              ))}
            </g>

            {/* State Border Stroke Overlay */}
            <path
              d={statePath}
              fill="none"
              className="stroke-slate-400 dark:stroke-slate-600"
              strokeWidth={1.25}
            />

            {/* Regional Branch Interactive Nodes */}
            {projectedHubs.map((hub) => {
              const isSelected = selectedBranch === hub.branch;
              const isHovered = hoveredBranch === hub.branch;
              const r = hub.accessible ? radiusScale(hub.count) : 5;
              const canFilter = hub.accessible && accessibleBranches.length > 1;
              // Place coastal hubs (San Francisco, Los Angeles) left over the Pacific
              // and inland/southern hubs (Sacramento, Irvine, San Diego) right to prevent label collisions
              const isLeftAnchor =
                hub.branch === 'San Francisco' || hub.branch === 'Los Angeles';
              const labelDx = isLeftAnchor ? -(r + 7) : r + 7;
              const labelDy =
                hub.branch === 'Sacramento'
                  ? -6
                  : hub.branch === 'San Francisco'
                    ? 5
                    : hub.branch === 'Los Angeles'
                      ? 2
                      : hub.branch === 'Irvine'
                        ? -3
                        : 6;
              const anchor = isLeftAnchor ? 'end' : 'start';

              return (
                <g
                  key={hub.branch}
                  transform={`translate(${hub.x}, ${hub.y})`}
                  className={canFilter ? 'cursor-pointer' : hub.accessible ? '' : 'opacity-45'}
                  onMouseEnter={() => hub.accessible && setHoveredBranch(hub.branch)}
                  onMouseLeave={() => setHoveredBranch(null)}
                  onClick={() => {
                    if (!canFilter) return;
                    onSelectBranch(selectedBranch === hub.branch ? 'All Branches' : hub.branch);
                  }}
                >
                  {hub.accessible && hub.count > 0 && (
                    <circle
                      r={r + 5}
                      fill={colorScale(maxCount)}
                      fillOpacity={isSelected || isHovered ? 0.28 : 0.14}
                    />
                  )}
                  <circle
                    r={r}
                    className={
                      !hub.accessible
                        ? 'fill-slate-400 dark:fill-slate-600 stroke-white dark:stroke-slate-900'
                        : isSelected || isHovered
                          ? 'fill-red-700 dark:fill-red-500 stroke-white dark:stroke-slate-950'
                          : 'fill-red-800 dark:fill-red-600 stroke-white dark:stroke-slate-950'
                    }
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  {hub.accessible && (
                    <text
                      x={labelDx}
                      y={labelDy}
                      textAnchor={anchor}
                      style={{ paintOrder: 'stroke' }}
                      strokeWidth={3.5}
                      strokeLinejoin="round"
                      className="fill-slate-800 dark:fill-slate-100 stroke-slate-50 dark:stroke-slate-950 text-[11px] font-semibold select-none"
                    >
                      {hub.branch} ({hub.count})
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* D3 Density Ramp Legend */}
          <div className="mt-2 px-2 pb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>Density:</span>
              <span className="font-mono tabular-nums">0</span>
              <div
                aria-hidden="true"
                className="w-24 h-2 rounded-full"
                style={{
                  background:
                    'linear-gradient(to right, #fef3c7, #fb923c, #dc2626, #7f1d1d)',
                }}
              />
              <span className="font-mono tabular-nums">{maxCount}</span>
            </div>
            <span className="font-mono tabular-nums">
              {totalAcrossMap} total plotted
            </span>
          </div>
        </div>

        {/* Right Side: Interactive Regional Hub Breakdown & Selected Callout */}
        <div className="xl:col-span-5 space-y-3">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3.5 text-xs">
            {activeHubDetail ? (
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeHubDetail.branch} · {activeHubDetail.regionLabel}
                </div>
                <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1">
                  {activeHubDetail.count} / {activeHubDetail.target} checked in ({activeHubDetail.percent}% quorum)
                </div>
              </div>
            ) : topBranch ? (
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Highest Density: {topBranch.branch}
                </div>
                <div className="font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-1">
                  {topBranch.checkedInToday} members logged ({topBranch.compliancePercent}% of{' '}
                  {topBranch.quorumTarget} target)
                </div>
              </div>
            ) : (
              <div className="text-slate-500 dark:text-slate-400">
                No check-ins recorded for the active date filter.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {projectedHubs.map((hub) => {
              const isSelected = selectedBranch === hub.branch;
              return (
                <button
                  key={hub.branch}
                  type="button"
                  disabled={!hub.accessible || accessibleBranches.length <= 1}
                  onMouseEnter={() => hub.accessible && setHoveredBranch(hub.branch)}
                  onMouseLeave={() => setHoveredBranch(null)}
                  onClick={() =>
                    onSelectBranch(isSelected ? 'All Branches' : hub.branch)
                  }
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                    isSelected
                      ? 'border-red-700 bg-red-50/70 dark:bg-red-950/30 text-slate-900 dark:text-slate-50'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                  } disabled:opacity-50 disabled:cursor-default`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{hub.branch}</span>
                    <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                      · {hub.regionLabel}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums font-semibold shrink-0">
                    {hub.accessible ? `${hub.count} (${hub.percent}%)` : 'Restricted'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
