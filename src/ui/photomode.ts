// Lens (R15): the photo mode panel (P opens it) and the controller that drives depth of field, film grain, the colour fringe and
// exposure from it, from the documentary camera's close shots and from cinematic mode. The passes themselves live in
// render/post.ts (DofPass, FinishPass); this file decides what they are told each frame. Everything here is off by default:
// with the panel closed, the director off of close shots and cinematic mode off, the controller sends zeros and the passes skip.
import * as THREE from 'three';
import { SPECIES } from '../sim/species';
import { segmented, slider, switchRow, type Segmented, type Slider, type SwitchRow } from './controls';
import { button, h, setText } from './dom';
import { icon } from './icons';

export type PhotoFormat = 'png' | 'jpeg';
/** What the focus follows: the animal selected in the game, the centre of the view, or (after a click on the view) a picked animal or spot. */
export type FocusMode = 'auto' | 'selected' | 'centre' | 'picked';

export interface PhotoState {
  /** Exposure in stops, -2 to +2. */
  exposure: number;
  /** 0 = no depth of field, 1 = widest aperture (shallowest focus). */
  aperture: number;
  /** Pause the sim while the panel is open (the speed comes back when it closes). */
  freeze: boolean;
  /** Fade the rest of the interface away, leaving only this panel. */
  hideUi: boolean;
  grain: boolean;
  format: PhotoFormat;
}

export const PHOTO_DEFAULTS: PhotoState = { exposure: 0, aperture: 0, freeze: true, hideUi: false, grain: false, format: 'png' };
export const JPEG_QUALITY = 0.9;

/** Far blur as a fraction of the image height, for the documentary camera's close shots (gentle) and for the widest photo aperture. */
export const DIRECTOR_BLUR = 0.008;
export const PHOTO_BLUR_MAX = 0.038;
/** Film grain amplitude and fringe (pixels at the corners, each way) in cinematic mode. */
export const CINE_GRAIN = 0.022;
export const CINE_FRINGE = 0.45;
export const PHOTO_GRAIN = 0.03;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The aperture slider (0..1) as the far blur fraction the post pass takes. Eased so the first half of the slider stays gentle. */
export function apertureToBlur(a: number): number {
  const t = clamp(a, 0, 1);
  return t < 0.04 ? 0 : PHOTO_BLUR_MAX * Math.pow(t, 1.5);
}

/** The slider's label: Off, or an f-number from f/16 (almost no blur) down to f/2 (the widest). */
export function apertureLabel(a: number): string {
  return a < 0.04 ? 'Off' : `f/${(16 - 14 * clamp(a, 0, 1)).toFixed(1)}`;
}

export function exposureLabel(ev: number): string {
  return Math.abs(ev) < 0.05 ? '0 EV' : `${ev > 0 ? '+' : ''}${ev.toFixed(1)} EV`;
}

const _fwd = new THREE.Vector3();
/** Distance from the camera to a point, measured along the view axis (what the depth buffer holds), floored at a tenth of a metre. */
export function viewDepth(camera: THREE.Camera, p: THREE.Vector3): number {
  camera.getWorldDirection(_fwd);
  return Math.max(0.1, (p.x - camera.position.x) * _fwd.x + (p.y - camera.position.y) * _fwd.y + (p.z - camera.position.z) * _fwd.z);
}

// ---------------------------------------------------------------------------------------------------- controller

export interface LensDeps {
  camera: THREE.PerspectiveCamera;
  post: {
    setDof(blur: number, focus: number, taps?: number): void;
    setLens(grain: number, fringePx: number): void;
  };
  /** World position of an animal by id (false when it is gone). */
  animalPos(id: number, out: THREE.Vector3): boolean;
  speciesOf(id: number): number | null;
  /** Where the camera looks (the orbit pivot, on the ground). */
  pivot(out: THREE.Vector3): THREE.Vector3;
  selectedId(): number | null;
  /** The documentary camera: the subject of a close shot, or null. */
  director: { closeShot(): { id: number | null; x: number; y: number; dist: number } | null };
  /** Multiplier on the scene exposure (1 = as the sky and the calendar set it). */
  setExposure(mult: number): void;
}

