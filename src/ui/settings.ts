// Settings: the model (what is remembered) and the panel (how it is changed). The game applies the values: picture quality,
// camera and volume go through UIActions.applySettings (see main.ts); the narrator switch goes through setNarrator; idle
// dimming and interface scale are the UI's own. Saved in localStorage, always inside try/catch.
import { segmented, slider, switchRow, type Segmented, type Slider, type SwitchRow } from './controls';
import { button, h } from './dom';
import { ModalPanel } from './panel';
import { readJson, writeJson } from './store';

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_PRESETS: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];

export interface Settings {
  quality: QualityPreset;
  /** Volumes run 0..1. */
  master: number;
  ambience: number;
  music: number;
  narration: number;
  /** The documentary camera takes over after a quiet spell. */
  autoCamera: boolean;
  /** The side panels settle to half strength when nothing has been touched for a while. */
  idleDim: boolean;
  /** Interface scale, 1 = normal. */
  uiScale: number;
  /** At 10x and 100x, moving animals leave soft fading trails on the land (render/trails.ts). */
  longExposure: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  master: 1,
  ambience: 1,
  music: 0.7,
  narration: 1,
  autoCamera: true,
  idleDim: true,
  uiScale: 1,
  longExposure: true,
};

export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.4;
export const SETTINGS_KEY = 'tallgrass.settings.v1';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Turn whatever was stored into a complete, in-range Settings (unknown or bad fields fall back to the defaults). */
export function normalizeSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof Settings, lo: number, hi: number): number => {
    const v = o[k];
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : (DEFAULT_SETTINGS[k] as number);
  };
  const bool = (k: keyof Settings): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean));
  const q = o.quality;
  return {
    quality: QUALITY_PRESETS.includes(q as QualityPreset) ? (q as QualityPreset) : DEFAULT_SETTINGS.quality,
    master: num('master', 0, 1),
    ambience: num('ambience', 0, 1),
    music: num('music', 0, 1),
    narration: num('narration', 0, 1),
    autoCamera: bool('autoCamera'),
    idleDim: bool('idleDim'),
    uiScale: num('uiScale', UI_SCALE_MIN, UI_SCALE_MAX),
    longExposure: bool('longExposure'),
  };
}

export function loadSettings(): Settings {
  return normalizeSettings(readJson<unknown>(SETTINGS_KEY, null));
}

export function saveSettings(s: Settings): void {
  writeJson(SETTINGS_KEY, s);
}

