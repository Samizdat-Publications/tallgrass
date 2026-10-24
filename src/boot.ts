// The page's entry. It decides, before any of the heavy code is fetched, whether this device can run Tallgrass: a browser without
// WebGL2 gets a calm card, a phone gets a softer one with a way through ("Try anyway"). Everything else loads the game (src/main.ts).
// The splash poster and its styles are in index.html, so all of this paints over the valley still, never over a blank page.
import { LANDING_URL, detect, hasWebGL2 } from './support';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function link(text: string, href: string, primary: boolean): HTMLAnchorElement {
  const a = el('a', 'sp-btn' + (primary ? ' is-primary' : ''), text);
  a.href = href;
  return a;
}

/** A full-screen card over the splash poster. Returns a function that removes it. */
function showCard(message: string, buttons: HTMLElement[]): () => void {
  const host = document.getElementById('splash') ?? document.body;
  host.querySelector('.sp-msg')?.setAttribute('hidden', '');
  (host as HTMLElement).setAttribute('aria-label', 'Tallgrass');
  const card = el('div', 'sp-card');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-label', 'Tallgrass');
  const inner = el('div', 'sp-card-in');
  inner.append(el('h1', undefined, 'Tallgrass'), el('hr'), el('p', undefined, message));
  if (buttons.length) {
    const row = el('div', 'sp-card-btns');
    row.append(...buttons);
    inner.append(row);
  }
  card.append(inner);
  host.append(card);
  void card.offsetWidth;
  card.classList.add('is-on');
  buttons[0]?.focus({ preventScroll: true });
  return () => {
    card.remove();
    host.querySelector('.sp-msg')?.removeAttribute('hidden');
    (host as HTMLElement).setAttribute('aria-label', 'Preparing the valley');
  };
}

function showNoWebGL2(): void {
  showCard('Tallgrass needs WebGL2, which this browser does not offer. It runs best in Chrome or Edge on a desktop.', [link('Visit tallgrass.pages.dev', LANDING_URL, true)]);
}

function showPhone(onTryAnyway: () => void): void {
  const tryBtn = el('button', 'sp-btn', 'Try anyway');
  tryBtn.type = 'button';
  let remove = (): void => {};
  tryBtn.addEventListener('click', () => {
    remove();
    onTryAnyway();
  });
  remove = showCard('Tallgrass is made for a desktop browser with a mouse and keyboard.', [link('See the valley on the landing page', LANDING_URL, true), tryBtn]);
}

async function startGame(): Promise<void> {
  try {
    await import('./main');
  } catch (e) {
    console.error('Tallgrass failed to start', e);
    // a context that would not be created is the one failure worth a plain explanation; anything else gets a reload
    if (!hasWebGL2(location.search)) showNoWebGL2();
    else {
      const again = el('button', 'sp-btn is-primary', 'Reload');
      again.type = 'button';
      again.addEventListener('click', () => location.reload());
      showCard('Tallgrass could not start in this browser. Reloading the page sometimes helps.', [again, link('Landing page', LANDING_URL, false)]);
    }
  }
}

const verdict = detect(location.search);
if (verdict === 'nowebgl2') showNoWebGL2();
else if (verdict === 'phone') showPhone(() => void startGame());
else void startGame();

