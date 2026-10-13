// Ranking gry Snake w Supabase w imieniu zalogowanego gracza. Bez DOM i Canvas;
// jedyny kontakt z otoczeniem to fetch i eksport window.SnakeRanking.
(function (global) {
  'use strict';

  var TOP_N = 10;
  var TIMEOUT_MS = 8000;
  var REST_URL = 'https://bakmagtitoppdzuolyvg.supabase.co/rest/v1';
  // Klucz publishable jest publiczny z założenia; dostęp ogranicza RLS w supabase/konta.sql.
  var API_KEY = 'sb_publishable_gTyd8RfeoCgdeFwVjXxVRA_9BV-POkI';

  // Remis z dotychczasowym rekordem nie jest nowym rekordem.
  function isPersonalBest(myTop, score) {
    if (score < 1) return false;
    return myTop.length === 0 || score > myTop[0].punkty;
  }

  // fetch z kluczem, tokenem gracza i limitem czasu (także na odczyt treści); status spoza 2xx to błąd.
  function request(session, path, options) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    options.signal = ctrl.signal;
    options.headers = Object.assign({ apikey: API_KEY, Authorization: 'Bearer ' + session.access_token }, options.headers);
    return fetch(REST_URL + path, options)
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return text ? JSON.parse(text) : null;
        });
      })
      .then(function (data) {
        clearTimeout(timer);
        return data;
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function fetchGlobalTop(session) {
    return request(session, '/najlepsze_wyniki?select=login,punkty&order=punkty.desc,utworzono.asc&limit=' + TOP_N, { method: 'GET' });
  }

  function fetchMyTop(session) {
    var path = '/wyniki?select=punkty,utworzono&gracz_id=eq.' + encodeURIComponent(session.user_id) +
      '&order=punkty.desc,utworzono.asc&limit=' + TOP_N;
    return request(session, path, { method: 'GET' });
  }

  function submit(session, score) {
    return request(session, '/wyniki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ punkty: score })
    }).then(function () {});
  }

  global.SnakeRanking = {
    isPersonalBest: isPersonalBest,
    fetchGlobalTop: fetchGlobalTop,
    fetchMyTop: fetchMyTop,
    submit: submit
  };
})(window);
