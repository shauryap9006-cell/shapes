"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { SRGBColorSpace, VideoTexture, LinearFilter } from "three";
import { useSceneStore } from "@/stores/sceneStore";
import { SceneObject } from "./SceneObject";

// Applies the live camera feed directly as scene.background each frame.
// Using scene.background means Three.js composites it internally — no CSS z-index tricks needed.
function CameraBackground({ videoElement }: { videoElement: HTMLVideoElement }) {
  const { scene } = useThree();

  useEffect(() => {
    const texture = new VideoTexture(videoElement);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    // Mirror horizontally so the background matches the selfie/mirror convention
    texture.repeat.set(-1, 1);
    texture.offset.set(1, 0);

    scene.background = texture;

    return () => {
      scene.background = null;
      texture.dispose();
    };
  }, [scene, videoElement]);

  return null;
}

type SceneContentProps = {
  videoElement: HTMLVideoElement | null;
};

function SceneContent({ videoElement }: SceneContentProps) {
  const objects = useSceneStore((state) => state.objects);
  const grabbedObjectId = useSceneStore((state) => state.grabbedObjectId);
  const grabbedObject = objects.find((object) => object.id === grabbedObjectId);

  return (
    <>
      {videoElement && <CameraBackground videoElement={videoElement} />}

      {/* Ambient raised to compensate for real-world lighting on the feed */}
      <ambientLight intensity={1.4} />
      {/* Soft fill from above-front — doesn't cast harsh shadows */}
      <pointLight position={[0, 3, 2]} intensity={0.9} color="#ffffff" />
      {/* Accent light follows grabbed object — gives grab feedback on the hologram */}
      <pointLight
        position={grabbedObject?.position ?? [0, 2, 2]}
        intensity={grabbedObject ? 2.4 : 0.6}
        color={grabbedObject?.color ?? "#48f5ff"}
        distance={7}
      />

      {objects.map((object) => (
        <SceneObject
          key={object.id}
          object={object}
          grabbed={object.id === grabbedObjectId}
        />
      ))}
    </>
  );
}

type SceneProps = {
  videoElement: HTMLVideoElement | null;
};

export function Scene({ videoElement }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7.2], fov: 46 }}
      // alpha: true not required when scene.background is set (Three.js handles compositing)
      // but enabling it future-proofs CSS layering approaches
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <SceneContent videoElement={videoElement} />
    </Canvas>
  );
}
