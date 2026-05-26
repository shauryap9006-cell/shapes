"use client";

import { useCallback, useMemo, useRef } from "react";
import { useGestureStore } from "@/stores/gestureStore";
import { useSceneStore } from "@/stores/sceneStore";
import type { GestureAction } from "@/types/gesture.types";
import type { ShapeType, VectorTuple } from "@/types/scene.types";
import { clampToScene } from "@/utils/coordinateMapper";
import { VelocityTracker } from "@/utils/velocityTracker";

const GRAB_RADIUS = 1.15;
const PINCH_RESIZE_RADIUS = 1.45;
const PINCH_MIN_HANDLE_DISTANCE = 0.22;
const MIN_OBJECT_SCALE = 0.35;
const MAX_OBJECT_SCALE = 3.2;
const FIST_THROW_MIN_HOLD_MS = 180;
const FIST_THROW_SPEED = 0.18;
const FIST_THROW_BOOST = 1.25;
const FIST_THROW_CONFIRM_FRAMES = 2;
const RELEASE_MAX_SPEED = 0.55;  // higher cap so fast releases retain full speed
const RELEASE_BOOST = 1.4;       // multiplier applied to release velocity

function distance(a: VectorTuple, b: VectorTuple) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function lerp(a: VectorTuple, b: VectorTuple, factor: number): VectorTuple {
  return [
    a[0] + (b[0] - a[0]) * factor,
    a[1] + (b[1] - a[1]) * factor,
    a[2] + (b[2] - a[2]) * factor
  ];
}

function scaleVelocity(velocity: VectorTuple, factor: number): VectorTuple {
  return [velocity[0] * factor, velocity[1] * factor, velocity[2] * factor];
}

function speed(velocity: VectorTuple) {
  return Math.hypot(velocity[0], velocity[1], velocity[2]);
}

function followFactor(current: VectorTuple, target: VectorTuple) {
  const gap = distance(current, target);
  if (gap > 1.2) return 0.72;
  if (gap > 0.45) return 0.55;
  return 0.36;
}

function clampScale(scale: number) {
  return Math.max(MIN_OBJECT_SCALE, Math.min(MAX_OBJECT_SCALE, scale));
}

type ResizeState = {
  objectId: string;
  startDistance: number;
  startScale: number;
};

