import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function getSalonForMember(memberId: string) {
  const { data } = await supabase
    .from('salon_members')
    .select('salon_id, role, salons(*)')
    .eq('member_id', memberId)
    .in('salons.status', ['recruiting', 'active', 'graduating'])
    .limit(1)
    .single();
  return data ? { ...(data as any).salons, memberRole: data.role } : null;
}

export async function getUpcomingSessions(salonId: string, limit = 5) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('salon_sessions')
    .select('*')
    .eq('salon_id', salonId)
    .gte('session_date', today)
    .eq('status', 'scheduled')
    .order('session_date', { ascending: true })
    .limit(limit);
  return data || [];
}

export function calculateGuideLevel(completedSalons: number): number {
  if (completedSalons >= 10) return 3; // Master Guide
  if (completedSalons >= 3) return 2;  // Senior Guide
  if (completedSalons >= 1) return 1;  // Guide
  return 0;
}

export function checkGraduationEligibility(sessionsLed: number, sessionsAttended: number, totalSessions: number, absencesUnexcused: number) {
  const attendanceRate = totalSessions > 0 ? sessionsAttended / totalSessions : 0;
  const eligible = sessionsLed >= 5 && attendanceRate >= 0.8 && absencesUnexcused < 3;
  return {
    eligible,
    sessionsLed,
    attendanceRate: Math.round(attendanceRate * 100),
    reason: !eligible
      ? sessionsLed < 5 ? `Need 5 sessions led (have ${sessionsLed})`
        : attendanceRate < 0.8 ? `Attendance below 80% (${Math.round(attendanceRate * 100)}%)`
        : `Too many unexcused absences (${absencesUnexcused})`
      : undefined,
  };
}

export function generateSessionSchedule(startDate: Date, weeks = 7): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  // Advance to next Monday if not already Mon
  while (current.getDay() !== 1) current.setDate(current.getDate() + 1);

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 5; d++) { // Mon-Fri
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    current.setDate(current.getDate() + 2); // skip weekend
  }
  return dates;
}

export async function getSalonStats(salonId: string) {
  const { data: members } = await supabase.from('salon_members').select('id').eq('salon_id', salonId);
  const { data: sessions } = await supabase.from('salon_sessions').select('status, exp_awarded_total, session_date, attendance').eq('salon_id', salonId);
  const { data: salon } = await supabase.from('salons').select('week_number').eq('id', salonId).single();

  const completed = (sessions || []).filter(s => s.status === 'completed');
  const scheduled = (sessions || []).filter(s => s.status === 'scheduled');
  const totalExp = completed.reduce((sum, s) => sum + (s.exp_awarded_total || 0), 0);
  const avgAttendance = completed.length > 0
    ? completed.reduce((sum, s) => sum + (Array.isArray(s.attendance) ? s.attendance.length : 0), 0) / completed.length
    : 0;

  return {
    member_count: members?.length || 0,
    sessions_completed: completed.length,
    sessions_remaining: scheduled.length,
    current_week: salon?.week_number || 1,
    next_session: scheduled[0]?.session_date || null,
    avg_attendance_rate: Math.round((avgAttendance / Math.max(members?.length || 1, 1)) * 100),
    total_exp_awarded: totalExp,
  };
}

export async function getSpawningTree(salonId: string): Promise<any> {
  // Find root
  let currentId = salonId;
  let root = null;
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase.from('salons').select('id, parent_salon_id, title, guide_member_id, status').eq('id', currentId).single();
    if (!data) break;
    root = data;
    if (!data.parent_salon_id) break;
    currentId = data.parent_salon_id;
  }
  if (!root) return null;

  // Get all children recursively (simplified: 2 levels deep)
  const { data: children } = await supabase.from('salons').select('id, title, guide_member_id, status, parent_salon_id').eq('parent_salon_id', root.id);
  const tree: any = { ...root, children: [] };
  for (const child of children || []) {
    const { data: grandchildren } = await supabase.from('salons').select('id, title, guide_member_id, status').eq('parent_salon_id', child.id);
    tree.children.push({ ...child, children: grandchildren || [] });
  }
  return tree;
}
