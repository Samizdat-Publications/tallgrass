// The sky fragment shader as it was before R9 (git 590e852), kept for the A/B GPU bench (tools/r9_nightbench.mjs).
// The @@NAME@@ tokens stand for the page's own NOISE_GLSL, CLOUD_GLSL, SKY_GLSL and STORM_SKY_GLSL chunks (the bench substitutes them).
export const LEGACY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uSunDiskColor;
uniform float uNight;
uniform float uCloud;
uniform float uOvercast;
uniform vec3 uWind;
// storms (R4): gloom toward each cell, the lightning flash and the rainbow
uniform float uStormOn;
uniform vec4 uFlashSky;
uniform float uRainbow;
@@NOISE_GLSL@@
@@CLOUD_GLSL@@
@@SKY_GLSL@@
@@STORM_SKY_GLSL@@
void main() {
  vec3 d = normalize(vDir);
  vec3 col = tgSkyBase(d);
  float up = d.y;

  // stars + faint galactic band
  if (uNight > 0.01 && up > 0.0) {
    vec3 p = d * 150.0;
    vec3 ip = floor(p);
    vec3 fp = fract(p) - 0.5;
    float h = tgHash31(ip);
    vec3 jit = vec3(tgHash31(ip + 7.1), tgHash31(ip + 13.7), tgHash31(ip + 29.3)) - 0.5;
    float dd = length(fp - jit * 0.55);
    float star = smoothstep(0.14, 0.0, dd) * step(0.975, h) * (0.6 + 2.6 * tgHash31(ip + 3.3));
    star *= 0.75 + 0.25 * sin(uTime * 2.5 + h * 80.0);
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.75, 0.55))) * 3.2, 2.0));
    float mw = band * (0.015 + 0.035 * tgNoise3(d * 7.0));
    float vis = uNight * smoothstep(0.0, 0.12, up) * (1.0 - uOvercast);
    col += (vec3(star) * vec3(0.9, 0.95, 1.2) + vec3(0.5, 0.6, 1.0) * mw) * vis;
  }

  // sun disk
  float mu = dot(d, uSunDir);
  float disk = smoothstep(0.99992, 0.999975, mu) * smoothstep(-0.015, 0.02, d.y);
  col += uSunDiskColor * disk * 16.0 * (1.0 - uOvercast * 0.85);

  // moon
  float mm = dot(d, uMoonDir);
  float moonVis = smoothstep(-0.02, 0.05, uMoonDir.y) * uNight;
  float mdisk = smoothstep(0.99965, 0.99978, mm);
  col += vec3(0.84, 0.9, 1.0) * mdisk * 4.2 * moonVis * (1.0 - uOvercast * 0.8);
  col += vec3(0.4, 0.5, 0.9) * (0.16 * pow(max(mm, 0.0), 400.0) + 0.06 * pow(max(mm, 0.0), 60.0) + 0.02 * pow(max(mm, 0.0), 8.0)) * moonVis;
  // a faint warm band hugging the horizon all night, like the last of the dusk
  col += vec3(0.62, 0.3, 0.14) * 0.16 * uNight * smoothstep(0.1, 0.0, up) * smoothstep(-0.02, 0.01, up) * (1.0 - uOvercast * 0.7);

  // clouds: projected layer, lit from the sun side, golden edges at dusk and dawn
  if (up > 0.0) {
    vec2 cp = tgCloudCp(d);
    vec2 drift = tgCloudDrift(uWind, uTime);
    // twilight: the sun is low or just set, so the cloud deck is lit from below
    float tw = smoothstep(0.42, 0.04, uSunDir.y) * smoothstep(-0.26, -0.03, uSunDir.y);
    vec2 q = tgCloudQ(cp, drift);
    float cn = tgFbm2(q);
    float cn2 = tgFbm2(q + uSunDir.xz * 0.12);
    float th = tgCloudThresh(uCloud, tw);
    float dens = smoothstep(th, th + 0.2, cn) * smoothstep(0.0, 0.16, up);
    float lit = clamp(0.55 + (cn - cn2) * 5.0, 0.0, 1.0);
    vec3 shade = uSkyMid * 0.75 + uSkyHorizon * 0.15;
    vec3 sunlit = uSkyHorizon * 0.9 + uSunGlow * 0.55 + 0.12;
    vec3 cc = mix(shade, sunlit, lit);
    cc = mix(cc, vec3(dot(cc, vec3(0.333))) * vec3(0.8, 0.84, 0.92), uOvercast * 0.7);
    // underlit by the low sun: gold on the sun's side of the sky, rose on the far side, brightest along the cloud's lit edges
    float sunSide = 0.5 + 0.5 * dot(normalize(uSunDir.xz + vec2(1e-4)), normalize(d.xz + vec2(1e-4)));
    vec3 under = mix(vec3(0.95, 0.5, 0.4), uSunGlow * 1.1 + vec3(0.1, 0.05, 0.0), sunSide);
    cc = mix(cc, under * (0.5 + 0.75 * lit) * (0.55 + 0.6 * sunSide), tw * 0.8 * (1.0 - uOvercast));
    // thin cloud lets the sky through; thick cloud is opaque
    col = mix(col, cc, dens * (0.55 + 0.4 * uCloud + 0.15 * tw));
    // high cirrus: long, thin streaks across the sky, catching the low sun's colour at dusk and dawn
    float ci = tgFbm2(vec2(cp.x * 0.15 + drift.x * 0.6, cp.y * 1.2 + drift.y * 0.6) + 31.0);
    float cir = smoothstep(0.5, 0.75, ci) * smoothstep(0.04, 0.3, up) * (1.0 - uOvercast) * mix(0.32, 0.7, tw);
    vec3 cirC = mix(uSkyHorizon * 0.9 + vec3(0.08), under * (0.6 + 0.5 * sunSide), tw);
    col = mix(col, cirC, cir * 0.7);
  }

  // storm gloom: the sky darkens and cools toward each cell (the distance haze takes the same tint, see post.ts)
  if (uStormOn > 0.5) col = tgStormTint(col, tgStormGloom(d));
  // rainbow: an arc 40 to 42.4 degrees around the antisolar point, violet inside and red outside, with a faint secondary bow
  if (uRainbow > 0.002 && up > -0.02) {
    float ang = degrees(acos(clamp(dot(d, -uSunDir), -1.0, 1.0)));
    float t1 = (ang - 39.6) / 3.0;
    float t2 = (ang - 50.5) / 3.6;
    float b1 = smoothstep(-0.3, 0.1, t1) * smoothstep(1.3, 0.9, t1);
    float b2 = smoothstep(-0.3, 0.1, t2) * smoothstep(1.3, 0.9, t2) * 0.28;
    if (b1 + b2 > 0.002) {
      float hue = clamp(1.0 - clamp(t1, 0.0, 1.0), 0.0, 1.0) * 0.76;
      float hue2 = clamp(clamp(t2, 0.0, 1.0), 0.0, 1.0) * 0.76;
      vec3 c1 = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      vec3 c2 = clamp(abs(mod(hue2 * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      float sunVis = smoothstep(0.0, 0.1, uSunDir.y);
      col += (c1 * b1 + c2 * b2) * uRainbow * sunVis * smoothstep(-0.02, 0.05, up) * (1.0 - 0.55 * uOvercast) * (0.14 + 0.3 * (1.0 - dot(col, vec3(0.3333))));
    }
  }
  // lightning flash: the whole dome brightens, most toward the strike
  if (uFlashSky.w > 0.002) col += vec3(0.62, 0.7, 1.0) * uFlashSky.w * (0.3 + 0.9 * pow(max(dot(d, uFlashSky.xyz), 0.0), 3.0));

  gl_FragColor = vec4(col, 1.0);
}
`;
