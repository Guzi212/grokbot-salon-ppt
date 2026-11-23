/* LOIC FM 演示引擎：1920×1080 舞台缩放 / 逐步显示 / 键盘翻页 / 全屏 / 演示视频
   → Space PageDown 下一步    ← PageUp 上一步    F 全屏    P 播放/暂停视频
   ?slide=3 跳页    ?static=1 全部元素直接显示（截图验收用） */
(() => {
  const W = 1920, H = 1080;
  const q = new URLSearchParams(location.search);
  const STATIC = q.has('static');
  const root = document.documentElement;
  const stage = document.querySelector('.stage');
  const slides = [...document.querySelectorAll('.slide')];
  if (STATIC) root.classList.add('is-static');

  let cur = Math.min(Math.max((parseInt(q.get('slide'), 10) || 1) - 1, 0), slides.length - 1);
  let step = 0;
  let demoMode = 0; // 0: 预览待播, 1: 全屏播放中, 2: 已退出全屏（再按下一页切下一张）
  let demoEnteredBrowserFs = false;

  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  };
  addEventListener('resize', fit); fit();

  /* 兜底全屏演示样式，确保任意方案复用 engine.js 时均支持视频全屏播放 */
  const fsStyle = document.createElement('style');
  fsStyle.textContent = `
    html.demo-fs-open,html.demo-fs-open body{background:#000!important}
    html.demo-fs-open .chrome,html.demo-fs-open .prog{opacity:0!important;pointer-events:none!important}
    .slide.demo-fs{z-index:50!important}
    [data-demo].is-fs{position:fixed!important;inset:0!important;width:1920px!important;height:1080px!important;aspect-ratio:auto!important;border-radius:0!important;border:0!important;box-shadow:none!important;z-index:60!important;background:#000!important;cursor:pointer}
    [data-demo].is-fs video{width:100%!important;height:100%!important;object-fit:contain!important;opacity:1!important}
  `;
  document.head.appendChild(fsStyle);

  const fmt = (n, d) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const countUp = (scope) => {
    scope.querySelectorAll('[data-count]').forEach((e) => {
      const to = parseFloat(e.dataset.count), d = (e.dataset.count.split('.')[1] || '').length;
      if (STATIC) { e.textContent = fmt(to, d); return; }
      const t0 = performance.now(), dur = +(e.dataset.dur || 1600);
      const tick = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        e.textContent = fmt(to * (1 - Math.pow(1 - p, 4)), d);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  const maxStep = (sl) => Math.max(0, ...[...sl.querySelectorAll('[data-step]')].map((e) => +e.dataset.step));
  const apply = () => {
    slides[cur].querySelectorAll('[data-step]').forEach((e) => {
      const on = STATIC || +e.dataset.step <= step;
      if (on && !e.classList.contains('in')) countUp(e);
      e.classList.toggle('in', on);
    });
  };

  const ui = () => {
    const n = String(cur + 1).padStart(2, '0'), t = String(slides.length).padStart(2, '0');
    document.querySelectorAll('[data-page]').forEach((e) => (e.textContent = n));
    document.querySelectorAll('[data-total]').forEach((e) => (e.textContent = t));
    document.querySelectorAll('[data-progress]').forEach((e) => (e.style.width = ((cur + 1) / slides.length) * 100 + '%'));
    root.dataset.slide = cur + 1;
  };

  const getActiveDemo = () => {
    const box = slides[cur].querySelector('[data-demo]');
    if (!box || box.dataset.loadFailed === '1') return null;
    const v = box.querySelector('video');
    if (!v) return null;
    if (box.classList.contains('has-video') || v.readyState >= 1 || v.getAttribute('src')) return box;
    return null;
  };

  const syncDemoHint = (box, isFs) => {
    const hint = box && box.querySelector('.hint');
    if (!hint) return;
    if (!hint.dataset.defaultText) hint.dataset.defaultText = hint.textContent;
    hint.textContent = isFs ? '→ / ESC 退出全屏 · -/+ 调音量 · P 暂停' : hint.dataset.defaultText;
  };

  const enterDemoFs = (box, restart = true) => {
    if (!box) return;
    const v = box.querySelector('video');
    if (!v) return;
    demoMode = 1;
    root.classList.add('demo-fs-open');
    slides[cur].classList.add('demo-fs');
    box.classList.add('is-fs');
    syncDemoHint(box, true);
    if (!document.fullscreenElement && root.requestFullscreen) {
      demoEnteredBrowserFs = true;
      root.requestFullscreen().catch(() => { demoEnteredBrowserFs = false; });
    } else {
      demoEnteredBrowserFs = false;
    }
    if (restart || v.ended) {
      try { v.currentTime = 0; } catch (_) {}
    }
    v.volume = demoVol;
    v.muted = demoMuted;
    wakeHud();
    v.play().catch(() => {});
  };

  const exitDemoFs = (nextMode = 2) => {
    const box = document.querySelector('[data-demo].is-fs') || slides[cur].querySelector('[data-demo]');
    if (box) {
      const v = box.querySelector('video');
      if (v) v.pause();
      box.classList.remove('is-fs');
      syncDemoHint(box, false);
    }
    slides.forEach((s) => s.classList.remove('demo-fs'));
    root.classList.remove('demo-fs-open');
    demoMode = nextMode;
    if (demoEnteredBrowserFs) {
      demoEnteredBrowserFs = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  };

  const show = (i, toEnd) => {
    if (demoMode === 1) exitDemoFs(0);
    slides[cur].querySelectorAll('video').forEach((v) => v.pause());
    slides.forEach((s, k) => {
      s.classList.toggle('active', k === i);
      if (k !== i) s.querySelectorAll('[data-step]').forEach((e) => e.classList.remove('in'));
    });
    cur = i;
    step = toEnd ? maxStep(slides[i]) : 0;
    demoMode = toEnd ? 2 : 0;
    [...slides[i].querySelectorAll('[data-count]')].filter((e) => !e.closest('[data-step]')).forEach((e) => countUp(e.parentNode));
    apply(); ui();
    const u = new URL(location.href); u.searchParams.set('slide', i + 1);
    history.replaceState(null, '', u);
  };

  const next = () => {
    if (!STATIC && step < maxStep(slides[cur])) { step++; apply(); return; }
    if (!STATIC) {
      const demo = getActiveDemo();
      if (demo) {
        if (demoMode === 0) { enterDemoFs(demo, true); return; }
        if (demoMode === 1) { exitDemoFs(2); return; }
      }
    }
    if (cur < slides.length - 1) show(cur + 1);
  };

  const prev = () => {
    if (!STATIC && demoMode === 1) { exitDemoFs(0); return; }
    if (!STATIC && step > 0) { step--; apply(); }
    else if (cur > 0) show(cur - 1, true);
  };

  const toggleVideo = () => {
    const v = slides[cur].querySelector('video');
    if (v && v.readyState) v.paused ? v.play() : v.pause();
  };

  /* 视频音量控制（默认 45%，持久化记忆，支持滑块 / 静音 / +/-/M 快捷键） */
  const VOL_KEY = 'loic_fm_demo_vol';
  const MUTE_KEY = 'loic_fm_demo_muted';
  let demoVol = 0.45;
  let demoMuted = false;
  try {
    const savedV = parseFloat(localStorage.getItem(VOL_KEY));
    if (!Number.isNaN(savedV) && savedV >= 0 && savedV <= 1) demoVol = savedV;
    demoMuted = localStorage.getItem(MUTE_KEY) === '1';
  } catch (_) {}

  let idle;
  const wakeHud = () => {
    root.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => root.classList.add('idle'), 2200);
  };

  const applyVolumeToAll = () => {
    const pct = Math.round(demoVol * 100);
    document.querySelectorAll('[data-demo]').forEach((box) => {
      const v = box.querySelector('video');
      if (v) { v.volume = demoVol; v.muted = demoMuted; }
      const slider = box.querySelector('[data-vol-slider]');
      const valEl = box.querySelector('[data-vol-val]');
      const muteBtn = box.querySelector('[data-vol-mute]');
      if (slider) {
        slider.value = String(demoMuted ? 0 : pct);
        slider.style.setProperty('--vp', `${demoMuted ? 0 : pct}%`);
      }
      if (valEl) valEl.textContent = demoMuted ? '静音' : `${pct}%`;
      if (muteBtn) muteBtn.classList.toggle('is-muted', demoMuted || pct === 0);
    });
    try {
      localStorage.setItem(VOL_KEY, demoVol.toFixed(2));
      localStorage.setItem(MUTE_KEY, demoMuted ? '1' : '0');
    } catch (_) {}
  };

  const setVolume = (v) => {
    demoVol = Math.min(1, Math.max(0, Math.round(v * 20) / 20));
    if (demoVol > 0) demoMuted = false;
    applyVolumeToAll();
    wakeHud();
  };

  const toggleMute = () => {
    demoMuted = !demoMuted;
    if (!demoMuted && demoVol === 0) demoVol = 0.45;
    applyVolumeToAll();
    wakeHud();
  };

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Escape' && demoMode === 1) { e.preventDefault(); exitDemoFs(2); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1);
    else if (k === 'f' || k === 'F') {
      if (document.fullscreenElement) { demoEnteredBrowserFs = false; document.exitFullscreen(); }
      else root.requestFullscreen().catch(() => {});
    }
    else if (k === 'p' || k === 'P') toggleVideo();
    else if ((k === '+' || k === '=') && slides[cur].querySelector('[data-demo]')) { e.preventDefault(); setVolume(demoVol + 0.1); }
    else if ((k === '-' || k === '_') && slides[cur].querySelector('[data-demo]')) { e.preventDefault(); setVolume(demoVol - 0.1); }
    else if ((k === 'm' || k === 'M') && slides[cur].querySelector('[data-demo]')) { e.preventDefault(); toggleMute(); }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && demoMode === 1 && demoEnteredBrowserFs) {
      demoEnteredBrowserFs = false;
      exitDemoFs(2);
    }
  });

  stage.addEventListener('click', (e) => {
    if (e.target.closest('video, a, button, input, label, [data-noadvance]')) return;
    next();
  });

  /* 演示视频：同级上一层 demo.mp4，缺失时可点击选择本地文件 */
  document.querySelectorAll('[data-demo]').forEach((box) => {
    const v = box.querySelector('video'), input = box.querySelector('input[type=file]');
    v.volume = demoVol;
    v.muted = demoMuted;
    const ok = () => { delete box.dataset.loadFailed; box.classList.add('has-video'); applyVolumeToAll(); };
    v.addEventListener('loadeddata', ok);
    v.addEventListener('loadedmetadata', ok);
    if (v.readyState >= 1) ok();
    v.addEventListener('error', () => { box.dataset.loadFailed = '1'; box.classList.remove('has-video'); }, true);
    v.addEventListener('click', (e) => {
      e.stopPropagation();
      if (demoMode === 1 && box.classList.contains('is-fs')) exitDemoFs(2);
      else enterDemoFs(box, demoMode === 0 || v.ended);
    });
    v.addEventListener('play', () => { v.volume = demoVol; v.muted = demoMuted; box.classList.add('playing'); });
    v.addEventListener('pause', () => box.classList.remove('playing'));
    v.addEventListener('ended', () => { if (demoMode === 1 && box.classList.contains('is-fs')) exitDemoFs(2); });
    if (input) input.addEventListener('change', () => { if (input.files[0]) { v.src = URL.createObjectURL(input.files[0]); v.load(); } });

    const volCtrl = box.querySelector('.vol-ctrl');
    if (volCtrl) {
      ['click', 'pointerdown', 'mousedown'].forEach((ev) => volCtrl.addEventListener(ev, (e) => e.stopPropagation()));
      const slider = volCtrl.querySelector('[data-vol-slider]');
      const muteBtn = volCtrl.querySelector('[data-vol-mute]');
      if (slider) {
        slider.addEventListener('input', () => setVolume(Number(slider.value) / 100));
        slider.addEventListener('change', () => slider.blur());
        slider.addEventListener('pointerup', () => slider.blur());
      }
      if (muteBtn) muteBtn.addEventListener('click', () => { toggleMute(); muteBtn.blur(); });
    }
  });
  applyVolumeToAll();

  addEventListener('mousemove', wakeHud);

  show(cur);
})();
