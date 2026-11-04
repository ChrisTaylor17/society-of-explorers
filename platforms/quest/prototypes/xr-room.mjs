/** Minimal read-only WebXR panel. No external engine, tracking storage or network calls. */
export async function renderXRRoom(session,canvas,lines){
  const gl=canvas.getContext('webgl',{xrCompatible:true,alpha:false});if(!gl)throw Error('WebGL unavailable');
  await gl.makeXRCompatible();const layer=new XRWebGLLayer(session,gl);session.updateRenderState({baseLayer:layer});
  const reference=await session.requestReferenceSpace('local');
  const shader=(kind,source)=>{const x=gl.createShader(kind);gl.shaderSource(x,source);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error('Shader unavailable');return x;};
  const vs=shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec2 t;uniform mat4 projection;uniform mat4 view;varying vec2 uv;void main(){uv=t;gl_Position=projection*view*vec4(p,1.0);}');
  const fs=shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 uv;uniform sampler2D panel;void main(){gl_FragColor=texture2D(panel,uv);}');
  const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Program unavailable');
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1.25,.94,-2,0,0,-1.25,-.94,-2,0,1,1.25,.94,-2,1,0,1.25,-.94,-2,1,1]),gl.STATIC_DRAW);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const panel=document.createElement('canvas');panel.width=1024;panel.height=768;const ctx=panel.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  const upload=()=>{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,panel);};
  const clear=()=>{last='';ctx.fillStyle='#101d1a';ctx.fillRect(0,0,1024,768);upload();};
  let stopped=false,last='';
  function frame(_time,xrFrame){
    if(stopped)return;
    const content=lines().join('\n');if(content!==last){last=content;ctx.fillStyle='#101d1a';ctx.fillRect(0,0,1024,768);ctx.fillStyle='#e3cb8e';ctx.font='bold 30px system-ui';ctx.fillText('SOCIETY OF EXPLORERS · LOCAL DEMO',45,58);ctx.fillStyle='#eef0e7';ctx.font='28px system-ui';let y=112;for(const line of content.split('\n')){for(const chunk of (line.match(/.{1,55}(?:\s|$)|.{1,55}/g)??[''])){if(y>710)break;ctx.fillText(chunk,45,y);y+=38;}if(y>710)break;}upload();}
    const pose=xrFrame.getViewerPose(reference);gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.clearColor(.035,.065,.055,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(pose){gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const p=gl.getAttribLocation(program,'p'),t=gl.getAttribLocation(program,'t');gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(t);gl.vertexAttribPointer(p,3,gl.FLOAT,false,20,0);gl.vertexAttribPointer(t,2,gl.FLOAT,false,20,12);gl.uniform1i(gl.getUniformLocation(program,'panel'),0);for(const view of pose.views){const v=layer.getViewport(view);gl.viewport(v.x,v.y,v.width,v.height);gl.uniformMatrix4fv(gl.getUniformLocation(program,'projection'),false,view.projectionMatrix);gl.uniformMatrix4fv(gl.getUniformLocation(program,'view'),false,view.transform.inverse.matrix);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}}
    session.requestAnimationFrame(frame);
  }
  clear();session.requestAnimationFrame(frame);
  const stop=()=>{if(stopped)return;stopped=true;clear();gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);panel.width=0;panel.height=0;};stop.clear=clear;return stop;
}
