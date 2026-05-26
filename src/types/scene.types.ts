export type ShapeType = "cube" | "sphere" | "torus" | "pyramid";

export type VectorTuple = [number, number, number];

export type SceneObject = {
  id: string;
  type: ShapeType;
  position: VectorTuple;
  velocity: VectorTuple;
  scale: number;
  color: string;
  createdAt: number;
  dissolving?: boolean;
  dissolveStartedAt?: number;
};
