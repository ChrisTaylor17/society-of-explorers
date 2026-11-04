import React from 'react';
import { createRoot } from 'react-dom/client';
import LeaderboardPage from '../../../app/leaderboard/page';

const qa = {
  holdNextHeaders: false, holdNextBody: false, held: false,
  release: null as (() => void) | null,
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await originalFetch(input, init);
  if (qa.holdNextHeaders) {
    qa.holdNextHeaders = false; qa.held = true;
    await new Promise<void>(resolve => { qa.release = () => { qa.held = false; qa.release = null; resolve(); }; });
  }
  if (!qa.holdNextBody) return response;
  qa.holdNextBody = false;
  const bytes = await response.arrayBuffer(); qa.held = true;
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    qa.release = () => { controller.enqueue(new Uint8Array(bytes)); controller.close(); qa.held = false; qa.release = null; };
  } }), { status: response.status, headers: response.headers });
};
const root = createRoot(document.getElementById('root')!);
Object.assign(window, { leaderboardQa: qa, unmountLeaderboard: () => root.unmount() });
root.render(<LeaderboardPage />);
