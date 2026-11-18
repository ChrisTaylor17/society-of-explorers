'use client';

import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';

const wallMaterial = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9, metalness: 0.1 });

export default function TempleEnvironment() {
  return (
    <group>
      {/* Reflective dark floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <MeshReflectorMaterial
          blur={[400, 100]}
          resolution={512}
          mixBlur={1}
          mixStrength={15}
          depthScale={1}
          minDepthThreshold={0.85}
          color="#0A0A0A"
          metalness={0.6}
          roughness={1}
          mirror={0}
        />
      </mesh>

      {/* Walls */}
      <mesh position={[0, 5, -25]} material={wallMaterial}><boxGeometry args={[50, 10, 0.5]} /></mesh>
      <mesh position={[0, 5, 25]} material={wallMaterial}><boxGeometry args={[50, 10, 0.5]} /></mesh>
      <mesh position={[25, 5, 0]} material={wallMaterial}><boxGeometry args={[0.5, 10, 50]} /></mesh>
      <mesh position={[-25, 5, 0]} material={wallMaterial}><boxGeometry args={[0.5, 10, 50]} /></mesh>
      <mesh position={[0, 10, 0]} material={wallMaterial}><boxGeometry args={[50, 0.2, 50]} /></mesh>

      {/* Gold hexagon floor grid */}
      <group position={[0, 0.01, 0]}>
        {Array.from({ length: 10 }, (_, row) =>
          Array.from({ length: 10 }, (_, col) => {
            const x = (col - 5) * 3;
            const z = (row - 5) * 2.6;
            return (
              <mesh key={`${row}-${col}`} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.4, 1.5, 6]} />
                <meshBasicMaterial color="#C9A84C" opacity={0.15} transparent />
              </mesh>
            );
          })
        )}
      </group>

      {/* Central altar */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.8, 1, 0.5, 6]} />
          <meshStandardMaterial color="#1a1208" roughness={0.8} metalness={0.3} />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color="#C9A84C" emissive="#C9A84C" emissiveIntensity={3} roughness={0} />
        </mesh>
        <pointLight position={[0, 1, 0]} intensity={3} color="#C9A84C" distance={15} decay={2} />
      </group>
    </group>
  );
}
