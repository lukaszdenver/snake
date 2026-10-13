// Ranking top 10 w Supabase. Bez DOM i Canvas; jedyny kontakt z otoczeniem to fetch i eksport window.SnakeRanking.
(function (global) {
  'use strict';

  var TOP_N = 10;
  var MAX_NAME = 20;
  var TIMEOUT_MS = 8000;
  var ENDPOINT = 'https://bakmagtitoppdzuolyvg.supabase.co/rest/v1/wyniki';
  // Klucz publishable jest publiczny z założenia; dostęp ogranicza RLS w supabase/ranking.sql.
  var API_KEY = 'sb_publishable_gTyd8RfeoCgdeFwVjXxVRA_9BV-POkI';

  // Długość liczona w punktach kodowych, tak jak char_length w Postgresie (emoji = 1 znak).
  function normalizeName(raw) {
    var trimmed = String(raw == null ? '' : raw).trim();
    var name = Array.from(trimmed).slice(0, MAX_NAME).join('').trim();
    return name ? name : null;
  }

  // Remis z 10. miejscem nie wystarcza: przy równych punktach wyżej jest starszy wpis.
  function qualifies(top, score) {
    if (score < 1) return false;
    return top.length < TOP_N || score > top[TOP_N - 1].punkty;
  }

  // fetch z kluczem i limitem czasu; status spoza 2xx to błąd.
  function request(url, options) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    options.signal = ctrl.signal;
    options.headers = Object.assign({ apikey: API_KEY }, options.headers);
    return fetch(url, options).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function fetchTop() {
    var url = ENDPOINT + '?select=imie,punkty&order=punkty.desc,utworzono.asc&limit=' + TOP_N;
    return request(url, { method: 'GET' }).then(function (res) { return res.json(); });
  }

  function submit(name, score) {
    var imie = normalizeName(name);
    if (imie === null) return Promise.reject(new Error('Puste imię'));
    return request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ imie: imie, punkty: score })
    }).then(function () {});
  }

  global.SnakeRanking = {
    normalizeName: normalizeName,
    qualifies: qualifies,
    fetchTop: fetchTop,
    submit: submit
  };
})(window);
