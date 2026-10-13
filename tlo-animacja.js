// Animowane niebo na planszy: migające gwiazdki i spadające gwiazdy. Rysuje na podanym kontekście Canvas;
// jedyny kontakt z otoczeniem to eksport window.SnakeSky.
(function (global) {
  'use strict';

  var STAR_COUNT = 40;
  var STAR_COLORS = ['255, 255, 255', '255, 236, 179', '200, 220, 255'];
  var SPARKLE_SHARE = 0.25;
  var SHOT_MIN_GAP_MS = 4000;
  var SHOT_MAX_GAP_MS = 12000;
  var SHOT_DURATION_MS = 700;
  var SHOT_SPEED_PX_PER_MS = 0.22;

  function between(rng, min, max) {
    return min + rng() * (max - min);
  }

  function createSky(width, height, rng) {
    rng = rng || Math.random;
    var stars = [];
    for (var i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: rng() * width,
        y: rng() * height,
        r: between(rng, 0.6, 1.6),
        period: between(rng, 2000, 6000),
        phase: rng() * Math.PI * 2,
        color: STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)],
        sparkle: rng() < SPARKLE_SHARE
      });
    }
    return { width: width, height: height, rng: rng, stars: stars, nextShotAt: null, shot: null };
  }

  // Czwarta potęga sinusoidy: gwiazdka przez większość czasu przygaszona, krótko rozbłyskuje.
  function starBrightness(star, t) {
    var wave = 0.5 + 0.5 * Math.sin((t / star.period) * Math.PI * 2 + star.phase);
    return 0.15 + 0.85 * Math.pow(wave, 4);
  }

  function nextGap(sky) {
    return between(sky.rng, SHOT_MIN_GAP_MS, SHOT_MAX_GAP_MS);
  }

  // Zwraca bieżącą spadającą gwiazdę ({x, y, dx, dy, length, alpha}) albo null; sama planuje następną.
  function updateShootingStar(sky, t) {
    if (sky.nextShotAt === null) sky.nextShotAt = t + nextGap(sky);

    if (sky.shot && t - sky.shot.start >= SHOT_DURATION_MS) {
      sky.shot = null;
      sky.nextShotAt = t + nextGap(sky);
    }

    if (!sky.shot && t >= sky.nextShotAt) {
      var angle = between(sky.rng, 25, 40) * Math.PI / 180;
      sky.shot = {
        start: t,
        x0: sky.rng() * sky.width * 0.7,
        y0: sky.rng() * sky.height * 0.4,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        length: between(sky.rng, 60, 110)
      };
    }

    if (!sky.shot) return null;

    var s = sky.shot;
    var elapsed = t - s.start;
    var travelled = elapsed * SHOT_SPEED_PX_PER_MS;
    return {
      x: s.x0 + s.dx * travelled,
      y: s.y0 + s.dy * travelled,
      dx: s.dx,
      dy: s.dy,
      length: s.length,
      // Płynne pojawienie się i zniknięcie.
      alpha: Math.sin(Math.PI * elapsed / SHOT_DURATION_MS)
    };
  }

  function drawStar(ctx, star, b) {
    ctx.fillStyle = 'rgba(' + star.color + ', ' + b + ')';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();

    if (!star.sparkle || b <= 0.6) return;
    // Czteroramienny błysk tylko w szczycie rozbłysku.
    var ray = star.r * 6 * b;
    ctx.strokeStyle = 'rgba(' + star.color + ', ' + ((b - 0.6) / 0.4 * 0.9) + ')';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(star.x - ray, star.y);
    ctx.lineTo(star.x + ray, star.y);
    ctx.moveTo(star.x, star.y - ray);
    ctx.lineTo(star.x, star.y + ray);
    ctx.stroke();
  }

  function drawShootingStar(ctx, shot) {
    var tailX = shot.x - shot.dx * shot.length;
    var tailY = shot.y - shot.dy * shot.length;
    var trail = ctx.createLinearGradient(shot.x, shot.y, tailX, tailY);
    trail.addColorStop(0, 'rgba(255, 255, 255, ' + shot.alpha + ')');
    trail.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
  }

  // still = true (systemowe „ogranicz animacje”): gwiazdki świecą stałym blaskiem, bez spadających gwiazd.
  function draw(ctx, sky, t, still) {
    for (var i = 0; i < sky.stars.length; i++) {
      drawStar(ctx, sky.stars[i], still ? 0.6 : starBrightness(sky.stars[i], t));
    }
    if (still) return;
    var shot = updateShootingStar(sky, t);
    if (shot) drawShootingStar(ctx, shot);
  }

  global.SnakeSky = {
    createSky: createSky,
    starBrightness: starBrightness,
    updateShootingStar: updateShootingStar,
    draw: draw
  };
})(window);