const QUALITY_NOTES: Record<QualityPreset, string> = {
  low: 'Simpler lighting and no smoothing pass, drawn at three quarters of the screen size. For older machines.',
  medium: 'Lighter shadows and grass, with a fast edge filter. Holds 60 frames a second on most laptops.',
  high: 'The look the valley was made for. Adapts its sharpness to keep 60 frames a second.',
  ultra: 'Full sharpness at all times, supersampled on ordinary screens. Needs a strong graphics card.',
};

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export class SettingsPanel extends ModalPanel {
  private quality: Segmented<QualityPreset>;
  private qualityNote: HTMLElement;
  private sliders: Record<'master' | 'ambience' | 'music' | 'narration', Slider>;
  private narrator: SwitchRow;
  private autoCam: SwitchRow;
  private idleDim: SwitchRow;
  private longExposure: SwitchRow;
  private scale: Slider;

  constructor(
    private s: Settings,
    private onChange: (s: Settings, changed: keyof Settings) => void,
    private onNarrator: (on: boolean) => void,
    onClose: () => void,
  ) {
    super({ title: 'Settings', sub: 'Saved in this browser.', cls: 'tg-settings', onClose });

    this.qualityNote = h('p', { class: 'tg-pane-note', text: QUALITY_NOTES[s.quality] });
    this.quality = segmented<QualityPreset>(
      'Picture quality',
      [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'ultra', label: 'Ultra' },
      ],
      s.quality,
      (v) => {
        this.s.quality = v;
        this.qualityNote.textContent = QUALITY_NOTES[v];
        this.commit('quality');
      },
    );

    this.longExposure = switchRow('Long exposure at speed', 'At 10x and 100x, moving herds, packs and fires leave soft fading trails on the land, like a long photograph.', s.longExposure, (on) => {
      this.s.longExposure = on;
      this.commit('longExposure');
    });

    const vol = (key: 'master' | 'ambience' | 'music' | 'narration', label: string, blurb?: string): Slider =>
      slider(label, 0, 1, 0.05, s[key], pct, (v) => {
        this.s[key] = v;
        this.commit(key);
      }, blurb);
    this.sliders = {
      master: vol('master', 'Master volume'),
      ambience: vol('ambience', 'Ambience', 'Wind, birds, water and the voices of the herds.'),
      music: vol('music', 'Music'),
      narration: vol('narration', 'Narrator voice'),
    };

    this.narrator = switchRow('Narrator', 'A quiet voice-over for the big moments, while the documentary camera is filming. Key V.', true, (on) => this.onNarrator(on));
    this.autoCam = switchRow('Documentary camera', 'After a quiet spell the camera finds the action on its own. Any touch takes it back.', s.autoCamera, (on) => {
      this.s.autoCamera = on;
      this.commit('autoCamera');
    });
    this.idleDim = switchRow('Dim the panels when idle', 'The tools button, chronicle, population and time bar fade to a faint outline after eight seconds with no pointer or key input.', s.idleDim, (on) => {
      this.s.idleDim = on;
      this.commit('idleDim');
    });
    this.scale = slider('Interface size', UI_SCALE_MIN, UI_SCALE_MAX, 0.05, s.uiScale, pct, (v) => {
      this.s.uiScale = v;
      this.commit('uiScale');
    });

    const reset = button({
      class: 'tg-notes-clear',
      text: 'Restore the defaults',
      onclick: () => {
        const narr = this.narratorState;
        this.s = { ...DEFAULT_SETTINGS };
        this.sync();
        for (const k of Object.keys(this.s) as (keyof Settings)[]) this.onChange(this.s, k);
        saveSettings(this.s);
        if (!narr) this.onNarrator(true);
      },
    });

    this.body.append(
      h('h3', { class: 'tg-pane-h', text: 'Picture' }),
      this.quality.el,
      this.qualityNote,
      this.longExposure.el,
      h('h3', { class: 'tg-pane-h', text: 'Sound' }),
      this.sliders.master.el,
      this.sliders.ambience.el,
      this.sliders.music.el,
      this.sliders.narration.el,
      h('h3', { class: 'tg-pane-h', text: 'Watching' }),
      this.narrator.el,
      this.autoCam.el,
      this.idleDim.el,
      h('h3', { class: 'tg-pane-h', text: 'Interface' }),
      this.scale.el,
      h('div', { class: 'tg-pane-foot' }, reset),
    );
  }

  private narratorState = true;

  get value(): Settings {
    return this.s;
  }

  /** Mirror the narrator switch (the game owns that choice; the V key changes it too). */
  setNarrator(on: boolean): void {
    this.narratorState = on;
    this.narrator.set(on);
  }

  /** Hide a volume that has nothing to drive yet (the audio module has no setter for that bus), rather than show a dead slider. */
  setUnavailable(key: 'ambience' | 'music' | 'narration'): void {
    this.sliders[key].el.hidden = true;
  }

  private sync(): void {
    this.quality.set(this.s.quality);
    this.qualityNote.textContent = QUALITY_NOTES[this.s.quality];
    this.sliders.master.set(this.s.master);
    this.sliders.ambience.set(this.s.ambience);
    this.sliders.music.set(this.s.music);
    this.sliders.narration.set(this.s.narration);
    this.autoCam.set(this.s.autoCamera);
    this.idleDim.set(this.s.idleDim);
    this.longExposure.set(this.s.longExposure);
    this.scale.set(this.s.uiScale);
  }

  private commit(changed: keyof Settings): void {
    saveSettings(this.s);
    this.onChange(this.s, changed);
  }
}
