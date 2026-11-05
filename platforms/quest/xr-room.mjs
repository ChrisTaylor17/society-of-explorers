import { ROOM_TEXT_COLUMNS } from './room-composer.mjs';

const WIDTH = 1024, HEIGHT = 768, MARGIN = 60;
const HALF_WIDTH = 1.25, HALF_HEIGHT = .94, DISTANCE = 2;
const BACKGROUND = '#101d1a';
const VERTEX = 'attribute vec3 p; attribute vec2 t; uniform mat4 projection; uniform mat4 view; varying vec2 uv; void main(){uv=t;gl_Position=projection*view*vec4(p,1.0);}';
const FRAGMENT = 'precision mediump float; varying vec2 uv; uniform sampler2D panel; void main(){gl_FragColor=texture2D(panel,uv);}';

function drawText(ctx, text, firstY, maxLines) {
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    const joined = line ? line + ' ' + word : word;
    if (ctx.measureText(joined).width <= WIDTH - 2 * MARGIN) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (ctx.measureText(line + character).width > WIDTH - 2 * MARGIN) { lines.push(line); line = ''; }
      line += character;
    }
    if (lines.length >= maxLines) break;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  visible.forEach((part, index) => ctx.fillText(part + (index === maxLines - 1 && lines.length > maxLines ? '…' : ''),
    MARGIN, firstY + index * 43, WIDTH - 2 * MARGIN));
}

function drawExact(ctx, text) {
  ctx.font = '30px monospace';
  let y = 203;
  for (const line of text.split('\n')) {
    for (let start = 0; start < Math.max(1, line.length); start += ROOM_TEXT_COLUMNS) {
      const part = line.slice(start, start + ROOM_TEXT_COLUMNS);
      ctx.fillText(part, MARGIN, y, WIDTH - 2 * MARGIN);
      y += 33;
    }
  }
}

function controlBounds(content) {
  return (content?.rows ?? []).flatMap((row, index) => {
    const width = (WIDTH - 2 * MARGIN - (row.length - 1) * 10) / row.length;
    // Review and Post must never share a target with an unchanged ray.
    const y = content.keyboard ? 321 + index * 61 : content.review ? 505 : 597;
    const height = content.keyboard ? 51 : 57;
    return row.map((control, column) => ({ ...control, x: MARGIN + column * (width + 10), y, width, height }));
  });
}

function pointedControl(frame, source, reference, controls) {
  if (!frame || !source?.targetRaySpace || !controls.length) return null;
  try {
    const matrix = frame.getPose(source.targetRaySpace, reference)?.transform.matrix;
    // The ray points along its local negative Z axis. Intersect it with the
    // stationary panel and convert from room coordinates to canvas pixels.
    if (!matrix || ![8, 9, 10, 12, 13, 14].every(index => Number.isFinite(matrix[index])) || matrix[10] <= .0001) return null;
    const distance = (-DISTANCE - matrix[14]) / -matrix[10];
    if (distance < 0) return null;
    const x = (matrix[12] - distance * matrix[8] + HALF_WIDTH) * WIDTH / (2 * HALF_WIDTH);
    const y = (HALF_HEIGHT - matrix[13] + distance * matrix[9]) * HEIGHT / (2 * HALF_HEIGHT);
    return controls.find(control => !control.disabled && x >= control.x && x < control.x + control.width &&
      y >= control.y && y < control.y + control.height)?.id ?? null;
  } catch { return null; }
}

function drawControls(ctx, controls, pointed) {
  for (const control of controls) {
    const selected = control.id === pointed;
    ctx.fillStyle = selected ? '#e3cb8e' : '#294638';
    ctx.fillRect(control.x, control.y, control.width, control.height);
    ctx.fillStyle = control.disabled ? '#a9b3aa' : selected ? BACKGROUND : '#eef0e7';
    ctx.font = 'bold 25px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(control.label, control.x + control.width / 2, control.y + (control.height + 17) / 2, control.width - 16);
    ctx.textAlign = 'start';
  }
}

