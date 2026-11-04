import { circleHeaders } from './client';
import type { ReadReply } from './discussion-reader';

/** Uses the existing session owner. The guard is checked after asynchronous
 * credential acquisition; abort/deadline does not promise to undo a sent write. */
export async function circleParticipationRequest(path: string, options: {
  method: 'GET' | 'POST'; cache: 'no-store'; redirect: 'error'; body?: string;
}, mayTransmit: () => boolean = () => true, timeoutMs = 15000): Promise<ReadReply> {
  if (!/^\/api\/book-salons\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(path) || !['GET', 'POST'].includes(options.method)) {
    throw Error('Invalid circle conversation request');
  }
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(Error('Circle request deadline exceeded')); }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const headers = await circleHeaders(options.method === 'POST');
      if (abort.signal.aborted || !mayTransmit()) throw Error('Circle view retired before transmission');
      const response = await fetch(path, { ...options, headers, signal: abort.signal });
      return { http: response.status, body: await response.json() };
    })()]);
  } finally { clearTimeout(timer); }
}
