import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const fireSection = document.querySelector('#fire-transition');
const emberContainer = document.querySelector('#embers');

if (fireSection && emberContainer) {
  function createEmbers() {
    const numberOfEmbers = 45;

    for (let i = 0; i < numberOfEmbers; i++) {
      const ember = document.createElement('span');
      ember.classList.add('ember');

      ember.style.left = `${Math.random() * 100}%`;
      ember.style.setProperty('--size', `${2 + Math.random() * 5}px`);
      ember.style.setProperty('--duration', `${3 + Math.random() * 6}s`);
      ember.style.setProperty('--delay', `${-Math.random() * 8}s`);
      ember.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);

      emberContainer.appendChild(ember);
    }
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function updateFireTransition(progress) {
    progress = clamp(progress);

    const fireIntensity = clamp(progress * 1.4);
    const fadeToNext = clamp((progress - 0.75) / 0.25);

    fireSection.style.setProperty('--fire-progress', fireIntensity);
    fireSection.style.setProperty('--fire-fade', fadeToNext);
  }

  createEmbers();

  const fireScroller = scrollama();

  fireScroller
    .setup({
      step: '#fire-transition .fire-scroll-track',
      offset: 0.5,
      progress: true,
      threshold: 2,
      debug: false
    })
    .onStepProgress(response => {
      updateFireTransition(response.progress);
    })
    .onStepExit(response => {
      updateFireTransition(response.direction === 'down' ? 1 : 0);
    });

  updateFireTransition(
    -fireSection.getBoundingClientRect().top /
    Math.max(1, fireSection.offsetHeight - window.innerHeight)
  );

  window.addEventListener('resize', () => {
    fireScroller.resize();
  });
}