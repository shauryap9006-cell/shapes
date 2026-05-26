import type { HandLandmark } from "@/types/mediapipe.types";
import type { VectorTuple } from "@/types/scene.types";

// These must match the Three.js camera exactly:
//   camera.position.z = 7.2, fov = 46°, canvas aspect = 16:9
// Visible height at z=0: 2 * tan(fov/2) * cameraZ = 2 * tan(23°) * 7.2 ≈ 6.11
// Visible width: height * aspect = 6.11 * (16/9) ≈ 10.86
export const SCENE_WIDTH  = 10.86;
export const SCENE_HEIGHT = 6.11;
export const SCENE_DEPTH  = 2.4;

export function mapLandmarkToWorld(
  landmark: HandLandmark,
  sceneWidth = SCENE_WIDTH,
  sceneHeight = SCENE_HEIGHT
): VectorTuple {
  // Mirror X so skeleton matches the horizontally-flipped camera feed (selfie mode)
  const x = ((1 - landmark.x) - 0.5) * sceneWidth;
  const y = -(landmark.y - 0.5) * sceneHeight;
  const z = Math.max(-1.4, Math.min(1.4, -landmark.z * SCENE_DEPTH));

  return [x, y, z];
}

export function clampToScene([x, y, z]: VectorTuple): VectorTuple {
  return [
    Math.max(-4.5, Math.min(4.5, x)),
    Math.max(-2.6, Math.min(2.8, y)),
    Math.max(-2.5, Math.min(2.5, z))
  ];
}
