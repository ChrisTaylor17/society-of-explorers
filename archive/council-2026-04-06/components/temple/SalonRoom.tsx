'use client';

import { Html, Billboard } from '@react-three/drei';

export default function SalonRoom() {
  return (
    <group>
      {/* "THE ETERNAL QUESTION" inscription above the central altar */}
      <Billboard follow position={[0, 3, 0]}>
        <Html center distanceFactor={12}>
          <div style={{
            color: '#C9A84C', fontFamily: 'Cinzel, serif', fontSize: '10px',
            letterSpacing: '4px', opacity: 0.4, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            THE ETERNAL QUESTION
          </div>
        </Html>
      </Billboard>

      {/* Entrance portal marker */}
      <group position={[0, 0, 20]}>
        <mesh position={[0, 2, 0]}>
          <torusGeometry args={[1.5, 0.05, 16, 6]} />
          <meshStandardMaterial color="#C9A84C" emissive="#C9A84C" emissiveIntensity={0.5} />
        </mesh>
        <Billboard follow position={[0, 4, 0]}>
          <Html center distanceFactor={10}>
            <div style={{
              color: '#C9A84C', fontFamily: 'Cinzel, serif', fontSize: '9px',
              letterSpacing: '3px', opacity: 0.3, pointerEvents: 'none',
            }}>
              ENTRANCE
            </div>
          </Html>
        </Billboard>
      </group>

      {/* Labyrinth portal */}
      <group position={[-20, 0, 0]}>
        <mesh position={[0, 2, 0]}>
          <torusGeometry args={[1.5, 0.05, 16, 6]} />
          <meshStandardMaterial color="#7C9EBF" emissive="#7C9EBF" emissiveIntensity={0.5} />
        </mesh>
        <pointLight position={[0, 2, 0]} intensity={1} color="#7C9EBF" distance={8} decay={2} />
        <Billboard follow position={[0, 4, 0]}>
          <Html center distanceFactor={10}>
            <div style={{
              color: '#7C9EBF', fontFamily: 'Cinzel, serif', fontSize: '9px',
              letterSpacing: '3px', opacity: 0.4, pointerEvents: 'none',
            }}>
              THE LABYRINTH
            </div>
          </Html>
        </Billboard>
      </group>

      {/* Hall of Creations portal */}
      <group position={[20, 0, 0]}>
        <mesh position={[0, 2, 0]}>
          <torusGeometry args={[1.5, 0.05, 16, 6]} />
          <meshStandardMaterial color="#6B9E6B" emissive="#6B9E6B" emissiveIntensity={0.5} />
        </mesh>
        <pointLight position={[0, 2, 0]} intensity={1} color="#6B9E6B" distance={8} decay={2} />
        <Billboard follow position={[0, 4, 0]}>
          <Html center distanceFactor={10}>
            <div style={{
              color: '#6B9E6B', fontFamily: 'Cinzel, serif', fontSize: '9px',
              letterSpacing: '3px', opacity: 0.4, pointerEvents: 'none',
            }}>
              HALL OF CREATIONS
            </div>
          </Html>
        </Billboard>
      </group>
    </group>
  );
}
