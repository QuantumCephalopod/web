(function initSpiralWebGL(global) {
  class SpiralWebGLRenderer {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.gl = this.canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
      });

      this.available = !!this.gl;
      this.atlas = null;
      this.atlasKey = '';
      this.program = null;
      this.buffer = null;
      this.aPosLoc = -1;
      this.aUVLoc = -1;
      this.aAlphaLoc = -1;
      this.aColorLoc = -1;
      this.uResolutionLoc = null;
      this.vertexData = new Float32Array(0);
      this.vertexCount = 0;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;

      if (this.available) {
        this.initProgram();
      }
    }

    initProgram() {
      const gl = this.gl;
      const vertexSrc = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute float a_alpha;
attribute vec3 a_color;
varying vec2 v_uv;
varying float v_alpha;
varying vec3 v_color;
uniform vec2 u_resolution;
void main() {
  vec2 zeroToOne = a_pos / u_resolution;
  vec2 clip = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  v_uv = a_uv;
  v_alpha = a_alpha;
  v_color = a_color;
}
`;
      const fragmentSrc = `
precision mediump float;
varying vec2 v_uv;
varying float v_alpha;
varying vec3 v_color;
uniform sampler2D u_tex;
void main() {
  vec4 tex = texture2D(u_tex, v_uv);
  gl_FragColor = vec4(v_color, tex.a * v_alpha);
}
`;

      const vsh = this.compile(gl.VERTEX_SHADER, vertexSrc);
      const fsh = this.compile(gl.FRAGMENT_SHADER, fragmentSrc);
      if (!vsh || !fsh) {
        this.available = false;
        return;
      }

      const program = gl.createProgram();
      gl.attachShader(program, vsh);
      gl.attachShader(program, fsh);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('SpiralWebGLRenderer link error:', gl.getProgramInfoLog(program));
        this.available = false;
        return;
      }

      this.program = program;
      this.aPosLoc = gl.getAttribLocation(program, 'a_pos');
      this.aUVLoc = gl.getAttribLocation(program, 'a_uv');
      this.aAlphaLoc = gl.getAttribLocation(program, 'a_alpha');
      this.aColorLoc = gl.getAttribLocation(program, 'a_color');
      this.uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
      this.buffer = gl.createBuffer();

      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0);
    }

    compile(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('SpiralWebGLRenderer shader error:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    setSize(width, height, dpr = 1) {
      if (!this.available) return;
      const nextDpr = Math.max(1, dpr || 1);
      const pixelW = Math.max(2, Math.floor(width * nextDpr));
      const pixelH = Math.max(2, Math.floor(height * nextDpr));
      if (this.width === width && this.height === height && this.dpr === nextDpr) return;
      this.width = width;
      this.height = height;
      this.dpr = nextDpr;
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.gl.viewport(0, 0, pixelW, pixelH);
    }

    buildAtlas(aspects) {
      const chars = new Set([' ']);
      const keys = [];
      for (const dir of ORDER) {
        const aspect = aspects[dir];
        if (!aspect || !aspect.cache) continue;
        keys.push(`${dir}:${aspect.name}|${aspect.text}|${aspect.charge}`);
        for (const g of aspect.cache.nameGlyphs || []) chars.add(g.char);
        for (const g of aspect.cache.bodyGlyphs || []) chars.add(g.char);
      }

      const atlasKey = keys.join('§');
      if (this.atlas && this.atlasKey === atlasKey) return;

      const list = Array.from(chars);
      const cell = 52;
      const cols = 16;
      const rows = Math.max(1, Math.ceil(list.length / cols));
      const pad = 6;
      const atlasCanvas = document.createElement('canvas');
      atlasCanvas.width = cols * cell;
      atlasCanvas.height = rows * cell;
      const ctx = atlasCanvas.getContext('2d');
      ctx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.round(FONT_SIZE * NAME_SIZE_BOOST * 1.9)}px monospace`;

      const glyphMap = new Map();
      for (let i = 0; i < list.length; i++) {
        const ch = list[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cell;
        const y = row * cell;
        const cx = x + cell * 0.5;
        const cy = y + cell * 0.5;
        ctx.clearRect(x, y, cell, cell);
        ctx.fillText(ch, cx, cy);

        glyphMap.set(ch, {
          u0: (x + pad) / atlasCanvas.width,
          v0: (y + pad) / atlasCanvas.height,
          u1: (x + cell - pad) / atlasCanvas.width,
          v1: (y + cell - pad) / atlasCanvas.height,
          w: cell - pad * 2,
          h: cell - pad * 2,
        });
      }

      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);

      this.atlas = { tex, glyphMap };
      this.atlasKey = atlasKey;
    }

    pushQuad(x, y, halfW, halfH, rot, uv, alpha, color) {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const points = [
        [-1, -1, uv.u0, uv.v0],
        [1, -1, uv.u1, uv.v0],
        [1, 1, uv.u1, uv.v1],
        [-1, -1, uv.u0, uv.v0],
        [1, 1, uv.u1, uv.v1],
        [-1, 1, uv.u0, uv.v1],
      ];

      const needed = (this.vertexCount + 6) * 8;
      if (needed > this.vertexData.length) {
        const next = new Float32Array(Math.max(needed, Math.ceil(this.vertexData.length * 1.5) + 512));
        next.set(this.vertexData);
        this.vertexData = next;
      }

      let idx = this.vertexCount * 8;
      for (const p of points) {
        const lx = p[0] * halfW;
        const ly = p[1] * halfH;
        const rx = lx * c - ly * s;
        const ry = lx * s + ly * c;
        this.vertexData[idx++] = x + rx;
        this.vertexData[idx++] = y + ry;
        this.vertexData[idx++] = p[2];
        this.vertexData[idx++] = p[3];
        this.vertexData[idx++] = alpha;
        this.vertexData[idx++] = color[0];
        this.vertexData[idx++] = color[1];
        this.vertexData[idx++] = color[2];
      }
      this.vertexCount += 6;
    }

    render(state) {
      if (!this.available) return false;
      const {
        aspects,
        p,
        boundScale,
        now,
        activeRippleVertex,
        rippleFadeOut,
        rippleStartTime,
        rippleFadeStartTime,
        rippleDurationMs,
      } = state;

      this.buildAtlas(aspects);
      if (!this.atlas) return false;

      this.vertexCount = 0;
      const time = now * 0.001;
      const dirPhase = { w: 0.0, x: 1.6, y: 3.1, z: 4.7 };
      const zAmp = 2.6;
      const perspective = 0.018;

      for (const dir of ORDER) {
        const aspect = aspects[dir];
        if (!aspect || !aspect.cache) continue;

        let alpha = 1;
        if (activeRippleVertex === dir) {
          if (rippleFadeOut) {
            const t = clamp((now - rippleFadeStartTime) / (rippleDurationMs * 0.6), 0, 1);
            alpha = clamp(0.08 + easeInOut(t) * 0.92, 0, 1);
          } else {
            const cycleMs = Math.max(180, rippleDurationMs);
            const cycle = ((now - rippleStartTime) % cycleMs) / cycleMs;
            const pulse = 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2);
            alpha = clamp(0.22 + pulse * 0.78, 0.08, 1);
          }
        }

        const textIsLight = aspect.charge === 'light';
        const color = textIsLight ? [0.06, 0.06, 0.07] : [0.96, 0.95, 0.91];
        const fillAlpha = alpha;
        const localScale = p[dir].scale * boundScale;
        const vx = p[dir].x;
        const vy = p[dir].y;

        const drawGlyphs = (glyphs, sizeMul) => {
          for (const glyph of glyphs) {
            const uv = this.atlas.glyphMap.get(glyph.char) || this.atlas.glyphMap.get(' ');
            if (!uv) continue;

            const wave = Math.sin(glyph.radius * 0.082 + time * 2.2 + dirPhase[dir]) * zAmp;
            const scaleMul = 1 + wave * perspective;
            const gx = vx + glyph.baseX * localScale * scaleMul;
            const gy = vy + glyph.baseY * localScale * scaleMul;
            const halfW = uv.w * 0.5 * localScale * sizeMul * scaleMul;
            const halfH = uv.h * 0.5 * localScale * sizeMul * scaleMul;
            const rot = glyph.rotation;
            this.pushQuad(gx * this.dpr, gy * this.dpr, halfW * this.dpr, halfH * this.dpr, rot, uv, fillAlpha, color);
          }
        };

        drawGlyphs(aspect.cache.nameGlyphs || [], 0.54);
        drawGlyphs(aspect.cache.bodyGlyphs || [], 0.44);

      }

      const gl = this.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (!this.vertexCount) return true;

      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.subarray(0, this.vertexCount * 8), gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);

      const stride = 8 * 4;
      gl.enableVertexAttribArray(this.aPosLoc);
      gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.aUVLoc);
      gl.vertexAttribPointer(this.aUVLoc, 2, gl.FLOAT, false, stride, 2 * 4);
      gl.enableVertexAttribArray(this.aAlphaLoc);
      gl.vertexAttribPointer(this.aAlphaLoc, 1, gl.FLOAT, false, stride, 4 * 4);
      gl.enableVertexAttribArray(this.aColorLoc);
      gl.vertexAttribPointer(this.aColorLoc, 3, gl.FLOAT, false, stride, 5 * 4);
      gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

      return true;
    }
  }

  global.SpiralWebGLRenderer = SpiralWebGLRenderer;
})(window);
