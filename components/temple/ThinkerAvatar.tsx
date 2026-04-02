'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { THINKER_COLORS, THINKER_NAMES } from '@/lib/temple/templeConstants';
import { useRouter } from 'next/navigation';

interface ThinkerAvatarProps {
  thinkerId: string;
  position: [number, number, number];
}

export default function ThinkerAvatar({ thinkerId, position }: ThinkerAvatarProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const router = useRouter();
  const color = THINKER_COLORS[thinkerId] || '#C9A84C';

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8) * 0.1 + 1.2;
      meshRef.current.rotation.y += 0.003;
    }
  });

  const handleClick = () => {
    router.push(`/salon?thinker=${thinkerId}`);
  };

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        position={[0, 1.2, 0]}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onClick={handleClick}
      >
        <dodecahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 2 : 0.8}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>

      <pointLight position={[0, 1.2, 0]} intensity={hovered ? 3 : 1} color={color} distance={5} decay={2} />

      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.2, 8]} />
        <meshBasicMaterial color={color} opacity={0.3} transparent />
      </mesh>

      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.1, 6]} />
        <meshStandardMaterial color="#1a1208" roughness={0.9} metalness={0.2} />
      </mesh>

      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Html position={[0, 2.5, 0]} center distanceFactor={8}>
          <div style={{
            color, fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '3px',
            textAlign: 'center', whiteSpace: 'nowrap', textShadow: `0 0 20px ${color}`, pointerEvents: 'none',
          }}>
            {THINKER_NAMES[thinkerId]}
          </div>
        </Html>
      </Billboard>

      {hovered && (
        <Billboard>
          <Html position={[0, -0.5, 0]} center>
            <div onClick={handleClick} style={{
              color: '#E8D5A3', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '2px',
              background: 'rgba(0,0,0,0.8)', border: `1px solid ${color}`, padding: '6px 12px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              ENTER CONVERSATION
            </div>
          </Html>
        </Billboard>
      )}
    </group>
  );
}
