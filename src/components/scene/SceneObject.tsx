"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Points, PointsMaterial } from "three";
import type { SceneObject as SceneObjectType } from "@/types/scene.types";

const DISSOLVE_DURATION_MS = 950;
const DUST_COUNT = 46;

type SceneObjectProps = {
  object: SceneObjectType;
  grabbed: boolean;
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

function makeDust(id: string) {
  const random = makeRandom(hashString(id));
  const positions = new Float32Array(DUST_COUNT * 3);
  const base = new Float32Array(DUST_COUNT * 3);
  const velocity = new Float32Array(DUST_COUNT * 3);

  for (let i = 0; i < DUST_COUNT; i++) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = 0.22 + random() * 0.28;
    const direction = [
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    ];
    const speed = 0.65 + random() * 0.75;
    const offset = i * 3;

    base[offset] = direction[0] * radius;
    base[offset + 1] = direction[1] * radius;
    base[offset + 2] = direction[2] * radius;

    velocity[offset] = direction[0] * speed;
    velocity[offset + 1] = direction[1] * speed + 0.12;
    velocity[offset + 2] = direction[2] * speed;

    positions[offset] = base[offset];
    positions[offset + 1] = base[offset + 1];
    positions[offset + 2] = base[offset + 2];
  }

  return { positions, base, velocity };
}

export function SceneObject({ object, grabbed }: SceneObjectProps) {
  const groupRef = useRef<Group>(null);
  const ref = useRef<Mesh>(null);
  const wireRef = useRef<Mesh>(null);
  const dustRef = useRef<Points>(null);
  const solidMaterialRef = useRef<MeshStandardMaterial>(null);
  const wireMaterialRef = useRef<MeshBasicMaterial>(null);
  const dustMaterialRef = useRef<PointsMaterial>(null);
  const dust = useMemo(() => makeDust(object.id), [object.id]);

  useFrame((_, delta) => {
    const rx = delta * (grabbed ? 0.7 : 0.16);
    const ry = delta * (grabbed ? 0.52 : 0.1);

    if (ref.current) {
      ref.current.rotation.x += rx;
      ref.current.rotation.y += ry;
    }
    if (wireRef.current) {
      wireRef.current.rotation.x += rx;
      wireRef.current.rotation.y += ry;
    }

    const dissolving = object.dissolving && object.dissolveStartedAt !== undefined;
    const progress = dissolving
      ? Math.min(1, (performance.now() - object.dissolveStartedAt!) / DISSOLVE_DURATION_MS)
      : 0;
    const fade = 1 - progress;
    const scale = Math.max(0.001, (object.scale || 0.001) * (dissolving ? Math.max(0.08, 1 - progress * 0.72) : 1));

    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale);
    }
    if (solidMaterialRef.current) {
      solidMaterialRef.current.opacity = 0.82 * fade;
      solidMaterialRef.current.emissiveIntensity = (grabbed ? 0.7 : 0.4) * fade;
    }
    if (wireMaterialRef.current) {
      wireMaterialRef.current.opacity = (grabbed ? 0.55 : 0.28) * fade;
    }
    if (dustMaterialRef.current) {
      dustMaterialRef.current.opacity = dissolving ? Math.sin(progress * Math.PI) * 0.95 : 0;
      dustMaterialRef.current.size = 0.035 + progress * 0.025;
    }
    if (dustRef.current && dissolving) {
      const eased = 1 - Math.pow(1 - progress, 2);
      for (let i = 0; i < DUST_COUNT * 3; i += 3) {
        dust.positions[i] = dust.base[i] + dust.velocity[i] * eased;
        dust.positions[i + 1] = dust.base[i + 1] + dust.velocity[i + 1] * eased;
        dust.positions[i + 2] = dust.base[i + 2] + dust.velocity[i + 2] * eased;
      }
      const position = dustRef.current.geometry.getAttribute("position") as BufferAttribute;
      position.needsUpdate = true;
    }
  });

  const geometry = (
    <>
      {object.type === "cube" && <boxGeometry args={[0.62, 0.62, 0.62]} />}
      {object.type === "sphere" && <sphereGeometry args={[0.38, 32, 24]} />}
      {object.type === "torus" && <torusGeometry args={[0.36, 0.12, 18, 48]} />}
      {object.type === "pyramid" && <coneGeometry args={[0.45, 0.72, 4]} />}
    </>
  );

  const wireGeometry = (
    <>
      {object.type === "cube" && <boxGeometry args={[0.62, 0.62, 0.62]} />}
      {object.type === "sphere" && <sphereGeometry args={[0.38, 32, 24]} />}
      {object.type === "torus" && <torusGeometry args={[0.36, 0.12, 18, 48]} />}
      {object.type === "pyramid" && <coneGeometry args={[0.45, 0.72, 4]} />}
    </>
  );

  return (
    <group ref={groupRef} position={object.position} scale={object.scale || 0.001}>
      <mesh ref={ref}>
        {geometry}
        <meshStandardMaterial
          ref={solidMaterialRef}
          color={object.color}
          emissive={object.color}
          emissiveIntensity={grabbed ? 0.7 : 0.4}
          transparent={true}
          opacity={0.82}
          roughness={0.1}
          metalness={0.6}
          depthWrite={!object.dissolving}
        />
      </mesh>
      <mesh ref={wireRef}>
        {wireGeometry}
        <meshBasicMaterial
          ref={wireMaterialRef}
          color={object.color}
          wireframe={true}
          transparent={true}
          opacity={grabbed ? 0.55 : 0.28}
          depthWrite={!object.dissolving}
        />
      </mesh>
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={dustMaterialRef}
          color={object.color}
          transparent={true}
          opacity={0}
          size={0.035}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