export function useObjectInteraction() {
  const tracker = useMemo(() => new VelocityTracker(8), []);
  const fistThrowReadyAtRef = useRef(0);
  const fistThrowFramesRef = useRef(0);
  const resizeRef = useRef<ResizeState | null>(null);
  const lastSpawnTimeRef = useRef(0);

  const handleAction = useCallback(
    (action: GestureAction) => {
      const handPosition = useGestureStore.getState().handPosition;
      const scene = useSceneStore.getState();

      if (action.gesture === "both-fists") {
        scene.dissolveScene();
        tracker.clear();
        resizeRef.current = null;
        return;
      }

      if (!handPosition) {
        return;
      }

      if (action.gesture === "pinch") {
        const nearest = scene.objects
          .filter((object) => !object.dissolving)
          .map((object) => ({
            id: object.id,
            distance: distance(object.position, handPosition),
            scale: Math.max(1, object.scale)
          }))
          .filter((item) => item.distance <= PINCH_RESIZE_RADIUS * item.scale)
          .sort((a, b) => a.distance - b.distance)[0];

        if (nearest) {
          const object = scene.objects.find((item) => item.id === nearest.id);
          if (object) {
            resizeRef.current = {
              objectId: nearest.id,
              startDistance: Math.max(PINCH_MIN_HANDLE_DISTANCE, distance(object.position, handPosition)),
              startScale: Math.max(1, object.scale)
            };
            scene.updateObject(nearest.id, { velocity: [0, 0, 0] });
          }
        }
        return;
      }

      if (action.gesture === "fist") {
        resizeRef.current = null;
        const nearest = scene.objects
          .filter((object) => !object.dissolving)
          .map((object) => ({
            id: object.id,
            distance: distance(object.position, handPosition)
          }))
          .filter((item) => item.distance <= GRAB_RADIUS)
          .sort((a, b) => a.distance - b.distance)[0];

        if (nearest) {
          scene.setGrabbed(nearest.id);
          tracker.clear();
          tracker.add(handPosition);
          fistThrowFramesRef.current = 0;
          fistThrowReadyAtRef.current = action.gesture === "fist"
            ? performance.now() + FIST_THROW_MIN_HOLD_MS
            : Number.POSITIVE_INFINITY;
        }
      }

      if ((action.gesture === "open-palm" || action.gesture === "none") && scene.grabbedObjectId) {
        // Sample at a higher speed cap and apply a boost so the shape
        // carries the hand's momentum after release (inertia / flick effect).
        const rawVelocity = tracker.velocity(RELEASE_MAX_SPEED);
        const velocity = scaleVelocity(rawVelocity, RELEASE_BOOST);
        scene.updateObject(scene.grabbedObjectId, { velocity });
        scene.setGrabbed(null);
        tracker.clear();
        fistThrowReadyAtRef.current = 0;
        fistThrowFramesRef.current = 0;
      }

      if (action.gesture === "open-palm" || action.gesture === "none") {
        resizeRef.current = null;
      }
    },
    [tracker]
  );

  const moveGrabbedObject = useCallback(() => {
    const { grabbedObjectId, objects, updateObject, setGrabbed, addObject } = useSceneStore.getState();
    const { currentGesture, handPosition } = useGestureStore.getState();

    if (!handPosition) {
      lastSpawnTimeRef.current = 0;
      return;
    }

    // Handle continuous spawning when holding a shape gesture
    const spawnMap: Partial<Record<string, ShapeType>> = {
      "one-finger": "sphere",
      "two-fingers": "cube",
      "three-fingers": "torus"
    };

    const spawnType = currentGesture ? spawnMap[currentGesture] : undefined;
    if (spawnType) {
      const now = performance.now();
      if (now - lastSpawnTimeRef.current >= 1000) {
        addObject(spawnType, clampToScene(handPosition));
        lastSpawnTimeRef.current = now;
      }
    } else {
      lastSpawnTimeRef.current = 0;
    }

    const resizeState = resizeRef.current;
    if (resizeState) {
      if (currentGesture !== "pinch") {
        resizeRef.current = null;
      } else {
        const object = objects.find((item) => item.id === resizeState.objectId && !item.dissolving);
        if (!object) {
          resizeRef.current = null;
        } else {
          const currentDistance = Math.max(PINCH_MIN_HANDLE_DISTANCE, distance(object.position, handPosition));
          const nextScale = clampScale(resizeState.startScale * (currentDistance / resizeState.startDistance));
          updateObject(resizeState.objectId, { scale: nextScale, velocity: [0, 0, 0] });
        }
      }
      return;
    }

    if (!grabbedObjectId) {
      return;
    }

    const object = objects.find((item) => item.id === grabbedObjectId && !item.dissolving);
    if (!object) {
      return;
    }

    const targetPosition = clampToScene(handPosition);
    const nextPosition = clampToScene(lerp(object.position, targetPosition, followFactor(object.position, targetPosition)));
    tracker.add(targetPosition);

    const throwVelocity = tracker.velocity(0.42);
    const fistThrowCandidate =
      currentGesture === "fist" &&
      performance.now() >= fistThrowReadyAtRef.current &&
      speed(throwVelocity) >= FIST_THROW_SPEED;

    fistThrowFramesRef.current = fistThrowCandidate ? fistThrowFramesRef.current + 1 : 0;

    if (fistThrowFramesRef.current >= FIST_THROW_CONFIRM_FRAMES) {
      updateObject(grabbedObjectId, {
        position: nextPosition,
        velocity: scaleVelocity(throwVelocity, FIST_THROW_BOOST)
      });
      setGrabbed(null);
      tracker.clear();
      fistThrowReadyAtRef.current = 0;
      fistThrowFramesRef.current = 0;
      return;
    }

    updateObject(grabbedObjectId, { position: nextPosition, velocity: [0, 0, 0] });
  }, [tracker]);

  return { handleAction, moveGrabbedObject };
}
