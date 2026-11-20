import * as d3 from
  'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

import scrollama from
  'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

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


// ======================================
// SCROLLAMA NARRATIVE
// ======================================

const heading = document.querySelector('#globe-heading');
const narrative = document.querySelector('#globe-narrative');
const globeCopy = document.querySelector('.globe-copy');
const scrollIndicator = document.querySelector('.scroll-indicator');

let storyProgress = 0;
let currentStage = -1;
let textTransition;

const storyStages = [
  {
    startYear: 1950,
    heading: "Our planet is getting warmer.",
    text: "As greenhouse gas concentrations rise, so do global temperatures. Scroll to explore how Earth's climate has changed and how it could continue changing through 2100."
  },

  {
    startYear: 2000,
    heading: "A changing climate.",
    text: "The effects of decades of greenhouse gas emissions are reflected in our changing climate. Notice how the temperature anomalies vary across the planet."
  },

  {
    startYear: 2015,
    heading: "The future is not set in stone.",
    text: "Under the high-emissions SSP3-7.0 scenario, global temperatures could continue to rise throughout the century. Other emissions pathways could produce different outcomes."
  },

  {
    startYear: 2080,
    heading: "What does this mean for San Diego?",
    text: "Global warming does not affect every region equally. From coastal communities to inland valleys, how could rising temperatures affect the place you call home?"
  }
];


function updateNarrative(year) {

  // Determine the appropriate narrative stage
  let stageIndex = 0;

  storyStages.forEach((stage, index) => {
    if (year >= stage.startYear) {
      stageIndex = index;
    }
  });

  // Hide the scroll indicator once scrolling begins
  scrollIndicator?.classList.toggle(
    'is-hidden',
    storyProgress > 0.05
  );

  // Avoid updating the text on every animation frame
  if (stageIndex === currentStage) return;

  currentStage = stageIndex;

  const stage = storyStages[stageIndex];

  clearTimeout(textTransition);

  // Fade out the current text
  globeCopy.classList.add('is-changing');

  // Replace the text and fade it back in
  textTransition = setTimeout(() => {

    heading.textContent = stage.heading;
    narrative.textContent = stage.text;

    globeCopy.classList.remove('is-changing');

  }, 300);

}



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
  return storyProgress;
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
  updateNarrative(year);

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


// ======================================
// INITIALIZE SCROLLAMA
// ======================================

// Calculate initial progress in case the page
// is refreshed halfway through the story
storyProgress = Math.max(
  0,
  Math.min(
    1,
    -section.getBoundingClientRect().top /
    Math.max(
      1,
      section.offsetHeight - window.innerHeight
    )
  )
);

const scroller = scrollama();

scroller
  .setup({
    step: '#globe-story .globe-scroll-track',
    offset: 0.5,
    progress: true,
    threshold: 2,
    debug: false
  })

  .onStepProgress(response => {

    // Smoothly update the globe as the user scrolls
    storyProgress = Math.max(
      0,
      Math.min(1, response.progress)
    );

    scheduleDraw();

  })

  .onStepExit(response => {

    // Ensure the globe reaches the start or end
    storyProgress =
      response.direction === 'down' ? 1 : 0;

    scheduleDraw();

  });

// Update the layout when the window changes size
window.addEventListener('resize', () => {
  scroller.resize();
  scheduleDraw();
});

// Load the existing climate data
initializeGlobe();

