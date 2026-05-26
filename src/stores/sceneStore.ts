import { create } from "zustand";
import type { SceneObject, ShapeType, VectorTuple } from "@/types/scene.types";

const MAX_OBJECTS = 15;
const DISSOLVE_DURATION_MS = 950;

const colors: Record<ShapeType, string> = {
  cube: "#48f5ff",
  sphere: "#ff4fd8",
  torus: "#b6ff5a",
  pyramid: "#ffb84d"
};

function makeId() {
  return `object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type SceneState = {
  objects: SceneObject[];
  grabbedObjectId: string | null;
  addObject: (type: ShapeType, position: VectorTuple) => void;
  removeObject: (id: string) => void;
  clearScene: () => void;
  dissolveScene: () => void;
  setGrabbed: (id: string | null) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  tickObjects: () => void;
};

export const useSceneStore = create<SceneState>((set, get) => ({
  objects: [],
  grabbedObjectId: null,
  addObject: (type, position) =>
    set((state) => {
      const next: SceneObject = {
        id: makeId(),
        type,
        position,
        velocity: [0, 0, 0],
        scale: 0,
        color: colors[type],
        createdAt: performance.now()
      };

      return {
        objects: [...state.objects, next].slice(-MAX_OBJECTS)
      };
    }),
  removeObject: (id) =>
    set((state) => ({
      objects: state.objects.filter((object) => object.id !== id),
      grabbedObjectId: state.grabbedObjectId === id ? null : state.grabbedObjectId
    })),
  clearScene: () => set({ objects: [], grabbedObjectId: null }),
  dissolveScene: () =>
    set((state) => {
      const startedAt = performance.now();
      return {
        grabbedObjectId: null,
        objects: state.objects.map((object) => ({
          ...object,
          dissolving: true,
          dissolveStartedAt: object.dissolveStartedAt ?? startedAt,
          velocity: [0, 0, 0] as VectorTuple
        }))
      };
    }),
  setGrabbed: (grabbedObjectId) => set({ grabbedObjectId }),
  updateObject: (id, patch) =>
    set((state) => ({
      objects: state.objects.map((object) =>
        object.id === id ? { ...object, ...patch } : object
      )
    })),
  tickObjects: () => {
    const { grabbedObjectId, objects } = get();
    if (objects.length === 0) return;

    const now = performance.now();

    set((state) => {
      const nextObjects = state.objects.flatMap((object) => {
        if (object.dissolving) {
          const startedAt = object.dissolveStartedAt ?? now;
          if (now - startedAt >= DISSOLVE_DURATION_MS) return [];
          return [{ ...object, velocity: [0, 0, 0] as VectorTuple }];
        }

        const scale = object.scale < 1 ? Math.min(1, object.scale + 0.12) : object.scale;

        if (object.id === grabbedObjectId) {
          return [{ ...object, scale }];
        }

        const position: VectorTuple = [
          object.position[0] + object.velocity[0],
          object.position[1] + object.velocity[1],
          object.position[2] + object.velocity[2]
        ];

        const velocity: VectorTuple = [
          object.velocity[0] * 0.985,
          object.velocity[1] * 0.985,
          object.velocity[2] * 0.985
        ];

        for (const axis of [0, 1, 2] as const) {
          const limit = axis === 1 ? 2.8 : 4.6;
          if (Math.abs(position[axis]) > limit) {
            position[axis] = Math.sign(position[axis]) * limit;
            velocity[axis] *= -0.45;
          }
        }

        return [{ ...object, position, velocity, scale }];
      });

      return { objects: nextObjects };
    });
  }
}));
