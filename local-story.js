
import scrollama from
  'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// ======================================
// CHAPTER 2: SAN DIEGO STORY
// ======================================

const localImage = document.querySelector('#local-image');

const localCaption =
  document.querySelector('#local-image-caption');

const localSteps =
  document.querySelectorAll('.local-step');

const localStages = [
  {
    image: 'images/san-diego.jpg',
    caption: 'San Diego County',
    alt: 'San Diego city and coastline'
  },
  {
    image: 'images/coast.jpg',
    caption: 'Coastal San Diego',
    alt: 'San Diego coastal landscape'
  },
  {
    image: 'images/inland.jpg',
    caption: 'Inland valleys',
    alt: 'Inland San Diego County landscape'
  },
  {
    image: 'images/desert.jpg',
    caption: 'Anza-Borrego Desert',
    alt: 'Eastern San Diego County desert landscape'
  }
];

// Preload photographs for smoother transitions

localStages.forEach(stage => {
  const image = new Image();
  image.src = stage.image;
});

let currentLocalStage = -1;
let imageTransition;

// ======================================
// UPDATE THE VISUAL
// ======================================

function updateLocalStory(index) {

  const stage = localStages[index];

  if (!stage) return;

  // Highlight the current text
  localSteps.forEach((step, i) => {
    step.classList.toggle(
      'is-active',
      i === index
    );
  });

  if (index === currentLocalStage) return;

  currentLocalStage = index;

  clearTimeout(imageTransition);

  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (reducedMotion) {
    localImage.src = stage.image;
    localImage.alt = stage.alt;
    localCaption.textContent = stage.caption;
    return;
  }

  // Fade out photograph
  localImage.classList.add('is-changing');

  // Change image and fade it back in
  imageTransition = setTimeout(() => {

    localImage.src = stage.image;
    localImage.alt = stage.alt;
    localCaption.textContent = stage.caption;

    localImage.classList.remove('is-changing');

  }, 350);

}

// ======================================
// INITIALIZE SCROLLAMA
// ======================================

const localScroller = scrollama();

localScroller
  .setup({
    step: '.local-step',
    offset: 0.65,
    debug: false
  })

  .onStepEnter(response => {
    updateLocalStory(response.index);
  });

// Display first stage initially
updateLocalStory(0);

// Handle browser resizing
window.addEventListener('resize', () => {
  localScroller.resize();
});
