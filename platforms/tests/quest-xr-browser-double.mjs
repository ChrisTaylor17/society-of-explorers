// Browser test only. The headset event/frame transport is synthetic.
// Chromium still runs the production canvas text, WebGL shaders and draw calls.
export function installQuestXrDouble() {
  let supported = false, current, held, holdPermission = false, focused = true, online = true;
  let surface, scratch, lines = [], targets = [];
  const stats = { requests: 0, activations: [], ends: 0, draws: 0, uploads: 0, releases: 0, errors: [] };
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(kind, options) {
    const gl = nativeContext.call(this, kind, kind === 'webgl' ? { ...options, xrCompatible: false } : options);
    if (kind !== 'webgl' || !gl) return gl;
    surface = gl.canvas;
    Object.defineProperty(gl, 'makeXRCompatible', { value: async () => {} });
    const upload = gl.texImage2D.bind(gl), draw = gl.drawArrays.bind(gl), release = gl.deleteTexture.bind(gl);
    gl.texImage2D = (...args) => {
      scratch = args.at(-1);
      const ctx = nativeContext.call(scratch, '2d');
      lines = [...(ctx.fixtureLines ?? [])];
      targets = [...(ctx.fixtureTargets ?? [])];
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
    if (this.textAlign === 'center') (this.fixtureTargets ??= []).push({ text, x: args[0], y: args[1] });
    return fill.call(this, text, ...args);
  };
  CanvasRenderingContext2D.prototype.fillRect = function(...args) {
    if (args[0] === 0 && args[1] === 0 && args[2] === this.canvas.width && args[3] === this.canvas.height) {
      this.fixtureLines = [];
      this.fixtureTargets = [];
    }
    return blank.call(this, ...args);
  };
  const projectionMatrix = new Float32Array([1.2,0,0,0, 0,1.5,0,0, 0,0,-1.02,-1, 0,0,-.202,0]);
  const matrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  class Session extends EventTarget {
    visibilityState = 'visible';
    ended = false;
    frames = new Set();
    inputSource = { targetRaySpace: {} };
    inputSources = [this.inputSource];
    ray = null;
    getPose = space => space === this.inputSource.targetRaySpace && this.ray ? { transform: { matrix: this.ray } } : null;
    fire() { this.dispatchEvent(Object.assign(new Event('select'), { inputSource: this.inputSource, frame: { getPose: this.getPose } })); }
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
        if (!this.ended) callback(time, { getPose: this.getPose, getViewerPose: () => ({ views: [{ projectionMatrix, transform: { inverse: { matrix } } }] }) });
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
  function pressAt(x, y, backwards = false) {
    const ray = new Float32Array(matrix);
    // Offset the origin and rotate to meet the actual rendered button.
    const dx = .45, dz = Math.sqrt(1 - dx * dx);
    ray[0] = backwards ? -dz : dz;
    ray[2] = -dx;
    ray[8] = dx;
    ray[10] = backwards ? -dz : dz;
    ray[12] = (x / scratch.width * 2 - 1) * 1.25 + 2 * dx / dz;
    ray[13] = (1 - y / scratch.height * 2) * .94;
    current.ray = ray;
    current.fire();
  }
  window.questXrQa = {
    enable() { supported = true; },
    select() { current?.dispatchEvent(new Event('select')); },
    press(label, backwards) {
      const matches = targets.filter(target => target.text === label);
      if (matches.length !== 1) throw Error('No unique rendered target: ' + label);
      pressAt(matches[0].x, matches[0].y, backwards);
    },
    miss() { pressAt(0, 0); },
    repeat() { current.fire(); },
    visibility(value) { current.visibilityState = value; current.dispatchEvent(new Event('visibilitychange')); },
    contextLost() { surface?.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); },
    focus(value) { focused = value; window.dispatchEvent(new Event(value ? 'focus' : 'blur')); },
    online(value) { online = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')); },
    hold() { holdPermission = true; },
    release() { held?.(); held = null; },
    panel() { return lines.join('\n'); },
    labels() { return targets.map(target => target.text); },
    image() { return scratch.toDataURL('image/png'); },
    stats() { return { ...stats, held: Boolean(held), pendingFrames: current?.frames.size ?? 0 }; },
  };
}
