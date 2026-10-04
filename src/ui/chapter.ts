// Chapter cards: the one bold, unboxed element. A large serif title fades in over the lower third, holds, and goes.
import { h } from './dom';

/** How long a card holds at 1x. Faster time shortens it (years are flying by), with a floor so it can still be read. */
const DURATION = 4800;
const MIN_DURATION = 2500;

/** Hold time for a card at a sim speed: 1x full length, about 3.2 s at 10x, the floor from 100x up. */
export function cardDuration(speed: number): number {
  if (!(speed > 1)) return DURATION;
  return Math.max(MIN_DURATION, Math.round(DURATION * (1 - 0.33 * Math.log10(speed))));
}

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

  /** `compact` is a smaller title that sits lower, for when time is running fast. */
  show(title: string, subtitle?: string, duration = DURATION, compact = false): void {
    this.el.classList.toggle('is-compact', compact);
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.title.textContent = title;
    this.sub.textContent = subtitle ?? '';
    this.rule.style.display = subtitle ? '' : 'none';
    this.sub.style.display = subtitle ? '' : 'none';
    this.el.classList.add('is-on');

    const opts: KeyframeAnimationOptions = { duration, fill: 'both', easing: 'linear' };
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

  /** Replace the subtitle while the card is up (no new animation), but only if it matches `pattern`. */
  setSubtitleIf(pattern: RegExp, text: string): void {
    if (!this.isOn || this.sub.style.display === 'none') return;
    if (pattern.test(this.sub.textContent ?? '') && this.sub.textContent !== text) this.sub.textContent = text;
  }

  get isOn(): boolean {
    return this.el.classList.contains('is-on');
  }

  /** The area the card's words cover, padded a little, in viewport pixels (null when no card is up). */
  bounds(): { left: number; top: number; right: number; bottom: number } | null {
    if (!this.isOn) return null;
    const a = this.title.getBoundingClientRect();
    const b = this.sub.style.display === 'none' ? a : this.sub.getBoundingClientRect();
    const pad = 18;
    return { left: Math.min(a.left, b.left) - pad, right: Math.max(a.right, b.right) + pad, top: a.top - pad, bottom: Math.max(a.bottom, b.bottom) + pad };
  }

  /** Cut the current card short (new world, hidden UI). */
  clear(): void {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.el.classList.remove('is-on');
  }
}
