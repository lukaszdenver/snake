// Efekty specjalne: wybuchy iskier, fale, unoszące się napisy, trzęsienie planszy, błysk i konfetti.
// Pozycje liczone wzorem z czasu narodzin, więc stan nie zależy od liczby klatek.
// Rysuje na podanym kontekście Canvas; jedyny kontakt z otoczeniem to eksport window.SnakeFx.
(function (global) {
  'use strict';

  var MAX_PARTICLES = 700;
  var SPARK_GRAVITY = 0.0006;     // px / ms²
  var CONFETTI_GRAVITY = 0.00012;
  var RING_MS = 450;
  var TEXT_MS = 800;
  var TEXT_RISE_PX = 40;
  var CONFETTI_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#ffffff'];

  function between(rng, min, max) {
    return min + rng() * (max - min);
  }

  function createFx(rng) {
    return {
      rng: rng || Math.random,
      particles: [],
      rings: [],
      texts: [],
      shakeState: null,
      flashState: null
    };
  }

  // Najstarsze cząsteczki ustępują nowym, żeby gra nie zwolniła przy serii wybuchów.
  function addParticle(fx, p) {
    fx.particles.push(p);
    if (fx.particles.length > MAX_PARTICLES) fx.particles.splice(0, fx.particles.length - MAX_PARTICLES);
  }

  // Iskry rozlatujące się we wszystkie strony z prędkością do `speed` px/ms.
  function burst(fx, x, y, colors, t, count, speed) {
    for (var i = 0; i < count; i++) {
      var angle = fx.rng() * Math.PI * 2;
      var v = between(fx.rng, 0.3, 1) * speed;
      addParticle(fx, {
        kind: 'spark',
        x: x,
        y: y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        g: SPARK_GRAVITY,
        born: t,
        life: between(fx.rng, 400, 1000),
        size: between(fx.rng, 1.2, 3),
        color: colors[Math.floor(fx.rng() * colors.length)]
      });
    }
  }

  function confetti(fx, width, t, count) {
    for (var i = 0; i < count; i++) {
      addParticle(fx, {
        kind: 'confetti',
        x: fx.rng() * width,
        y: between(fx.rng, -120, -8),
        vx: between(fx.rng, -0.03, 0.03),
        vy: between(fx.rng, 0.05, 0.15),
        g: CONFETTI_GRAVITY,
        sway: between(fx.rng, 4, 14),
        spin: between(fx.rng, -0.012, 0.012),
        born: t,
        life: between(fx.rng, 2200, 3200),
        size: between(fx.rng, 4, 7),
        color: CONFETTI_COLORS[Math.floor(fx.rng() * CONFETTI_COLORS.length)]
      });
    }
  }

  function ring(fx, x, y, color, t) {
    fx.rings.push({ x: x, y: y, color: color, born: t });
  }

  function floatText(fx, x, y, text, t, color) {
    fx.texts.push({ x: x, y: y, text: text, color: color || '#ffffff', born: t });
  }

  function shake(fx, t, strength, duration) {
    fx.shakeState = { start: t, strength: strength, duration: duration };
  }

  function flash(fx, t, color, duration) {
    fx.flashState = { start: t, color: color, duration: duration };
  }

  function particlePos(p, t) {
    var age = t - p.born;
    var x = p.x + p.vx * age;
    if (p.sway) x += Math.sin(age * 0.004 + p.born) * p.sway;
    return { x: x, y: p.y + p.vy * age + 0.5 * p.g * age * age };
  }

  // Napis wznosi się z wyhamowaniem; przez pierwszą połowę życia w pełni widoczny, potem gaśnie.
  function textState(text, t) {
    var progress = Math.min(1, Math.max(0, (t - text.born) / TEXT_MS));
    var eased = 1 - (1 - progress) * (1 - progress);
    return {
      x: text.x,
      y: text.y - TEXT_RISE_PX * eased,
      alpha: progress < 0.5 ? 1 : 1 - (progress - 0.5) / 0.5,
      scale: 1 + 0.4 * (1 - eased)
    };
  }

  // Przesunięcie planszy: drgania słabnące kwadratowo do zera w czasie trwania trzęsienia.
  function shakeOffset(fx, t) {
    var s = fx.shakeState;
    if (!s || t < s.start || t >= s.start + s.duration) return { x: 0, y: 0 };
    var progress = (t - s.start) / s.duration;
    var amp = s.strength * (1 - progress) * (1 - progress);
    var age = t - s.start;
    return { x: Math.sin(age * 0.09 + 1) * amp, y: Math.cos(age * 0.13 + 2) * amp };
  }

  function prune(fx, t) {
    fx.particles = fx.particles.filter(function (p) { return t - p.born <= p.life; });
    fx.rings = fx.rings.filter(function (r) { return t - r.born <= RING_MS; });
    fx.texts = fx.texts.filter(function (x) { return t - x.born <= TEXT_MS; });
  }

  function drawRings(ctx, fx, t) {
    fx.rings.forEach(function (r) {
      var progress = (t - r.born) / RING_MS;
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - progress) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + 34 * (1 - (1 - progress) * (1 - progress)), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function drawParticles(ctx, fx, t) {
    fx.particles.forEach(function (p) {
      var age = t - p.born;
      if (age < 0) return;
      var pos = particlePos(p, t);
      var fade = age / p.life;
      if (p.kind === 'confetti') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade > 0.8 ? (1 - fade) / 0.2 : 1;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(age * p.spin);
        // Spłaszczanie w rytmie obrotu udaje kartkę wirującą w powietrzu.
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(age * 0.01)) + 0.5);
        ctx.restore();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - fade * fade;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * (1 - 0.5 * fade), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTexts(ctx, fx, t) {
    fx.texts.forEach(function (x) {
      var s = textState(x, t);
      ctx.globalAlpha = s.alpha;
      ctx.font = '700 ' + Math.round(20 * s.scale) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.strokeText(x.text, s.x, s.y);
      ctx.fillStyle = x.color;
      ctx.fillText(x.text, s.x, s.y);
    });
  }

  // Fale, iskry, konfetti i napisy; usuwa przy okazji wygasłe elementy.
  function draw(ctx, fx, t) {
    prune(fx, t);
    ctx.save();
    drawRings(ctx, fx, t);
    drawParticles(ctx, fx, t);
    drawTexts(ctx, fx, t);
    ctx.restore();
  }

  function drawFlash(ctx, fx, t, width, height) {
    var f = fx.flashState;
    if (!f || t < f.start || t >= f.start + f.duration) return;
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - (t - f.start) / f.duration);
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  global.SnakeFx = {
    createFx: createFx,
    burst: burst,
    confetti: confetti,
    ring: ring,
    floatText: floatText,
    shake: shake,
    flash: flash,
    particlePos: particlePos,
    textState: textState,
    shakeOffset: shakeOffset,
    prune: prune,
    draw: draw,
    drawFlash: drawFlash
  };
})(window);
