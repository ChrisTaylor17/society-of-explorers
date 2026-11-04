import React from 'react';
import { createRoot } from 'react-dom/client';
import HallPage from '../../../app/hall/page';
import '../../../app/globals.css';

const qa = {
  holdNextBody: false, bodyHeld: false,
  releaseBody: null as (() => void) | null,
};
// Explicit local body double: retirement after headers but before JSON finishes.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await nativeFetch(input, init);
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!qa.holdNextBody || url.pathname !== '/api/hall') return response;
  qa.holdNextBody = false;
  const bytes = await response.arrayBuffer(); qa.bodyHeld = true;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    qa.releaseBody = () => { controller.enqueue(new Uint8Array(bytes)); controller.close(); qa.bodyHeld = false; qa.releaseBody = null; };
  } });
  return new Response(body, { status: response.status, headers: response.headers });
};
Object.assign(window, { hallQa: qa });
createRoot(document.getElementById('root')!).render(<React.StrictMode><HallPage /></React.StrictMode>);