export class LensController {
  photoOpen = false;
  state: PhotoState = { ...PHOTO_DEFAULTS };
  /** Cinematic mode (C): film grain and a faint colour fringe. */
  cinematic = false;
  /** Cinematic mode adds the grain and the fringe (?lens=0 turns that off, for captures that must stay clean). */
  cinematicLook = true;
  /** The documentary camera's close shots rack focus on their subject (?dof=0 turns that off). */
  directorDof = true;
  mode: FocusMode = 'auto';
  /** Called a few times a second with what the focus is on (text, species id or null) while the panel is open. */
  onLabel: (text: string, sp: number | null) => void = () => {};

  private pickedId: number | null = null;
  private picked = new THREE.Vector3();
  private blur = 0;
  private focus = 30;
  private focusSet = false;
  private grain = 0;
  private fringe = 0;
  private lensOn = false;
  private expo = 1;
  private labelAt = -Infinity;
  private lastLabel = '';
  private v = new THREE.Vector3();

  constructor(private d: LensDeps) {}

  /** The current far blur (fraction of the image height) and focus distance, for tests and captures. */
  get current(): { blur: number; focus: number; grain: number; fringe: number } {
    return { blur: this.blur, focus: this.focus, grain: this.grain, fringe: this.fringe };
  }

  setMode(m: FocusMode): void { this.mode = m; this.focusSet = false; }
  focusAnimal(id: number): void { this.mode = 'picked'; this.pickedId = id; this.focusSet = false; }
  focusPoint(x: number, y: number, z: number): void { this.mode = 'picked'; this.pickedId = null; this.picked.set(x, y, z); this.focusSet = false; }

  /** Where the focus is, in the shared vector `v`, and what it is called. */
  private resolve(label: boolean): { sp: number | null; text: string } {
    const v = this.v;
    const animal = (id: number | null, what: string): { sp: number | null; text: string } | null => {
      if (id === null || !this.d.animalPos(id, v)) return null;
      const sp = label ? this.d.speciesOf(id) : null;
      return { sp, text: sp !== null && SPECIES[sp] ? SPECIES[sp].name : what };
    };
    if (this.mode === 'picked') {
      const a = animal(this.pickedId, 'Animal');
      if (a) return a;
      if (this.pickedId === null) { v.copy(this.picked); return { sp: null, text: 'The spot you clicked' }; }
      this.mode = 'auto'; // the animal is gone
    }
    if (this.mode !== 'centre') {
      const a = animal(this.d.selectedId(), 'Selected animal');
      if (a) return a;
    }
    this.d.pivot(v);
    return { sp: null, text: 'Centre of the view' };
  }

