// Ranking top 10 w Supabase. Bez DOM i Canvas; jedyny kontakt z otoczeniem to fetch i eksport window.SnakeRanking.
(function (global) {
  'use strict';

  var TOP_N = 10;
  var MAX_NAME = 20;

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

  global.SnakeRanking = {
    normalizeName: normalizeName,
    qualifies: qualifies
  };
})(window);
