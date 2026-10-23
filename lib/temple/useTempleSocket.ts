import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface MemberPosition {
  memberId: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

function isMemberPosition(value: unknown): value is MemberPosition {
  if (!value || typeof value !== 'object') return false;
  const member = value as Partial<MemberPosition>;
  return (
    typeof member.memberId === 'string' &&
    typeof member.displayName === 'string' &&
    typeof member.x === 'number' &&
    typeof member.y === 'number' &&
    typeof member.z === 'number' &&
    typeof member.rotationY === 'number'
  );
}

export function useTemplePresence(memberId: string, displayName: string) {
  const [supabase] = useState(createClient);
  const [otherMembers, setOtherMembers] = useState<MemberPosition[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!memberId) return;

    const channel = supabase.channel('temple-presence', {
      config: { presence: { key: memberId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const candidates: unknown[] = Object.values(state).flat();
        const members = candidates
          .filter(isMemberPosition)
          .filter((member) => member.memberId !== memberId);
        setOtherMembers(members);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ memberId, displayName, x: 0, y: 0, z: 5, rotationY: 0 });
        }
      });

    channelRef.current = channel;
    return () => {
      if (channelRef.current === channel) channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [displayName, memberId, supabase]);

  const updatePosition = async (x: number, y: number, z: number, rotationY: number) => {
    await channelRef.current?.track({ memberId, displayName, x, y, z, rotationY });
  };

  return { otherMembers, updatePosition };
}
