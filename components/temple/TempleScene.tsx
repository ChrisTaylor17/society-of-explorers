'use client';

import { Canvas } from '@react-three/fiber';
import { PointerLockControls, Stars, Preload } from '@react-three/drei';
import { Suspense } from 'react';
import TempleEnvironment from './TempleEnvironment';
import SalonRoom from './SalonRoom';
import ThinkerAvatar from './ThinkerAvatar';
import { THINKER_POSITIONS } from '@/lib/temple/templeConstants';

export default function TempleScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.7, 12], fov: 75, near: 0.1, far: 1000 }}
      shadows
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#0A0A0A' }}
    >
      <Stars radius={100} depth={50} count={3000} factor={2} fade speed={0.5} />

      <ambientLight intensity={0.1} color="#1a1208" />
      <pointLight position={[0, 4, 0]} intensity={2} color="#C9A84C" distance={20} decay={2} />
      <pointLight position={[-8, 2, 0]} intensity={0.5} color="#8B4513" distance={10} decay={2} />
      <pointLight position={[8, 2, 0]} intensity={0.5} color="#8B4513" distance={10} decay={2} />

      <Suspense fallback={null}>
        <TempleEnvironment />
        <SalonRoom />
        {Object.entries(THINKER_POSITIONS).map(([id, pos]) => (
          <ThinkerAvatar key={id} thinkerId={id} position={pos} />
        ))}
      </Suspense>

      <PointerLockControls />
      <Preload all />
    </Canvas>
  );
}