  update(dt: number): void {
    let blurT = 0;
    let have = false;
    let tau = 0.7;
    let focusTau = 0.35;
    const photo = this.photoOpen;
    if (photo) {
      blurT = apertureToBlur(this.state.aperture);
      tau = 0.15;
      focusTau = 0.1;
      const now = performance.now();
      const due = now - this.labelAt > 200;
      const r = this.resolve(due);
      have = true;
      if (due) {
        this.labelAt = now;
        const text = `${r.text}, ${Math.round(viewDepth(this.d.camera, this.v))} m`;
        if (text !== this.lastLabel) { this.lastLabel = text; this.onLabel(text, r.sp); }
      }
    } else if (this.directorDof) {
      const cs = this.d.director.closeShot();
      if (cs) {
        blurT = DIRECTOR_BLUR;
        have = true;
        if (cs.id === null || !this.d.animalPos(cs.id, this.v)) this.d.pivot(this.v);
      }
    }

    // blur eases toward its target; a pass that has faded out stays off
    this.blur += (blurT - this.blur) * (1 - Math.exp(-dt / tau));
    if (blurT === 0 && this.blur < 0.0004) this.blur = 0;
    if (have && (this.blur > 0.0004 || blurT > 0)) {
      const z = viewDepth(this.d.camera, this.v);
      if (!this.focusSet || this.blur < 0.0006) { this.focus = z; this.focusSet = true; }
      else this.focus = Math.exp(Math.log(this.focus) + (Math.log(z) - Math.log(this.focus)) * (1 - Math.exp(-dt / focusTau)));
    } else if (!have) {
      this.focusSet = false;
    }
    this.d.post.setDof(this.blur, this.focus, 24);

    // film grain and the fringe: cinematic mode, and the panel's grain switch
    const cine = this.cinematic && this.cinematicLook;
    const grainT = Math.max(cine ? CINE_GRAIN : 0, photo && this.state.grain ? PHOTO_GRAIN : 0);
    const fringeT = cine ? CINE_FRINGE : 0;
    const k = 1 - Math.exp(-dt / 0.5);
    this.grain += (grainT - this.grain) * k;
    this.fringe += (fringeT - this.fringe) * k;
    if (grainT === 0 && this.grain < 0.0008) this.grain = 0;
    if (fringeT === 0 && this.fringe < 0.01) this.fringe = 0;
    if (this.grain > 0 || this.fringe > 0 || this.lensOn) {
      this.d.post.setLens(this.grain, this.fringe);
      this.lensOn = this.grain > 0 || this.fringe > 0;
    }

    const e = photo ? Math.pow(2, clamp(this.state.exposure, -2, 2)) : 1;
    if (e !== this.expo) { this.expo = e; this.d.setExposure(e); }
  }
}

// ---------------------------------------------------------------------------------------------------- the panel

/** The photo mode page: a docked glass panel (it must not close on a click outside, since a click on the view picks the focus). */
export class PhotoPanel {
  readonly el: HTMLElement;
  readonly state: PhotoState = { ...PHOTO_DEFAULTS };
  /** The game wires these (one listener each). */
  onSave: (format: PhotoFormat) => void = () => {};
  onFocusMode: (m: FocusMode) => void = () => {};
  private changeFns: Array<(s: PhotoState, changed: keyof PhotoState) => void> = [];
  private openFns: Array<(open: boolean) => void> = [];

  private open = false;
  private closeTimer = 0;
  private focusSeg: Segmented<FocusMode>;
  private focusText: HTMLElement;
  private focusDot: HTMLElement;
  private aperture: Slider;
  private exposure: Slider;
  private grain: SwitchRow;
  private freeze: SwitchRow;
  private hide: SwitchRow;
  private format: Segmented<PhotoFormat>;
  private saveBtn: HTMLButtonElement;

