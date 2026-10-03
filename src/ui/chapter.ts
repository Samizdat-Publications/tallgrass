// Chapter cards: the one bold, unboxed element. A large serif title fades in over the lower third, holds, and goes.
import { h } from './dom';

const DURATION = 4800;

export interface CardRequest {
  title: string;
  subtitle?: string;
}

export class ChapterCard {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private rule: HTMLElement;
  private sub: HTMLElement;
  private anims: Animation[] = [];
  private reduce: MediaQueryList;

  constructor() {
    this.title = h('div', { class: 'tg-chapter-title' });
    this.rule = h('div', { class: 'tg-chapter-rule' });
    this.sub = h('div', { class: 'tg-chapter-sub' });
    this.el = h('div', { class: 'tg-chapter', 'aria-live': 'polite', role: 'status' }, this.title, this.rule, this.sub);
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  show(title: string, subtitle?: string): void {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.title.textContent = title;
    this.sub.textContent = subtitle ?? '';
    this.rule.style.display = subtitle ? '' : 'none';
    this.sub.style.display = subtitle ? '' : 'none';
    this.el.classList.add('is-on');

    const opts: KeyframeAnimationOptions = { duration: DURATION, fill: 'both', easing: 'linear' };
    if (this.reduce.matches) {
      // No movement: the card simply appears and disappears.
      const k: Keyframe[] = [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.02 }, { opacity: 1, offset: 0.96 }, { opacity: 0, offset: 1 }];
      this.anims.push(this.el.animate(k, opts));
    } else {
      const ease = 'cubic-bezier(.2,.7,.2,1)';
      this.anims.push(
        this.title.animate(
          [
            { opacity: 0, transform: 'translateY(14px)', filter: 'blur(10px)', offset: 0, easing: ease },
            { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)', offset: 0.17 },
            { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)', offset: 0.8 },
            { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(5px)', offset: 1 },
          ],
          opts,
        ),
        this.rule.animate(
          [
            { opacity: 0, transform: 'scaleX(0)', offset: 0 },
            { opacity: 0, transform: 'scaleX(0)', offset: 0.08, easing: ease },
            { opacity: 1, transform: 'scaleX(1)', offset: 0.26 },
            { opacity: 1, transform: 'scaleX(1)', offset: 0.8 },
            { opacity: 0, transform: 'scaleX(1)', offset: 1 },
          ],
          opts,
        ),
        this.sub.animate(
          [
            { opacity: 0, transform: 'translateY(8px)', offset: 0 },
            { opacity: 0, transform: 'translateY(8px)', offset: 0.1, easing: ease },
            { opacity: 1, transform: 'translateY(0)', offset: 0.28 },
            { opacity: 1, transform: 'translateY(0)', offset: 0.8 },
            { opacity: 0, transform: 'translateY(-4px)', offset: 1 },
          ],
          opts,
        ),
      );
    }
    const last = this.anims[this.anims.length - 1];
    last.onfinish = () => {
      if (this.anims.includes(last)) {
        this.el.classList.remove('is-on');
        for (const a of this.anims) a.cancel();
        this.anims = [];
      }
    };
  }

  /** Cut the current card short (new world, hidden UI). */
  clear(): void {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.el.classList.remove('is-on');
  }
}
