const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Nav scroll effect
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');
function setNavOpen(open) {
  navLinks.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
}
navToggle.addEventListener('click', () => setNavOpen(!navLinks.classList.contains('open')));
document.querySelectorAll('.nav-links a').forEach(a =>
  a.addEventListener('click', () => setNavOpen(false))
);

// Active nav-link highlighting
const navAnchorMap = new Map();
document.querySelectorAll('.nav-links a[href^="#"]').forEach(a => {
  const target = document.querySelector(a.getAttribute('href'));
  if (target) navAnchorMap.set(target, a);
});
if (navAnchorMap.size) {
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const link = navAnchorMap.get(entry.target);
      if (!link) return;
      if (entry.isIntersecting) {
        navAnchorMap.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navAnchorMap.forEach((_, section) => navObserver.observe(section));
}

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
if (prefersReducedMotion) {
  revealEls.forEach(el => el.classList.add('visible'));
} else {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObserver.observe(el));
}

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// ===== Hero background: WebGL2 procedural render-grid shader =====
// Demonstrates real-time rendering work instead of a generic particle canvas.
// Respects prefers-reduced-motion, pauses when off-screen/tab hidden, and
// falls back to the existing CSS gradient (#hero::after) on unsupported browsers.
(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!gl) return; // no WebGL2 support: CSS gradient fallback already covers the hero background

  const VERT_SRC = `#version 300 es
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

  const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;

const vec3 CYAN = vec3(0.0, 0.831, 1.0);
const vec3 PURPLE = vec3(0.659, 0.333, 0.969);
const vec3 BG = vec3(0.031, 0.043, 0.063);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float horizonY = 0.05;
  vec3 col = BG;

  if (uv.y < horizonY - 0.001) {
    // Ground plane: perspective-project screen space onto an infinite floor grid.
    float depth = 1.35 / (horizonY - uv.y);
    vec2 world = vec2(uv.x * depth, depth - u_time * 0.6);
    vec2 grid = world * 1.6;

    vec2 gf = fract(grid);
    gf = min(gf, 1.0 - gf);
    vec2 gd = fwidth(grid) * 1.5 + 0.0005;
    vec2 lineAmt = 1.0 - smoothstep(vec2(0.0), gd, gf);
    float line = max(lineAmt.x, lineAmt.y);

    float fog = exp(-depth * 0.05);
    vec3 gridColor = mix(PURPLE, CYAN, clamp(uv.x * 0.5 + 0.5, 0.0, 1.0));
    col = mix(BG, gridColor, line * fog * 0.9);
  } else {
    float sky = 1.0 - smoothstep(horizonY, horizonY + 0.5, uv.y);
    col += PURPLE * sky * 0.12;

    vec2 starUV = uv * vec2(u_resolution.x / u_resolution.y, 1.0) * 40.0;
    vec2 starCell = floor(starUV);
    float starRand = hash21(starCell);
    if (starRand > 0.985) {
      vec2 starLocal = fract(starUV) - 0.5;
      float starDist = length(starLocal);
      float twinkle = 0.5 + 0.5 * sin(u_time * 2.0 + starRand * 50.0);
      float star = smoothstep(0.06, 0.0, starDist) * twinkle;
      col += mix(CYAN, PURPLE, starRand) * star * 0.8;
    }
  }

  float horizonGlow = exp(-abs(uv.y - horizonY) * 12.0);
  col += CYAN * horizonGlow * 0.15;
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.015;

  outColor = vec4(col, 1.0);
}`;

  function compileShader(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Hero shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertShader = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const fragShader = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vertShader || !fragShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Hero shader link error:', gl.getProgramInfoLog(program));
    return;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const u_resolution = gl.getUniformLocation(program, 'u_resolution');
  const u_time = gl.getUniformLocation(program, 'u_time');

  let running = false;
  let rafId = null;
  const startTime = performance.now();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function renderFrame(timeMs) {
    resize();
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u_time, timeMs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function currentTime() {
    return (performance.now() - startTime) / 1000;
  }

  function loop() {
    if (!running) return;
    renderFrame(currentTime());
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running || prefersReducedMotion) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Always draw one static frame so the effect is visible even under
  // prefers-reduced-motion, before the hero scrolls into view, or in a
  // background tab where the animation loop is intentionally paused.
  resize();
  renderFrame(0);

  // A ResizeObserver (unlike a one-shot call + window 'resize' listener) fires
  // as soon as it observes the element and on every subsequent layout change,
  // so the canvas can never get stuck at a stale size measured before layout
  // settled — independent of whether the render loop is currently running.
  const resizeObserver = new ResizeObserver(() => renderFrame(currentTime()));
  resizeObserver.observe(canvas);

  if (!prefersReducedMotion) {
    const heroSection = document.getElementById('hero');
    let heroIntersecting = false;

    function syncRunning() {
      if (heroIntersecting && !document.hidden) start();
      else stop();
    }

    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => { heroIntersecting = entry.isIntersecting; });
      syncRunning();
    }, { threshold: 0 });
    visibilityObserver.observe(heroSection);

    document.addEventListener('visibilitychange', syncRunning);
  }
})();
