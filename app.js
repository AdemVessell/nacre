(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const DEFAULT = { arms: 11, twist: 5.5, relief: 1, hue: 0, light: 0, phase: 0, stage: 4 };
  const PRESETS = {
    moon: { arms: 11, twist: 5.5, relief: 1, hue: 0, light: 0, phase: 0, stage: 4 },
    blue: { arms: 13, twist: -3.5, relief: 0.82, hue: -1.18, light: 1.2, phase: 0, stage: 4 },
    rose: { arms: 7, twist: 7.25, relief: 1.34, hue: 1.42, light: -1.52, phase: 0, stage: 4 }
  };
  const FALLBACK_EQUATIONS = [
    { title: 'The background is the first decision.', tex: 'b = (0.001, 0.0025, 0.004) + e^{-((x+0.6)^2+(y-0.5)^2)/0.7}(0.002, 0.005, 0.008)', description: 'A continuous midnight field establishes the coordinate plane. No image texture is involved.' },
    { title: 'A winding coordinate turns a circle into a shell.', tex: 'q = n\\theta - k\\ln(r^2+0.008)+\\phi,\\quad f = (1+\\cos q)/2', description: 'Integer arms make the angular seam disappear; twist changes how quickly the spiral tightens as it moves inward.' },
    { title: 'The pixel field acquires a surface.', tex: 'N = \\operatorname{normalize}(-H_x,-H_y,1)', description: 'Analytic derivatives of the relief field become a normal. There is no mesh beneath the image.' },
    { title: 'Pigment gives the surface its nacre.', tex: 'P = 0.58 + 0.31\\cos(3r + 0.6N_z + h + (0,1.2,2.7))', description: 'A compact palette varies across the shell. Colour is authored by the equation, not sampled from a reference bitmap.' },
    { title: 'Light lets the spiral become a surface.', tex: 'C = P(0.16+0.90d) + s(1.10,1.00,0.95) + (1-N_z)^3(0.13,0.30,0.32)', description: 'The finished field combines pigment, analytic relief, soft specular response and the written display curve.' }
  ];
  const STAGE_LABELS = ['BLANK', 'SPIRAL', 'RELIEF', 'PIGMENT', 'FINISHED'];

  const canvas = document.getElementById('nacre-canvas');
  const stageBadge = document.getElementById('stage-badge');
  const rendererBadge = document.getElementById('renderer-badge');
  const systemAlert = document.getElementById('system-alert');
  const renderSize = document.getElementById('render-size');
  const equationTitle = document.getElementById('equation-title');
  const equationFormula = document.getElementById('equation-formula');
  const equationDescription = document.getElementById('equation-description');
  const equationKicker = document.getElementById('equation-kicker');
  const heroStageTitle = document.getElementById('hero-stage-title');
  const captionKicker = document.getElementById('caption-kicker');
  const captionTitle = document.getElementById('caption-title');
  const captionCopy = document.getElementById('caption-copy');
  const animationStatus = document.getElementById('animation-status');
  const phaseToggle = document.getElementById('phase-toggle');
  const constructionPlay = document.getElementById('construction-play');
  const sourceCode = document.getElementById('source-code');
  const sourceDisclosure = document.getElementById('source-disclosure');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hiddenState = { phase: false, construction: false };

  let state = Object.assign({}, DEFAULT);
  let renderer = null;
  let cpuContext = null;
  let usingCpu = false;
  let phaseAnimating = false;
  let constructionRunning = false;
  let constructionPaused = false;
  let constructionElapsed = 0;
  let lastFrame = 0;
  let frameRequest = 0;

  function apiAvailable() {
    return window.Nacre && typeof window.Nacre.validate === 'function' &&
      (typeof window.Nacre.createRenderer === 'function' || typeof window.Nacre.render === 'function');
  }

  function equations() {
    return (window.Nacre && Array.isArray(window.Nacre.equations) && window.Nacre.equations.length >= 5)
      ? window.Nacre.equations : FALLBACK_EQUATIONS;
  }

  function validState(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).length !== 7) throw new Error('state must contain exactly the seven NACRE parameters');
    const keys = ['arms', 'twist', 'relief', 'hue', 'light', 'phase', 'stage'];
    if (keys.some(function (key) { return !Object.prototype.hasOwnProperty.call(candidate, key); }) || Object.keys(candidate).some(function (key) { return keys.indexOf(key) < 0; })) throw new Error('state contains an unknown or missing parameter');
    // Validate the supplied object before coercion: strings, nulls and other
    // JSON lookalikes must not become numbers by accident.
    if (typeof window.Nacre.validate === 'function') window.Nacre.validate(candidate);
    else if (!(typeof candidate.arms === 'number' && Number.isInteger(candidate.arms) && candidate.arms >= 3 && candidate.arms <= 21 && typeof candidate.twist === 'number' && Number.isFinite(candidate.twist) && candidate.twist >= -9 && candidate.twist <= 9 && typeof candidate.relief === 'number' && Number.isFinite(candidate.relief) && candidate.relief >= 0 && candidate.relief <= 1.5 && typeof candidate.hue === 'number' && Number.isFinite(candidate.hue) && Math.abs(candidate.hue) <= 3.14 && typeof candidate.light === 'number' && Number.isFinite(candidate.light) && Math.abs(candidate.light) <= 3.14 && typeof candidate.phase === 'number' && Number.isFinite(candidate.phase) && Math.abs(candidate.phase) <= 6.284 && typeof candidate.stage === 'number' && Number.isInteger(candidate.stage) && candidate.stage >= 0 && candidate.stage <= 4)) throw new Error('state is outside the NACRE contract');
    const exact = { arms: candidate.arms, twist: candidate.twist, relief: candidate.relief, hue: candidate.hue, light: candidate.light, phase: candidate.phase, stage: candidate.stage };
    return exact;
  }

  function announce(message, kind) {
    systemAlert.hidden = false;
    systemAlert.dataset.kind = kind || 'notice';
    systemAlert.textContent = message;
  }

  function setupRenderer() {
    if (!apiAvailable()) {
      rendererBadge.textContent = 'renderer unavailable';
      announce('Nacre API unavailable. Load src/nacre.js beside this page to render the equation artwork.', 'error');
      canvas.setAttribute('aria-label', 'Nacre renderer unavailable');
      return;
    }
    try {
      if (typeof window.Nacre.createRenderer !== 'function') throw new Error('createRenderer not supplied');
      renderer = window.Nacre.createRenderer(canvas);
      if (!renderer || typeof renderer.draw !== 'function') throw new Error('renderer did not initialise');
      rendererBadge.textContent = 'WebGL pixel path';
    } catch (error) {
      renderer = null;
      usingCpu = true;
      cpuContext = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
      if (cpuContext) {
        rendererBadge.textContent = 'CPU fallback';
        announce('WebGL was unavailable for this canvas. NACRE is using the same written pixel contract through its CPU fallback.', 'warning');
      } else {
        rendererBadge.textContent = 'no canvas context';
        announce('Nacre could not initialise WebGL or its CPU canvas fallback. The artwork cannot render in this browser.', 'error');
      }
    }
  }

  function draw() {
    if (!apiAvailable()) return;
    try {
      if (renderer) {
        renderer.draw(state);
      } else if (usingCpu && cpuContext && typeof window.Nacre.render === 'function') {
        const pixels = window.Nacre.render(canvas.width, canvas.height, state);
        cpuContext.putImageData(new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height), 0, 0);
      }
    } catch (error) {
      if (renderer) {
        renderer = null;
        usingCpu = true;
        cpuContext = canvas.getContext('2d', { alpha: false });
        rendererBadge.textContent = cpuContext ? 'CPU fallback' : 'render error';
        announce('The WebGL draw path reported an error; NACRE switched to its CPU pixel path. The written equation remains the source of the image.', cpuContext ? 'warning' : 'error');
        if (cpuContext && typeof window.Nacre.render === 'function') draw();
      } else {
        announce('Nacre could not render this state: ' + error.message, 'error');
      }
    }
  }

  function formatValue(key, value) {
    if (key === 'arms') return String(Math.round(value));
    if (key === 'relief') return Number(value).toFixed(2);
    return Number(value).toFixed(2);
  }

  function syncControls() {
    ['arms', 'twist', 'relief', 'light', 'hue', 'phase'].forEach(function (key) {
      const input = document.getElementById('control-' + key);
      const output = document.getElementById('value-' + key);
      if (input) input.value = state[key];
      if (output) output.textContent = formatValue(key, state[key]);
    });
  }

  function renderFormula(tex) {
    if (state.stage === 2) tex = String.raw`\begin{aligned}H&=0.10a\,e^{-(r/0.76)^8}\\&\quad(1-e^{-r^2/0.008})(0.16+f^3)\\N&=\frac{(-H_x,-H_y,1)}{\|(-H_x,-H_y,1)\|}\end{aligned}`;
    if (state.stage === 4) tex = String.raw`\begin{aligned}C={}&P(0.16+0.90[N\!\cdot\!L]_+)\\&+[N\!\cdot\!V]_+^{42}(1.10,1,0.95)\\&+(1-N_z)^3(0.13,0.30,0.32)\end{aligned}`;
    if (state.stage === 1) tex=String.raw`\begin{aligned}q&=n\theta-k\ln(r^2+0.008)+\varphi\\f&=(1+\cos q)/2\end{aligned}`;
    equationFormula.setAttribute('aria-label', tex);
    if (window.katex && typeof window.katex.render === 'function') {
      try { window.katex.render(tex, equationFormula, { displayMode: true, throwOnError: false }); return; } catch (_) { /* plain fallback below */ }
    }
    equationFormula.textContent = tex;
  }

  function updateStage() {
    const item = equations()[state.stage] || FALLBACK_EQUATIONS[state.stage];
    const label = STAGE_LABELS[state.stage];
    const title = item.title || FALLBACK_EQUATIONS[state.stage].title;
    const tex = item.tex || FALLBACK_EQUATIONS[state.stage].tex;
    const desc = item.description || FALLBACK_EQUATIONS[state.stage].description;
    equationKicker.textContent = 'STAGE 0' + (state.stage + 1) + ' / ' + label;
    equationTitle.textContent = title;
    equationDescription.textContent = desc;
    renderFormula(tex);
    stageBadge.textContent = '0' + (state.stage + 1) + ' / ' + label;
    heroStageTitle.textContent = title.replace(/[.]+$/, '');
    captionKicker.textContent = 'NACRE / 0' + (state.stage + 1);
    captionTitle.textContent = title;
    captionCopy.textContent = state.stage === 4
      ? 'A live formula, evaluated in the browser. The phase control is an authored change of state, not fluid motion.'
      : 'The same pixel function, paused before the next compositional decision. Nothing is pre-rendered.';
    document.querySelectorAll('.stage-button').forEach(function (button) {
      const active = Number(button.dataset.stage) === state.stage;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function commit(next, opts) {
    try {
      state = validState(next);
    } catch (error) {
      announce('State rejected by the NACRE contract: ' + error.message, 'error');
      return false;
    }
    syncControls();
    updateStage();
    draw();
    if (!(opts && opts.quiet)) animationStatus.textContent = phaseAnimating ? 'Phase animation · live' : 'Still / editable';
    return true;
  }

  function updateValue(key, rawValue) {
    const next = Object.assign({}, state, { [key]: Number(rawValue) });
    commit(next, { quiet: true });
  }

  function startFrameLoop() {
    if (!frameRequest) {
      lastFrame = performance.now();
      frameRequest = requestAnimationFrame(frameLoop);
    }
  }

  function frameLoop(now) {
    frameRequest = 0;
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    let changed = false;
    if (phaseAnimating) {
      let phase = state.phase + dt * 0.52;
      while (phase > TAU) phase -= TAU;
      state = Object.assign({}, state, { phase: phase });
      changed = true;
    }
    if (constructionRunning) {
      constructionElapsed += dt;
      if (constructionElapsed >= 3.5) {
        constructionElapsed = 0;
        if (state.stage < 4) {
          state = Object.assign({}, state, { stage: state.stage + 1 });
          updateStage();
          animationStatus.textContent = 'Construction · ' + STAGE_LABELS[state.stage].toLowerCase();
          changed = true;
        } else {
          constructionRunning = false;
          constructionPaused = false;
          animationStatus.textContent = 'Construction complete · finished / static';
          constructionPlay.textContent = '▶ Play construction';
        }
      }
    }
    if (changed) {
      syncControls();
      draw();
    }
    if (phaseAnimating || constructionRunning) frameRequest = requestAnimationFrame(frameLoop);
  }

  function togglePhase(force) {
    if (reducedMotion && force !== false) {
      announce('Phase animation is disabled because this device requests reduced motion.', 'notice');
      return;
    }
    phaseAnimating = typeof force === 'boolean' ? force : !phaseAnimating;
    phaseToggle.setAttribute('aria-pressed', phaseAnimating ? 'true' : 'false');
    phaseToggle.innerHTML = phaseAnimating ? '<span class="phase-mark" aria-hidden="true">Ⅱ</span> Pause phase' : '<span class="phase-mark" aria-hidden="true">◌</span> Animate phase';
    animationStatus.textContent = phaseAnimating ? 'Phase animation · live' : 'Still / editable';
    if (phaseAnimating) startFrameLoop();
  }

  function startConstruction() {
    if (reducedMotion) {
      announce('Construction autoplay is disabled because this device requests reduced motion. Choose a stage manually.', 'notice');
      return;
    }
    if (constructionRunning) {
      constructionRunning = false;
      constructionPaused = true;
      constructionPlay.textContent = '▶ Resume construction';
      animationStatus.textContent = 'Construction paused';
      return;
    }
    if (constructionPaused) {
      constructionPaused = false;
      constructionRunning = true;
      constructionPlay.textContent = 'Ⅱ Pause construction';
      animationStatus.textContent = 'Construction · ' + STAGE_LABELS[state.stage].toLowerCase();
      startFrameLoop();
      return;
    }
    phaseAnimating = false;
    phaseToggle.setAttribute('aria-pressed', 'false');
    phaseToggle.innerHTML = '<span class="phase-mark" aria-hidden="true">◌</span> Animate phase';
    constructionElapsed = 0;
    constructionPaused = false;
    commit(Object.assign({}, state, { stage: 0, phase: 0 }), { quiet: true });
    constructionRunning = true;
    constructionPlay.textContent = 'Ⅱ Pause construction';
    animationStatus.textContent = 'Construction · blank';
    startFrameLoop();
  }

  function inspectPixel(event) {
    if (!window.Nacre || typeof window.Nacre.sample !== 'function') return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * canvas.width / rect.width;
    const py = (event.clientY - rect.top) * canvas.height / rect.height;
    const ix = Math.max(0, Math.min(canvas.width - 1, Math.floor(px)));
    const iy = Math.max(0, Math.min(canvas.height - 1, Math.floor(py)));
    const x = (2 * ix + 1 - canvas.width) / canvas.height;
    const y = (canvas.height - 2 * iy - 1) / canvas.height;
    try {
      const rgb = window.Nacre.sample(x, y, state).map(function (channel) { return Math.max(0, Math.min(1, Number(channel))); });
      const bytes = rgb.map(function (channel) { return Math.round(channel * 255); });
      document.getElementById('inspector-swatch').style.backgroundColor = 'rgb(' + bytes.join(', ') + ')';
      document.getElementById('inspector-text').textContent = 'pixel ' + ix + ',' + iy + ' · x ' + x.toFixed(3) + ' · y ' + y.toFixed(3) + '   RGB ' + bytes.join(' / ') + '   ·   click to move';
    } catch (error) {
      document.getElementById('inspector-text').textContent = 'Pixel sample unavailable for this coordinate.';
    }
  }

  function pixelsToCanvas(width, height, pixels) {
    const output = document.createElement('canvas');
    output.width = width; output.height = height;
    const context = output.getContext('2d', { alpha: false });
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    return output;
  }

  function exportPng() {
    const snapshot = Object.assign({}, state);
    stopAnimation('Export snapshot ready');
    const button = document.getElementById('download-png');
    const status = document.getElementById('png-status');
    button.disabled = true;
    status.textContent = 'rendering 1600 × 1200…';
    window.setTimeout(function () {
      try {
        const width = 1600, height = 1200;
        let output;
        if (typeof window.Nacre.render === 'function') output = pixelsToCanvas(width, height, window.Nacre.render(width, height, snapshot));
        else throw new Error('Nacre.render is unavailable');
        output.toBlob(function (blob) {
          if (!blob) {
            status.textContent = 'PNG export failed · encoder returned no blob';
            button.disabled = false;
            return;
          }
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'nacre-' + STAGE_LABELS[snapshot.stage].toLowerCase() + '.png';
          link.click();
          window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1200);
          status.textContent = 'PNG prepared · 1600 × 1200';
          button.disabled = false;
        }, 'image/png');
      } catch (error) {
        status.textContent = 'PNG export failed · ' + error.message;
        button.disabled = false;
      }
    }, 0);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ format: 'nacre-state-1', state: state }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'nacre-state.json'; link.click();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1200);
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        let candidate = parsed;
        if (parsed && typeof parsed === 'object' && ('format' in parsed || 'state' in parsed)) {
          if (parsed.format !== 'nacre-state-1' || Object.keys(parsed).sort().join(',') !== 'format,state') throw new Error('unknown state wrapper');
          candidate = parsed.state;
        }
        stopAnimation('State imported');
        commit(validState(candidate));
        announce('State imported and checked against the NACRE contract.', 'notice');
      } catch (error) {
        announce('Import rejected: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function loadProof() {
    fetch('proof/REPORT.json', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (report) {
      const checks = Array.isArray(report.checks) ? report.checks.length : 0;
      const status = String(report.status || 'UNSTATED').toUpperCase();
      const proof = document.getElementById('proof-status');
      proof.dataset.state = status.toLowerCase();
      document.getElementById('proof-status-title').textContent = status + (report.date ? ' · ' + report.date : '');
      document.getElementById('proof-status-detail').textContent = checks ? checks + ' recorded check' + (checks === 1 ? '' : 's') + ' in the saved receipt. Open REPORT.json for the exact limits and failures.' : 'Receipt loaded, but it contains no check list.';
    }).catch(function (error) {
      const proof = document.getElementById('proof-status');
      proof.dataset.state = 'missing';
      document.getElementById('proof-status-title').textContent = 'Receipt not loaded';
      document.getElementById('proof-status-detail').textContent = 'The local page could not read proof/REPORT.json (' + error.message + '). No verification result is claimed here.';
    });
  }

  function loadSource() {
    if (window.Nacre && window.Nacre.source) sourceCode.textContent = String(window.Nacre.source);
    else sourceCode.textContent = 'Nacre.source is not available. Load src/nacre.js beside this page.';
  }

  function stopAnimation(status) {
    phaseAnimating = false;
    constructionRunning = false;
    constructionPaused = false;
    phaseToggle.setAttribute('aria-pressed', 'false');
    phaseToggle.innerHTML = '<span class="phase-mark" aria-hidden="true">◌</span> Animate phase';
    constructionPlay.textContent = '▶ Play construction';
    if (status) animationStatus.textContent = status;
  }

  document.querySelectorAll('input[type="range"]').forEach(function (input) {
    input.addEventListener('input', function () { updateValue(input.id.replace('control-', ''), input.value); });
  });
  document.querySelectorAll('.stage-button').forEach(function (button) { button.addEventListener('click', function () { stopAnimation('Still / editable'); commit(Object.assign({}, state, { stage: Number(button.dataset.stage) }), { quiet: true }); }); });
  document.querySelectorAll('.preset-button').forEach(function (button) { button.addEventListener('click', function () { stopAnimation('Still / editable'); commit(PRESETS[button.dataset.preset], { quiet: true }); }); });
  document.getElementById('reset-state').addEventListener('click', function () { stopAnimation('Still / editable'); commit(DEFAULT, { quiet: true }); });
  phaseToggle.addEventListener('click', function () { togglePhase(); });
  constructionPlay.addEventListener('click', startConstruction);
  document.getElementById('download-png').addEventListener('click', exportPng);
  document.getElementById('export-json').addEventListener('click', exportJson);
  document.getElementById('import-json-button').addEventListener('click', function () { document.getElementById('import-json').click(); });
  document.getElementById('import-json').addEventListener('change', function (event) { importJson(event.target.files[0]); event.target.value = ''; });
  document.getElementById('show-source').addEventListener('click', function () { sourceDisclosure.open = true; sourceDisclosure.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }); });
  canvas.addEventListener('click', inspectPixel);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hiddenState.phase = phaseAnimating; hiddenState.construction = constructionRunning;
      phaseAnimating = false; constructionRunning = false;
      animationStatus.textContent = 'Paused while hidden';
    } else {
      if (hiddenState.phase) phaseAnimating = true;
      if (hiddenState.construction) constructionRunning = true;
      hiddenState.phase = false; hiddenState.construction = false;
      if (phaseAnimating || constructionRunning) { animationStatus.textContent = phaseAnimating ? 'Phase animation · live' : 'Construction · paused'; startFrameLoop(); }
    }
  });

  setupRenderer();
  commit(DEFAULT, { quiet: true });
  loadSource();
  loadProof();
}());
