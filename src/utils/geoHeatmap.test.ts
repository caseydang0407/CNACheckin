import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBranchDensitySamples,
  CALIFORNIA_BRANCH_HUBS,
  CALIFORNIA_GEOJSON,
  getBranchHeatSummary,
} from './geoHeatmap';
import { ComplianceSummary } from '../types/union';

const mockCompliance: ComplianceSummary[] = [
  {
    branch: 'San Francisco',
    checkedInToday: 6,
    quorumTarget: 25,
    quorumMet: false,
    compliancePercent: 24,
    lastCheckInAt: '2026-11-20T09:00:00Z',
  },
  {
    branch: 'Los Angeles',
    checkedInToday: 10,
    quorumTarget: 35,
    quorumMet: false,
    compliancePercent: 29,
    lastCheckInAt: '2026-11-20T09:10:00Z',
  },
  {
    branch: 'Irvine',
    checkedInToday: 0,
    quorumTarget: 20,
    quorumMet: false,
    compliancePercent: 0,
    lastCheckInAt: null,
  },
];

test('California GeoJSON polygon is closed and covers all 5 branch hubs', () => {
  const ring = CALIFORNIA_GEOJSON.geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.equal(CALIFORNIA_BRANCH_HUBS.length, 5);
});

test('buildBranchDensitySamples skips zero-count branches and generates deterministic points', () => {
  const samples = buildBranchDensitySamples(mockCompliance);
  assert.ok(samples.length > 2);
  assert.equal(
    samples.some((s) => s.branch === 'Irvine'),
    false
  );
  assert.equal(
    samples.some((s) => s.branch === 'Los Angeles'),
    true
  );
});

test('getBranchHeatSummary identifies highest density branch and total', () => {
  const summary = getBranchHeatSummary(mockCompliance);
  assert.equal(summary.maxCount, 10);
  assert.equal(summary.totalAcrossMap, 16);
  assert.equal(summary.topBranch?.branch, 'Los Angeles');
});
