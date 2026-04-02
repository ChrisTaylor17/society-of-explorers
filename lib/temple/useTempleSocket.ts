import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface MemberPosition {
  memberId: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export function useTemplePresence(memberId: string, displayName: string) {
  const supabase = createClient();
  const [otherMembers, setOtherMembers] = useState<MemberPosition[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!memberId) return;

    const channel = supabase.channel('temple-presence', {
      config: { presence: { key: memberId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const members: MemberPosition[] = Object.values(state)
          .flat()
          .filter((m: any) => m.memberId !== memberId)
          .map((m: any) => m as MemberPosition);
        setOtherMembers(members);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ memberId, displayName, x: 0, y: 0, z: 5, rotationY: 0 });
        }
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [memberId]);

  const updatePosition = async (x: number, y: number, z: number, rotationY: number) => {
    await channelRef.current?.track({ memberId, displayName, x, y, z, rotationY });
  };

  return { otherMembers, updatePosition };
}
