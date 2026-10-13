// Konta graczy w Supabase Auth. Bez DOM i Canvas; jedyne kontakty z otoczeniem to fetch,
// localStorage (sesja) i eksport window.SnakeAccount.
(function (global) {
  'use strict';

  var AUTH_URL = 'https://bakmagtitoppdzuolyvg.supabase.co/auth/v1';
  // Klucz publishable jest publiczny z założenia; dostęp do danych ogranicza RLS w supabase/konta.sql.
  var API_KEY = 'sb_publishable_gTyd8RfeoCgdeFwVjXxVRA_9BV-POkI';
  // Supabase Auth wymaga e-maila; example.com jest zarezerwowana (RFC 2606), więc adres nikogo nie dotyczy.
  var EMAIL_DOMAIN = '@gracze.example.com';
  var SESSION_KEY = 'snake.sesja';
  var TIMEOUT_MS = 8000;
  var REFRESH_MARGIN_MS = 60000;
  var MIN_PASSWORD_CHARS = 8;
  var MAX_PASSWORD_BYTES = 72;  // limit haszowania bcrypt w Supabase Auth

  var ERROR_CODES = {
    user_already_exists: 'login_taken',
    invalid_credentials: 'invalid_credentials',
    weak_password: 'weak_password'
  };

  function normalizeLogin(raw) {
    var login = String(raw == null ? '' : raw).trim().toLowerCase();
    return /^[a-z0-9_]{3,20}$/.test(login) ? login : null;
  }

  function passwordError(password) {
    var p = String(password == null ? '' : password);
    if (Array.from(p).length < MIN_PASSWORD_CHARS) return 'too_short';
    if (new TextEncoder().encode(p).length > MAX_PASSWORD_BYTES) return 'too_long';
    return null;
  }

  function loginToEmail(login) {
    return login + EMAIL_DOMAIN;
  }

  function needsRefresh(session, nowMs) {
    return session.expires_at * 1000 - nowMs < REFRESH_MARGIN_MS;
  }

  function authErrorCode(status, body) {
    return (body && ERROR_CODES[body.error_code]) || 'unknown';
  }

  function fail(code, cause) {
    var err = new Error(code);
    err.code = code;
    err.cause = cause;
    return err;
  }

  // POST do Supabase Auth z limitem czasu; błąd sieci -> 'network', status spoza 2xx -> kod z authErrorCode.
  function authRequest(path, body, token) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var headers = { apikey: API_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(AUTH_URL + path, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctrl.signal })
      .then(function (res) {
        return res.text().then(function (text) { return { res: res, text: text }; });
      })
      .then(function (r) {
        clearTimeout(timer);
        var data = null;
        try { data = r.text ? JSON.parse(r.text) : null; } catch (e) { data = null; }
        if (!r.res.ok) throw fail(authErrorCode(r.res.status, data));
        return data;
      }, function (err) {
        clearTimeout(timer);
        throw fail('network', err);
      });
  }

  function toSession(data, login) {
    if (!data || !data.access_token || !data.refresh_token || !data.user) throw fail('unknown');
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
      user_id: data.user.id,
      login: login
    };
  }

  function store(session) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* bez pamięci sesja żyje do odświeżenia */ }
    return session;
  }

  function clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* nic do wyczyszczenia */ }
  }

  function currentSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY));
      return s && s.access_token && s.refresh_token && s.user_id && s.login ? s : null;
    } catch (e) {
      return null;
    }
  }

  function signUp(login, password) {
    return authRequest('/signup', { email: loginToEmail(login), password: password, data: { login: login } })
      .then(function (data) { return store(toSession(data, login)); });
  }

  function signIn(login, password) {
    return authRequest('/token?grant_type=password', { email: loginToEmail(login), password: password })
      .then(function (data) { return store(toSession(data, login)); });
  }

  function signOut() {
    var s = currentSession();
    clear();
    if (!s) return Promise.resolve();
    return authRequest('/logout', {}, s.access_token).then(function () {}, function () {});
  }

  // Jedno odnawianie naraz: Supabase rotuje refresh_token, więc drugie równoległe zapytanie użyłoby zużytego.
  var refreshing = null;

  function validSession() {
    var s = currentSession();
    if (!s) return Promise.reject(fail('session_expired'));
    if (!needsRefresh(s, Date.now())) return Promise.resolve(s);
    if (!refreshing) {
      refreshing = authRequest('/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
        .then(function (data) {
          return store(toSession(data, s.login));
        }, function (err) {
          if (err.code === 'network') throw err;
          clear();
          throw fail('session_expired', err);
        })
        .then(function (fresh) {
          refreshing = null;
          return fresh;
        }, function (err) {
          refreshing = null;
          throw err;
        });
    }
    return refreshing;
  }

  global.SnakeAccount = {
    normalizeLogin: normalizeLogin,
    passwordError: passwordError,
    loginToEmail: loginToEmail,
    needsRefresh: needsRefresh,
    authErrorCode: authErrorCode,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    currentSession: currentSession,
    validSession: validSession
  };
})(window);
