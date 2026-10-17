// Tallgrass landing page: the top bar turns solid past the hero, and each clip plays only while it is on screen.
// Everything works without this script except the motion.
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection;
  // only an explicit data saver or a 2g link gets tap-to-play; browsers report 3g for plenty of usable links
  const saveData = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));

  const bar = document.querySelector('.bar');
  const hero = document.querySelector('.hero');
  const onBar = () => bar.classList.toggle('solid', window.scrollY > hero.offsetHeight - 64);
  window.addEventListener('scroll', onBar, { passive: true });
  onBar();

  const play = (v) => {
    if (saveData || reduced) {
      v.controls = true;
      return;
    }
    if (v.preload === 'none') v.preload = 'auto';
    v.play().catch(() => (v.controls = true));
  };

  const clips = [...document.querySelectorAll('video[data-inview]')];
  if (!('IntersectionObserver' in window)) {
    clips.forEach((v) => (v.controls = true));
    return;
  }
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (e.isIntersecting) play(e.target);
        else e.target.pause();
      }
    },
    { threshold: 0.4 },
  );
  clips.forEach((v) => io.observe(v));
})();