  constructor() {
    const s = this.state;
    this.focusSeg = segmented<FocusMode>(
      'Focus on',
      [
        { id: 'auto', label: 'Auto', title: 'The animal selected in the game, else the centre of the view' },
        { id: 'selected', label: 'Animal', title: 'The selected animal' },
        { id: 'centre', label: 'Centre', title: 'Whatever is at the centre of the view' },
      ],
      'auto',
      (m) => this.onFocusMode(m),
    );
    this.focusDot = h('i', { class: 'tg-photo-dot', 'aria-hidden': 'true' });
    this.focusText = h('span', { class: 'tg-photo-focustext', text: 'Centre of the view' });
    const focusLine = h('p', { class: 'tg-photo-focus', role: 'status', 'aria-live': 'off' }, this.focusDot, this.focusText);

    this.aperture = slider('Aperture', 0, 1, 0.05, s.aperture, apertureLabel, (v) => this.set('aperture', v), 'Wider (a smaller f-number) puts more of the valley out of focus.');
    this.exposure = slider('Exposure', -2, 2, 0.1, s.exposure, exposureLabel,(v) => this.set('exposure', v));
    this.grain = switchRow('Film grain', 'A fine, even grain, strongest in the mid tones.', s.grain, (on) => this.set('grain', on));
    this.freeze = switchRow('Freeze time', 'Pauses the valley while this page is open, and sets it going again after.', s.freeze, (on) => this.set('freeze', on));
    this.hide = switchRow('Hide the interface', 'Fades everything but this page. A saved picture never carries the interface.', s.hideUi, (on) => this.set('hideUi', on));
    this.format = segmented<PhotoFormat>(
      'Format',
      [
        { id: 'png', label: 'PNG', title: 'Lossless' },
        { id: 'jpeg', label: 'JPEG', title: 'Smaller, quality 90' },
      ],
      s.format,
      (f) => this.set('format', f),
    );
    this.saveBtn = button(
      { class: 'tg-btn is-primary tg-photo-save', title: 'Save this view as a picture', onclick: () => this.onSave(this.state.format) },
      h('span', { class: 'tg-guide-shootic', html: icon('camera', 16) }),
      'Save',
    );

    this.el = h(
      'section',
      { class: 'tg-pane tg-glass tg-photo', role: 'dialog', 'aria-label': 'Photo mode', hidden: true },
      h(
        'header',
        { class: 'tg-pane-head' },
        h('h2', { class: 'tg-pane-title', text: 'Photo mode' }),
        h('span', { class: 'tg-pane-extra' }),
        button({ class: 'tg-iconbtn', 'aria-label': 'Close photo mode', title: 'Close (P or Esc)', html: icon('close', 16), onclick: () => this.close() }),
      ),
      h('p', { class: 'tg-pane-sub', text: 'Click the view to focus on an animal or a spot.' }),
      h(
        'div',
        { class: 'tg-pane-body' },
        h('h3', { class: 'tg-pane-h', text: 'Focus' }),
        this.focusSeg.el,
        focusLine,
        h('h3', { class: 'tg-pane-h', text: 'Lens' }),
        this.aperture.el,
        this.exposure.el,
        this.grain.el,
        h('h3', { class: 'tg-pane-h', text: 'Frame' }),
        this.freeze.el,
        this.hide.el,
        h('div', { class: 'tg-pane-foot tg-photo-foot' }, this.format.el, this.saveBtn),
      ),
    );
  }

  get isOpen(): boolean { return this.open; }

  /** Change one value from outside (tests, the game) and tell the listeners, as if the page had. */
  set<K extends keyof PhotoState>(key: K, value: PhotoState[K]): void {
    (this.state as unknown as Record<string, unknown>)[key] = value;
    if (key === 'aperture') this.aperture.set(value as number);
    else if (key === 'exposure') this.exposure.set(value as number);
    else if (key === 'grain') this.grain.set(value as boolean);
    else if (key === 'freeze') this.freeze.set(value as boolean);
    else if (key === 'hideUi') this.hide.set(value as boolean);
    else if (key === 'format') this.format.set(value as PhotoFormat);
    for (const f of this.changeFns) f(this.state, key);
  }

  /** Listen for a value changing (from the page or from `set`). */
  onChange(fn: (s: PhotoState, changed: keyof PhotoState) => void): void { this.changeFns.push(fn); }
  /** Listen for the page opening or closing. */
  onOpenChange(fn: (open: boolean) => void): void { this.openFns.push(fn); }

  show(): void {
    if (this.open) return;
    window.clearTimeout(this.closeTimer);
    this.open = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-open');
    for (const f of this.openFns) f(true);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('is-open');
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 200);
    for (const f of this.openFns) f(false);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  /** Mirror the focus mode in the segmented choice ('picked' leaves none lit). */
  setFocusMode(m: FocusMode): void { this.focusSeg.set(m); }

  setFocusLabel(text: string, sp: number | null): void {
    setText(this.focusText, text);
    if (sp !== null && SPECIES[sp]) this.focusDot.style.setProperty('background', `var(--sp-${sp})`);
    else this.focusDot.style.removeProperty('background');
    this.focusDot.classList.toggle('is-species', sp !== null && !!SPECIES[sp]);
  }

  /** The Save button shows a busy state while the picture is made. */
  setSaving(on: boolean): void {
    this.saveBtn.disabled = on;
  }

  destroy(): void {
    window.clearTimeout(this.closeTimer);
  }
}
