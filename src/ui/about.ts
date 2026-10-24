// About Tallgrass: what the game is, who made it, where to find the project, and the credits for everything borrowed.
// A page in the same family as settings and the field guide (see panel.ts); opened from the last row of the menu.
import './about.css';
import { h } from './dom';
import { ModalPanel } from './panel';

interface Credit {
  /** What the thing is ("Bison model"). */
  what: string;
  /** Its title, when it has one worth quoting. */
  title?: string;
  by: string;
  licence: string;
  url?: string;
}

const SKETCHFAB = 'https://sketchfab.com/3d-models/';

const MODEL_CREDITS: Credit[] = [
  { what: 'Bison model', title: 'Bison - animal', by: 'Brian Trepanier', licence: 'CC BY 4.0', url: `${SKETCHFAB}bison-animal-4b8f112fffb84ce19dac2578b39e03b1` },
  { what: 'Wolf model', by: 'WildMesh 3D', licence: 'CC BY-NC 4.0', url: `${SKETCHFAB}wolf-realistic-3d-model-demo-free-8840b859a566485c874a27b1731e1db8` },
  { what: 'Mule deer model', by: 'WildMesh 3D', licence: 'CC BY-NC 4.0', url: `${SKETCHFAB}deer-realistic-3d-model-demo-free-3997d669818c4e0d8c8bcafb0a1ae2ee` },
  { what: 'Pronghorn model', by: 'FennecFyre', licence: 'CC BY-NC 4.0', url: `${SKETCHFAB}pronghorn-a8cb6abfb49841ed97f8480a36c26b3b` },
  { what: 'Coyote model', by: 'Raven-Woods', licence: 'CC BY 4.0', url: `${SKETCHFAB}coyote-e350e508749c45baab4df6fb6cba8cd9` },
  { what: 'Cougar model', title: 'Puma Gray', by: '1225659838@qq.com on Sketchfab', licence: 'CC BY 4.0', url: `${SKETCHFAB}puma-gray-90f0fd2c4ce24d05acce011256953ca5` },
];

const OTHER_CREDITS: Credit[] = [
  { what: 'Ground textures', by: 'Poly Haven', licence: 'CC0', url: 'https://polyhaven.com' },
  { what: 'Tree branch generator, ported from ez-tree', by: 'Daniel Greenheck', licence: 'MIT', url: 'https://github.com/dgreenheck/ez-tree' },
  { what: 'Alegreya and Alegreya Sans', by: 'Juan Pablo del Peral, Huerta Tipografica', licence: 'SIL OFL 1.1', url: 'https://www.huertatipografica.com' },
  { what: 'three.js', by: 'the three.js authors', licence: 'MIT', url: 'https://threejs.org' },
  { what: 'Sound, music and narration', by: 'generated with ElevenLabs for this project', licence: 'made for Tallgrass' },
];

/** An outside link: a new tab, and no handle back to this page. */
function link(cls: string, text: string, href: string): HTMLAnchorElement {
  return h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer', text });
}

function creditRow(c: Credit): HTMLElement {
  const label = c.title ? `${c.what}, “${c.title}”` : c.what;
  const head = c.url ? link('tg-about-credit-name', label, c.url) : h('span', { class: 'tg-about-credit-name', text: label });
  return h('li', { class: 'tg-about-credit' }, head, h('span', { class: 'tg-about-credit-by', text: c.by }), h('span', { class: 'tg-about-credit-lic', text: c.licence }));
}

/** "1.2.3" -> "1.2"; anything unreadable shows as is. */
export function displayVersion(v: string): string {
  const m = /^(\d+)\.(\d+)/.exec(v);
  return m ? `${m[1]}.${m[2]}` : v;
}

export class AboutPanel extends ModalPanel {
  constructor(onClose: () => void) {
    // the guard keeps node-side tests (no vite define) from tripping over the global
    const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
    super({ title: 'About Tallgrass', sub: `Version ${displayVersion(version)}`, cls: 'tg-about', onClose });
    this.body.tabIndex = 0;
    this.body.setAttribute('role', 'region');
    this.body.setAttribute('aria-label', 'About Tallgrass');

    this.body.append(
      h('p', {
        class: 'tg-about-lede',
        text: 'A living prairie you can leave running. The valley is a deterministic simulation first: bison, pronghorn, mule deer, wolves, coyotes, cougars, ravens and the smaller lives around them find their own balance, and the picture only shows what the simulation does.',
      }),
      h('p', { class: 'tg-about-by', text: 'Built by Claude Code agents, directed by Stewart Gregerson.' }),
      h(
        'div',
        { class: 'tg-about-links' },
        link('tg-btn', 'About the project', 'https://tallgrass.pages.dev'),
        link('tg-btn', 'Source on GitHub', 'https://github.com/Samizdat-Publications/tallgrass'),
      ),
      h('h3', { class: 'tg-pane-h', text: 'Credits' }),
      h('ul', { class: 'tg-about-credits' }, ...MODEL_CREDITS.map(creditRow)),
      h('p', { class: 'tg-pane-note', text: 'All animal models were modified: decimated, retargeted to the game’s own rig and rebaked.' }),
      h('ul', { class: 'tg-about-credits' }, ...OTHER_CREDITS.map(creditRow)),
      h('p', { class: 'tg-about-foot', text: 'Code: MIT licence. Third-party assets keep their own licences.' }),
    );
  }

  protected override onShow(): void {
    // keyboard users land inside the page (and can scroll it with the arrow keys); Esc closes it from there
    this.body.scrollTop = 0;
    this.body.focus({ preventScroll: true });
  }
}
