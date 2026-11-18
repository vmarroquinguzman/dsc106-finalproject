// Intro animations

const revealItems = document.querySelectorAll('#story-intro [data-reveal]');

if ('IntersectionObserver' in window &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('js-reveal');

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
    if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
    }
    });
}, { threshold: 0.12 });

revealItems.forEach((item) => observer.observe(item));
}

const zipButton = document.querySelector('#story-zip-button');

zipButton?.addEventListener('click', () => {
const explorer = document.querySelector('#climate-explorer');
explorer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
