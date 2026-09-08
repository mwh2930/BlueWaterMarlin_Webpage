/* Progressive enhancement: source text and diagrams are readable without JS. */
(() => {
  'use strict';
  const page = document.querySelector('.sources-page');
  const button = document.querySelector('.s-motion-toggle');
  if (!page || !button || !window.matchMedia) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const icon = button.querySelector('.s-motion-icon');
  let manuallyPaused = false;

  const update = () => {
    const paused = preference.matches || manuallyPaused;
    page.dataset.motion = paused ? 'paused' : 'running';
    page.toggleAttribute('data-page-hidden', document.hidden);
    button.setAttribute('aria-pressed', String(paused));
    button.disabled = preference.matches;
    // A toggle's visible/accessibility label stays constant; pressed means paused.
    button.title = preference.matches ? 'Motion is disabled by your reduced-motion setting.' : paused ? 'Resume motion' : 'Pause motion';
    button.setAttribute('aria-description', preference.matches ? 'Your system preference keeps illustrations static.' : paused ? 'Motion is paused. Press again to resume.' : 'Illustrative motion is running.');
    icon.textContent = paused ? '▷' : 'Ⅱ';
  };

  // Attach animations paused; run only the figures currently in view.
  page.setAttribute('data-motion-ready', '');
  const figures = page.querySelectorAll('.s-animated');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting));
    }, { threshold: 0 });
    figures.forEach((figure) => observer.observe(figure));
  } else {
    figures.forEach((figure) => figure.classList.add('is-visible'));
  }

  button.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;
    update();
  });
  if (preference.addEventListener) preference.addEventListener('change', update);
  else preference.addListener(update);
  document.addEventListener('visibilitychange', update);
  update();
  button.hidden = false;
})();
