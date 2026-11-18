
import * as d3 from
  'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

import { feature } from
  'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

const section = document.querySelector('#globe-story');
const canvas = document.querySelector('#globe-canvas');
const context = canvas.getContext('2d');

const yearLabel = document.querySelector('#globe-year');
const eraLabel = document.querySelector('#globe-era');
const status = document.querySelector('#globe-status');

const projection = d3.geoOrthographic()
  .clipAngle(90)
  .precision(1);

const path = d3.geoPath(projection, context);

const colors = d3.scaleLinear()
  .domain([-2, 0, 2, 4, 6, 8])
  .range([
    '#256fa5',
    '#e6e8e1',
    '#f0c66d',
    '#eb8454',
    '#c8433e',
    '#741d38'
  ])
  .clamp(true);

const sanDiego = [-117.16, 32.72];

let climateData = null;
let land = null;
let cells = [];

function makeCell(lat, lon, step = 5) {
  const west = (lon - step / 2 + 540) % 360 - 180;
  const east = (lon + step / 2 + 540) % 360 - 180;

  return {
    type: 'Polygon',
    coordinates: [[
      [west, lat - step / 2],
      [west, lat + step / 2],
      [east, lat + step / 2],
      [east, lat - step / 2],
      [west, lat - step / 2]
    ]]
  };
}

function scrollProgress() {
  const total = section.offsetHeight - window.innerHeight;

  return Math.max(0, Math.min(1,
    -section.getBoundingClientRect().top /
    Math.max(1, total)
  ));
}

function draw() {
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  projection
    .translate([width / 2, height / 2])
    .scale(Math.min(width, height) * 0.44);

  const progress = scrollProgress();

  const firstYear = climateData?.records[0]?.year ?? 1950;
  const lastYear = climateData?.records.at(-1)?.year ?? 2100;

  const year = Math.round(
    firstYear + (lastYear - firstYear) * progress
  );

  yearLabel.textContent = climateData ? year : '—';

  eraLabel.textContent = year < 2015
    ? 'Historical CMIP6 simulation'
    : 'Future projection: SSP3-7.0';

  // Rotate toward San Diego as scrolling advances.
  const longitudeRotation = d3.interpolateNumber(
    -25, 117.16
  )(progress);

  const latitudeRotation = d3.interpolateNumber(
    -5, -32.72
  )(progress);

  projection.rotate([
    longitudeRotation,
    latitudeRotation
  ]);

  context.fillStyle = '#0c1c2c';
  context.fillRect(0, 0, width, height);

  // Ocean / sphere
  context.beginPath();
  path({ type: 'Sphere' });
  context.fillStyle = '#142d41';
  context.fill();

  // Actual CMIP6 climate colors
  if (climateData) {
    const record = climateData.records.find(
      row => row.year === year
    );

    if (record) {
      cells.forEach((cell, i) => {
        const temperature = record.values[i];

        if (temperature == null ||
            !Number.isFinite(temperature)) {
          return;
        }

        context.beginPath();
        path(cell);
        context.fillStyle = colors(temperature);
        context.fill();
      });
    }
  }

  // Land outlines
  if (land) {
    context.beginPath();
    path(land);
    context.strokeStyle = 'rgba(255,255,255,0.6)';
    context.lineWidth = 0.8;
    context.stroke();
  }

  // Globe outline
  context.beginPath();
  path({ type: 'Sphere' });
  context.strokeStyle = '#dce8f0';
  context.lineWidth = 1.2;
  context.stroke();

  // Highlight San Diego near the end
  if (progress > 0.85) {
    const center = projection.invert([
      width / 2, height / 2
    ]);

    if (center &&
        d3.geoDistance(center, sanDiego) < Math.PI / 2) {
      const position = projection(sanDiego);

      if (position) {
        context.beginPath();
        context.arc(
          position[0], position[1], 6, 0, Math.PI * 2
        );
        context.fillStyle = '#ffffff';
        context.fill();

        context.font = 'bold 14px Arial';
        context.fillText(
          'San Diego',
          position[0] + 15,
          position[1] - 10
        );
      }
    }
  }
}

let pendingFrame = false;

function scheduleDraw() {
  if (pendingFrame) return;

  pendingFrame = true;

  requestAnimationFrame(() => {
    pendingFrame = false;
    draw();
  });
}

async function initializeGlobe() {
  try {
    const [climateResponse, worldResponse] =
      await Promise.all([
        fetch('data/global_cmip6_anomalies.json'),
        fetch(
          'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
        )
      ]);

    if (!climateResponse.ok) {
      throw new Error('CMIP6 data file not found');
    }

    if (!worldResponse.ok) {
      throw new Error('World map could not load');
    }

    climateData = await climateResponse.json();

    if (!Array.isArray(climateData.records) ||
        !Array.isArray(climateData.lat_centers) ||
        !Array.isArray(climateData.lon_centers)) {
      throw new Error('Invalid CMIP6 data format');
    }

    const world = await worldResponse.json();
    land = feature(world, world.objects.land);

    cells = climateData.lat_centers.flatMap(lat =>
      climateData.lon_centers.map(lon =>
        makeCell(lat, lon)
      )
    );

    if (climateData.records.some(
      record => record.values.length !== cells.length
    )) {
      throw new Error('Climate grid dimensions do not match');
    }

    status.textContent =
      'ACCESS-CM2 temperature anomalies, ' +
      '5-year running mean.';

    scheduleDraw();

  } catch (error) {
    status.textContent =
      `Climate data unavailable: ${error.message}`;

    console.error(error);
    scheduleDraw();
  }
}

window.addEventListener(
  'scroll', scheduleDraw, { passive: true }
);

window.addEventListener(
  'resize', scheduleDraw
);

initializeGlobe();
