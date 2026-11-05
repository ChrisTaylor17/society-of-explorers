// Browser test only. The headset event/frame transport is synthetic.
// Chromium still runs the production canvas text, WebGL shaders and draw calls.
export function installQuestXrDouble() {
  let supported = false, current, held, holdPermission = false, focused = true, online = true;
  let surface, scratch, lines = [];
  const stats = { requests: 0, activations: [], ends: 0, draws: 0, uploads: 0, releases: 0, errors: [] };
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(kind, options) {
    const gl = nativeContext.call(this, kind, kind === 'webgl' ? { ...options, xrCompatible: false } : options);
    if (kind !== 'webgl' || !gl) return gl;
    surface = this;
    Object.defineProperty(gl, 'makeXRCompatible', { value: async () => {} });
    const upload = gl.texImage2D.bind(gl), draw = gl.drawArrays.bind(gl), release = gl.deleteTexture.bind(gl);
    gl.texImage2D = (...args) => {
      scratch = args.at(-1);
      const ctx = nativeContext.call(scratch, '2d');
      lines = [...(ctx.fixtureLines ?? [])];
      stats.uploads++;
      return upload(...args);
    };
    gl.drawArrays = (...args) => {
      draw(...args);
      stats.draws++;
      const error = gl.getError();
      if (error) stats.errors.push(error);
    };
    gl.deleteTexture = texture => { stats.releases++; return release(texture); };
    return gl;
  };
  const fill = CanvasRenderingContext2D.prototype.fillText, blank = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
    (this.fixtureLines ??= []).push(text);
    return fill.call(this, text, ...args);
  };
  CanvasRenderingContext2D.prototype.fillRect = function(...args) {
    this.fixtureLines = [];
    return blank.call(this, ...args);
  };
  const projectionMatrix = new Float32Array([1.2,0,0,0, 0,1.5,0,0, 0,0,-1.02,-1, 0,0,-.202,0]);
  const matrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  class Session extends EventTarget {
    visibilityState = 'visible';
    ended = false;
    frames = new Set();
    async requestReferenceSpace(kind) {
      if (kind !== 'local') throw Error('Unexpected XR reference space');
      return {};
    }
    updateRenderState({ baseLayer }) {
      if (!baseLayer) throw Error('Missing XR base layer');
    }
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame(time => {
        this.frames.delete(id);
        if (!this.ended) callback(time, { getViewerPose: () => ({ views: [{ projectionMatrix, transform: { inverse: { matrix } } }] }) });
      });
      this.frames.add(id);
      return id;
    }
    cancelAnimationFrame(id) { this.frames.delete(id); cancelAnimationFrame(id); }
    async end() {
      if (this.ended) return;
      this.ended = true;
      for (const id of this.frames) cancelAnimationFrame(id);
      this.frames.clear();
      stats.ends++;
      this.dispatchEvent(new Event('end'));
    }
  }
  Object.defineProperty(navigator, 'xr', { value: {
    async isSessionSupported(mode) { return supported && mode === 'immersive-vr'; },
    async requestSession(mode) {
      stats.requests++; stats.activations.push(navigator.userActivation.isActive);
      if (!supported || mode !== 'immersive-vr') throw Error('Unexpected session request');
      if (holdPermission) { holdPermission = false; await new Promise(resolve => { held = resolve; }); }
      current = new Session();
      return current;
    },
  } });
  Object.defineProperty(window, 'XRWebGLLayer', { value: class {
    framebuffer = null;
    constructor(_session, gl) { this.gl = gl; }
    getViewport() { return { x: 0, y: 0, width: this.gl.drawingBufferWidth, height: this.gl.drawingBufferHeight }; }
  } });
  const hasFocus = document.hasFocus.bind(document);
  document.hasFocus = () => focused && hasFocus();
  Object.defineProperty(navigator, 'onLine', { get: () => online });
  window.questXrQa = {
    enable() { supported = true; },
    select() { current?.dispatchEvent(new Event('select')); },
    visibility(value) { current.visibilityState = value; current.dispatchEvent(new Event('visibilitychange')); },
    contextLost() { surface?.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); },
    focus(value) { focused = value; window.dispatchEvent(new Event(value ? 'focus' : 'blur')); },
    online(value) { online = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')); },
    hold() { holdPermission = true; },
    release() { held?.(); held = null; },
    panel() { return lines.join('\n'); },
    image() { return scratch.toDataURL('image/png'); },
    stats() { return { ...stats, held: Boolean(held), pendingFrames: current?.frames.size ?? 0 }; },
  };
}