/** Stationary WebXR panel. Text and viewer poses stay inside the local renderer. */
export async function renderXRRoom(session, doc, readPanel, signal, onFailure) {
  const canvas = doc.createElement('canvas');
  const panel = doc.createElement('canvas');
  panel.width = WIDTH; panel.height = HEIGHT;
  const gl = canvas.getContext('webgl', { xrCompatible: true, alpha: false, preserveDrawingBuffer: false });
  const ctx = panel.getContext('2d');
  if (!gl || !ctx) throw Error('Immersive display unavailable');
  const cleanup = [];
  let stopped = false, frameId, texture, previous = null, previousPoint = null, controls = [];
  const upload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, panel);
  };
  const clear = (writeTexture = true) => {
    previous = null;
    previousPoint = null;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (writeTexture && texture && !gl.isContextLost()) upload();
  };
  function dispose() {
    if (stopped) return;
    stopped = true;
    try { if (frameId !== undefined) session.cancelAnimationFrame(frameId); } catch {}
    try { clear(); } catch {}
    for (const release of cleanup.reverse()) { try { release(); } catch {} }
    panel.width = 0; panel.height = 0;
    canvas.width = 0; canvas.height = 0;
  }
  try {
    signal.throwIfAborted();
    await gl.makeXRCompatible();
    signal.throwIfAborted();
    const reference = await session.requestReferenceSpace('local');
    signal.throwIfAborted();
    const layer = new doc.defaultView.XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer: layer });
    const shader = (type, source) => {
      const value = gl.createShader(type);
      if (!value) throw Error('Immersive display unavailable');
      cleanup.push(() => gl.deleteShader(value));
      gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw Error('Immersive display unavailable');
      return value;
    };
    const program = gl.createProgram();
    if (!program) throw Error('Immersive display unavailable');
    cleanup.push(() => gl.deleteProgram(program));
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Immersive display unavailable');
    const buffer = gl.createBuffer();
    if (!buffer) throw Error('Immersive display unavailable');
    cleanup.push(() => gl.deleteBuffer(buffer));
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -HALF_WIDTH, HALF_HEIGHT, -DISTANCE, 0, 0, -HALF_WIDTH, -HALF_HEIGHT, -DISTANCE, 0, 1,
      HALF_WIDTH, HALF_HEIGHT, -DISTANCE, 1, 0, HALF_WIDTH, -HALF_HEIGHT, -DISTANCE, 1, 1,
    ]), gl.STATIC_DRAW);
    texture = gl.createTexture();
    if (!texture) throw Error('Immersive display unavailable');
    cleanup.push(() => gl.deleteTexture(texture));
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const p = gl.getAttribLocation(program, 'p'), t = gl.getAttribLocation(program, 't');
    const projection = gl.getUniformLocation(program, 'projection'), viewMatrix = gl.getUniformLocation(program, 'view');
    gl.useProgram(program);
    gl.enableVertexAttribArray(p); gl.enableVertexAttribArray(t);
    gl.vertexAttribPointer(p, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(t, 2, gl.FLOAT, false, 20, 12);
    gl.uniform1i(gl.getUniformLocation(program, 'panel'), 0);
    clear();
    const lost = event => { event.preventDefault(); onFailure(); };
    canvas.addEventListener('webglcontextlost', lost);
    cleanup.push(() => canvas.removeEventListener('webglcontextlost', lost));
    function frame(_time, xrFrame) {
      if (stopped || signal.aborted) return;
      try {
        const content = session.visibilityState === 'visible' ? readPanel() : null;
        if (content !== previous) controls = controlBounds(content);
        let pointed = null;
        if (controls.length) for (const source of session.inputSources ?? []) {
          pointed = pointedControl(xrFrame, source, reference, controls);
          if (pointed) break;
        }
        if (content !== previous || pointed !== previousPoint) {
          clear(false);
          previous = content;
          previousPoint = pointed;
          if (content) {
            ctx.fillStyle = '#e3cb8e'; ctx.font = 'bold 30px system-ui';
            ctx.fillText('SOCIETY OF EXPLORERS  ·  ' + (content.label ?? 'CIRCLE DISCUSSION'), MARGIN, 66, WIDTH - 2 * MARGIN);
            ctx.fillStyle = '#eef0e7'; ctx.font = 'bold 39px system-ui';
            drawText(ctx, content.heading, 140, 1);
            if (content.exact) drawExact(ctx, content.text);
            else { ctx.font = '34px system-ui'; drawText(ctx, content.text, 203, controls.length ? 9 : 10); }
            drawControls(ctx, controls, pointed);
            ctx.fillStyle = '#e3cb8e'; ctx.font = '26px system-ui';
            drawText(ctx, content.footer, 684, 2);
          }
          upload();
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.clearColor(.035, .065, .055, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const pose = content && xrFrame.getViewerPose(reference);
        if (pose) for (const view of pose.views) {
          const area = layer.getViewport(view);
          gl.viewport(area.x, area.y, area.width, area.height);
          gl.uniformMatrix4fv(projection, false, view.projectionMatrix);
          gl.uniformMatrix4fv(viewMatrix, false, view.transform.inverse.matrix);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        frameId = session.requestAnimationFrame(frame);
      } catch { onFailure(); }
    }
    frameId = session.requestAnimationFrame(frame);
    return { dispose, selectTarget(event) {
      if (stopped || signal.aborted || !previous || previous !== readPanel()) return undefined;
      return pointedControl(event?.frame, event?.inputSource, reference, controls);
    } };
  } catch (error) { dispose(); throw error; }
}
