// Two-cascade sun shadow with a softer hand-over between the cascades. This is three's SunLightShadow (examples/jsm/lights,
// MIT) with two changes: the cascade split leans toward uniform, so the far map is at most about 2.7 times coarser than the near
// one instead of nearly 4 times, and the blend band is a third of the near cascade's depth instead of a tenth, so the drop in shadow
// resolution fades in over tens of metres instead of showing as a hard line that crawls across the ground when the camera pans.
import * as THREE from 'three';
import { SunLightShadow } from 'three/addons/lights/SunLightShadow.js';

const CASCADES = 2; // must match the cascade count in three's sun shadow shader chunks
/** Share of the near cascade's depth range that blends into the far cascade. */
const FADE = 0.36;
/** 0 = logarithmic split, 1 = uniform split (three uses 0.5). */
const UNIFORM_WEIGHT = 0.72;

const _lightOrientation = new THREE.Matrix4();
const _viewToLight = new THREE.Matrix4();
const _lightDir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
const _near = [0, 1, 2, 3].map(() => new THREE.Vector3());
const _far = [0, 1, 2, 3].map(() => new THREE.Vector3());
const _corners = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());

export class TgSunShadow extends SunLightShadow {
  override updateMatrices(light: THREE.Light, viewCamera?: THREE.Camera): void {
    if (viewCamera === undefined) return;
    // the parent keeps its working state in underscore fields; this class fills the same ones
    const self = this as unknown as {
      _viewports: THREE.Vector4[]; _cascadeSplits: number[]; _cascadeData: THREE.Vector4[]; _cameras: THREE.OrthographicCamera[];
      _matrices: THREE.Matrix4[]; _frustums: THREE.Frustum[]; _updateMatrix: (c: THREE.Camera, m: THREE.Matrix4, f: THREE.Frustum, v: THREE.Vector4) => void;
    };
    const cam = viewCamera as THREE.PerspectiveCamera;

    // inset the cascade viewports so shadow filtering cannot read across atlas tiles
    const insetX = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.x);
    const insetY = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.y);
    for (let i = 0; i < CASCADES; i++) self._viewports[i].set(i + insetX, insetY, 1 - 2 * insetX, 1 - 2 * insetY);
    const resX = this.mapSize.x * (1 - 2 * insetX);
    const resY = this.mapSize.y * (1 - 2 * insetY);
    const resolution = Math.min(resX, resY);

    const shadowCam = this.camera as THREE.OrthographicCamera;
    const cameraNear = cam.near;
    const cameraFar = Math.max(cameraNear + 1e-6, Math.min(shadowCam.far, cam.far));

    const splits = self._cascadeSplits;
    splits[0] = cameraNear;
    for (let i = 1; i < CASCADES; i++) {
      const amount = i / CASCADES;
      const uniform = cameraNear + (cameraFar - cameraNear) * amount;
      const logarithmic = cameraNear > 0 ? cameraNear * Math.pow(cameraFar / cameraNear, amount) : uniform;
      splits[i] = uniform * UNIFORM_WEIGHT + logarithmic * (1 - UNIFORM_WEIGHT);
    }
    splits[CASCADES] = cameraFar;

    _lightDir.setFromMatrixPosition(light.matrixWorld).negate().normalize();
    _up.set(0, 1, 0);
    if (Math.abs(_up.dot(_lightDir)) > 0.99) _up.set(0, 0, 1);
    _lightOrientation.lookAt(_center.set(0, 0, 0), _lightDir, _up);
    _viewToLight.copy(_lightOrientation).transpose().multiply(cam.matrixWorld);

    const invProj = cam.projectionMatrixInverse;
    let globalMaxZ = -Infinity;
    for (let i = 0; i < 4; i++) {
      const x = i === 0 || i === 1 ? 1 : -1;
      const y = i === 0 || i === 3 ? 1 : -1;
      const nc = _near[i].set(x, y, -1).applyMatrix4(invProj);
      const fc = _far[i];
      fc.copy(nc).multiplyScalar(cameraFar / cameraNear);
      nc.applyMatrix4(_viewToLight);
      fc.applyMatrix4(_viewToLight);
      globalMaxZ = Math.max(globalMaxZ, nc.z, fc.z);
    }
    // raise the ceiling one shadow range towards the light so casters outside the view frustum still cast into it
    globalMaxZ += cameraFar;
    const shadowNear = shadowCam.near;

    for (let i = 0; i < CASCADES; i++) {
      // each cascade covers the fade band of the previous one so both can be sampled while blending
      const cascadeNear = i === 0 ? splits[0] : self._cascadeData[i - 1].z;
      const cascadeFar = splits[i + 1];
      const fadeStart = cascadeFar - FADE * (cascadeFar - splits[i]);
      self._cascadeData[i].set(i === 0 ? -1e10 : cascadeNear, cascadeFar, fadeStart, 0);

      // bounding sphere of the cascade slice for a rotation-stable projection
      const nearAlpha = (cascadeNear - cameraNear) / (cameraFar - cameraNear);
      const farAlpha = (cascadeFar - cameraNear) / (cameraFar - cameraNear);
      _center.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        _corners[j * 2].lerpVectors(_near[j], _far[j], nearAlpha);
        _corners[j * 2 + 1].lerpVectors(_near[j], _far[j], farAlpha);
        _center.add(_corners[j * 2]).add(_corners[j * 2 + 1]);
      }
      _center.multiplyScalar(1 / 8);
      let radiusSq = 0;
      let minZ = Infinity;
      for (let j = 0; j < 8; j++) {
        radiusSq = Math.max(radiusSq, _corners[j].distanceToSquared(_center));
        minZ = Math.min(minZ, _corners[j].z);
      }
      let radius = Math.sqrt(radiusSq);
      // snap to the texel grid so shadows do not shimmer when the view camera moves
      if (resolution > 1) {
        radius /= 1 - 1 / resolution;
        const texX = (2 * radius) / resX, texY = (2 * radius) / resY;
        _center.x = Math.round(_center.x / texX) * texX;
        _center.y = Math.round(_center.y / texY) * texY;
      }
      _center.z = globalMaxZ + shadowNear;
      _center.applyMatrix4(_lightOrientation);

      const c = self._cameras[i];
      c.position.copy(_center);
      c.quaternion.setFromRotationMatrix(_lightOrientation);
      c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
      c.near = shadowNear;
      c.far = globalMaxZ - minZ + 2 * shadowNear;
      c.coordinateSystem = shadowCam.coordinateSystem;
      (c as unknown as { _reversedDepth: boolean })._reversedDepth = (shadowCam as unknown as { reversedDepth: boolean }).reversedDepth;
      c.updateProjectionMatrix();
      c.updateMatrixWorld();
      self._updateMatrix(c, self._matrices[i], self._frustums[i], self._viewports[i]);
    }
  }
}
