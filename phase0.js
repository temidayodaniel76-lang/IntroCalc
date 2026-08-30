(function(){
  'use strict';

  /* ============================================================
     OVERVIEW VIDEO CONFIGURATION

     This is the ONLY place you need to edit to swap in your own
     overview video. Each setting accepts either:

       a) a relative local path, for example
          'assets/videos/my-overview.mp4'
          with the file kept next to this HTML file, or

       b) an embedded data URI, which keeps the package as one
          self-contained file that works anywhere.

     Leave captions as an empty string until you have a .vtt file.
     The video still plays normally without captions.
     Do not use YouTube, Vimeo or any other external address, as
     the package must keep working with no internet connection.
     ============================================================ */
  var OVERVIEW_VIDEO = {
    // VIDEO SOURCE: the MP4 file to play.
    src: 'assets/video/env02-overview-PLACEHOLDER.mp4',
    type: 'video/mp4',

    // VIDEO POSTER: the still image shown before playback begins.
    poster: 'assets/image/env02-overview-PLACEHOLDER-poster.jpg',

    // VIDEO CAPTIONS: path to a local .vtt file, for example
    // 'assets/captions/overview.vtt'. Empty string means none yet.
    captions: '',
    captionsLabel: 'English captions',
    captionsLang: 'en',

    // Accessible description of the video for screen reader users.
    description: 'Overview video introducing Phase 0.'
  };


  /* ============================================================
     FOUNDATION 1: SAFE LOCAL STORAGE
     One namespaced key. Every access is wrapped, because some
     browsers refuse localStorage under the file:// protocol and
     an uncaught error there would break the whole package.
     If storage is unavailable the session continues in memory.
     ============================================================ */
  var STORAGE_KEY = 'chalkie.phase0';

  var Store = (function () {
    var memory = {};
    var usable = (function () {
      try {
        var probe = '__phase0_probe__';
        window.localStorage.setItem(probe, probe);
        window.localStorage.removeItem(probe);
        return true;
      } catch (e) {
        return false;
      }
    })();

    return {
      usable: usable,
      read: function () {
        try {
          var raw = usable ? window.localStorage.getItem(STORAGE_KEY) : memory[STORAGE_KEY];
          return raw ? JSON.parse(raw) : {};
        } catch (e) {
          return {};
        }
      },
      write: function (obj) {
        try {
          var raw = JSON.stringify(obj);
          if (usable) { window.localStorage.setItem(STORAGE_KEY, raw); }
          else { memory[STORAGE_KEY] = raw; }
        } catch (e) { /* storage unavailable, continue without persisting */ }
      },
      clear: function () {
        try {
          if (usable) { window.localStorage.removeItem(STORAGE_KEY); }
          else { delete memory[STORAGE_KEY]; }
        } catch (e) { /* nothing further to do */ }
      }
    };
  })();

  /* ============================================================
     FOUNDATION 2: CENTRAL STATE
     Replaces the scattered closure variables that previously held
     progress. Everything resettable lives here.
     ============================================================ */
  function freshProgress() {
    return {
      currentEnvironment: 1,
      s3Answered: [],   // ids of Slide 3 cards answered this session
      env4Answered: false,
      env5Answered: false,
      env6Answered: false,
      env7Answered: false,
      env8Answered: false,
      reflection: ''
    };
  }

  var State = {
    nickname: '',
    progress: freshProgress()
  };

  (function hydrateFromStorage() {
    var saved = Store.read();
    if (saved && typeof saved.nickname === 'string') {
      State.nickname = saved.nickname;
    }
  })();

  function persist() {
    Store.write({
      nickname: State.nickname,
      currentEnvironment: State.progress.currentEnvironment
    });
  }

  /* ============================================================
     FOUNDATION 3: NAVIGATION
     The environment count and the cover position are derived from
     the document rather than hard coded, so later stages can insert
     new environments without editing this block or any existing one.
     ============================================================ */
  var animating = false;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) { document.body.classList.add('reduced-motion'); }

  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'));
  var backBtn = document.getElementById('backBtn');
  var nextBtn = document.getElementById('nextBtn');
  var navLabel = document.getElementById('navLabel');
  var progressFill = document.getElementById('progressFill');
  var progressDots = document.getElementById('progressDots');
  var footerNav = document.querySelector('footer.chrome-bottom');

  var TOTAL = screens.length;
  var current = 1;

  // Screens that hide the footer navigation because they carry their own
  // single call to action. Identified by content, not by a fixed number.
  function indexOfScreenContaining(elementId) {
    var el = document.getElementById(elementId);
    if (!el) return -1;
    for (var k = 0; k < screens.length; k++) {
      if (screens[k].contains(el)) return k + 1;
    }
    return -1;
  }
  var COVER_INDEX = indexOfScreenContaining('coverBeginBtn');
  var WELCOME_INDEX = indexOfScreenContaining('nicknameInput');

  // Environments that carry their own single call to action and therefore
  // hide the shared footer navigation.
  function hidesFooter(n) {
    return n === COVER_INDEX || n === WELCOME_INDEX;
  }

  /* ---------- progress dots ---------- */
  for (var i = 1; i <= TOTAL; i++) {
    var d = document.createElement('span');
    d.className = 'dot';
    d.dataset.n = String(i);
    progressDots.appendChild(d);
  }

  function updateChrome() {
    navLabel.textContent = current + ' / ' + TOTAL;
    progressFill.style.width = (current / TOTAL * 100) + '%';
    var dots = progressDots.querySelectorAll('.dot');
    dots.forEach(function (dot) {
      var n = parseInt(dot.dataset.n, 10);
      dot.classList.toggle('done', n < current);
      dot.classList.toggle('now', n === current);
    });
    backBtn.disabled = (current === 1);
    footerNav.classList.toggle('is-cover-hidden', hidesFooter(current));
    if (current === TOTAL) {
      nextBtn.innerHTML = 'Restart<svg class="icon"><use href="#ic-arrow"></use></svg>';
    } else {
      nextBtn.innerHTML = 'Next<svg class="icon"><use href="#ic-arrow"></use></svg>';
    }
  }

  /* ---------- spring physics transition ---------- */
  function spring(from, to, opts) {
    var stiffness = opts.stiffness || 150;
    var damping = opts.damping || 17;
    var mass = opts.mass || 1;
    var value = from, velocity = 0;
    var last = null;
    function step(now) {
      if (last === null) last = now;
      var dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      var forceSpring = -stiffness * (value - to);
      var forceDamp = -damping * velocity;
      var accel = (forceSpring + forceDamp) / mass;
      velocity += accel * dt;
      value += velocity * dt;
      opts.onUpdate(value);
      if (Math.abs(to - value) > 0.001 || Math.abs(velocity) > 0.001) {
        requestAnimationFrame(step);
      } else {
        opts.onUpdate(to);
        if (opts.onComplete) opts.onComplete();
      }
    }
    requestAnimationFrame(step);
  }

  function goTo(targetScreen, dir) {
    if (animating) return;
    if (targetScreen < 1 || targetScreen > TOTAL) return;
    if (targetScreen === current) return;
    var curEl = screens[current - 1];
    var nxtEl = screens[targetScreen - 1];
    animating = true;
    backBtn.disabled = true; nextBtn.disabled = true;

    function settle() {
      current = targetScreen;
      State.progress.currentEnvironment = current;
      persist();
      updateChrome();
      animating = false;
      backBtn.disabled = (current === 1); nextBtn.disabled = false;
    }

    if (reduceMotion) {
      curEl.classList.remove('active');
      nxtEl.classList.add('active');
      nxtEl.scrollTop = 0;
      settle();
      return;
    }

    nxtEl.style.display = 'flex';
    nxtEl.style.zIndex = 2;
    curEl.style.zIndex = 1;

    spring(0, 1, {
      stiffness: 150, damping: 18, mass: 1,
      onUpdate: function (p) {
        var q = 1 - p;
        curEl.style.transform = 'translateX(' + (dir * -70 * p) + 'px) translateZ(' + (-180 * p) + 'px) rotateY(' + (dir * -13 * p) + 'deg)';
        curEl.style.opacity = String(Math.max(0, 1 - p * 1.05));
        nxtEl.style.transform = 'translateX(' + (dir * 70 * q) + 'px) translateZ(' + (-180 * q) + 'px) rotateY(' + (dir * 13 * q) + 'deg)';
        nxtEl.style.opacity = String(Math.max(0, 1 - q * 1.05));
      },
      onComplete: function () {
        curEl.classList.remove('active');
        curEl.style.display = 'none';
        curEl.style.transform = ''; curEl.style.opacity = ''; curEl.style.zIndex = '';
        nxtEl.classList.add('active');
        nxtEl.style.transform = ''; nxtEl.style.opacity = ''; nxtEl.style.zIndex = '';
        nxtEl.scrollTop = 0;
        settle();
      }
    });
  }

  /* ============================================================
     FOUNDATION 4: RESET
     resetAll() returns the package to a genuine fresh session.
     Slide 3 is a locked component, so it is reset from the outside
     only: its visible state is cleared through the DOM, and its
     scenario pager is returned to position one by using its own
     Back control, which keeps its internal index in step without
     editing the component.
     ============================================================ */

  function resetLockedSlide3FromOutside() {
    var s3 = document.getElementById('screen-3');
    if (!s3) return;

    s3.querySelectorAll('.flashcard').forEach(function (card) {
      card.classList.remove('flipped');
      card.setAttribute('aria-expanded', 'false');
      var fb = card.querySelector('.flash-feedback');
      if (fb) {
        fb.hidden = true;
        fb.textContent = '';
        fb.classList.remove('good', 'bad');
      }
      card.querySelectorAll('.choice-btn').forEach(function (b) {
        b.classList.remove('is-correct', 'is-incorrect', 'is-selected');
        b.tabIndex = -1;
      });
    });

    var summary = document.getElementById('s3-summary');
    if (summary) summary.classList.remove('show');

    var scenarioBack = document.getElementById('scenarioBackBtn');
    if (scenarioBack) {
      var guardCount = 0;
      while (!scenarioBack.disabled && guardCount < 10) {
        scenarioBack.click();
        guardCount++;
      }
    }
  }

  function resetRevealTargets(ids) {
    ids.forEach(function (id) {
      var target = document.getElementById(id);
      if (target) target.setAttribute('hidden', '');
      var trigger = document.querySelector('[data-reveal-target="' + id + '"]');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        if (trigger.dataset.labelOpen) trigger.textContent = trigger.dataset.labelOpen;
      }
    });
  }

  function resetAll() {
    State.progress = freshProgress();
    persist();

    resetLockedSlide3FromOutside();

    // Environments 4, 5 and 6: clear answers, feedback and reveals
    ['env4', 'env5', 'env6'].forEach(function (env) {
      document.querySelectorAll('.' + env + '-opt').forEach(function (b) {
        b.classList.remove('is-correct', 'is-incorrect', 'is-selected');
        b.disabled = false;
      });
      var fb = document.getElementById(env + 'Feedback');
      if (fb) { fb.classList.remove('show', 'good', 'think'); fb.textContent = ''; }
      var rv = document.getElementById(env + 'Reveal');
      if (rv) rv.classList.remove('show');
    });
    var env4Gap = document.getElementById('env4Gap');
    if (env4Gap) env4Gap.classList.remove('show');
    // Scene 7: clear its three staged questions, table and clock
    ['s7q1-opt', 's7q2-opt', 's7q3-opt'].forEach(function (cls) {
      document.querySelectorAll('.' + cls).forEach(function (b) {
        b.classList.remove('is-selected', 'is-correct', 'is-incorrect');
      });
    });
    ['s7Q1Feedback', 's7Q2Feedback', 's7Q3Feedback'].forEach(function (id) {
      var f = document.getElementById(id);
      if (f) { f.classList.remove('show', 'good', 'think'); f.textContent = ''; }
    });
    // Scene 7: relock steps 2 and 3, return to step 1
    [1, 2, 3].forEach(function (n) {
      var tab = document.getElementById('s7Tab' + n);
      var pnl = document.getElementById('s7Panel' + n);
      if (tab) {
        tab.classList.remove('is-done');
        tab.setAttribute('aria-selected', n === 1 ? 'true' : 'false');
        tab.disabled = (n !== 1);
      }
      if (pnl) { pnl.classList.toggle('active', n === 1); pnl.classList.remove('is-complete'); }
      var nb = document.getElementById('s7Next' + n);
      if (nb) nb.classList.remove('show');
    });

    var s7Results = document.getElementById('s7Results');
    if (s7Results) s7Results.hidden = true;
    var s7CloseEl = document.getElementById('s7Close');
    if (s7CloseEl) s7CloseEl.classList.remove('show');
    var s7Progress = document.getElementById('s7Progress');
    if (s7Progress) s7Progress.textContent = '0 of 3 complete';
    ['s7EndA', 's7EndB'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
    var s7Clock = document.getElementById('s7Clock');
    if (s7Clock) s7Clock.textContent = '0';
    ['env4Video', 'env5VideoA', 'env5VideoB', 's7VideoA', 's7VideoB'].forEach(function (id) {
      var v = document.getElementById(id);
      if (v) { try { v.pause(); v.currentTime = 0; } catch (e) { /* ignore */ } }
    });

    // Environment 6, generator slider back to zero
    var slider = document.getElementById('timeSlider');
    if (slider) {
      slider.value = 0;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var s6take = document.getElementById('s6-takeaway');
    if (s6take) s6take.classList.remove('show');
    var s6q = document.getElementById('s6-question');
    if (s6q) s6q.hidden = true;
    document.querySelectorAll('.s6-opt').forEach(function (b) {
      b.classList.remove('is-selected', 'is-correct', 'is-incorrect');
    });
    var s6fb = document.getElementById('s6Feedback');
    if (s6fb) { s6fb.classList.remove('show', 'good', 'think'); s6fb.textContent = ''; }

    // Environment 7, audio and its answers
    var audio = document.getElementById('trafficAudio');
    if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ } }
    resetRevealTargets(['transcriptPanel']);
    ['e8q1-opt', 'e8q2-opt', 'e8q3-opt'].forEach(function (cls) {
      document.querySelectorAll('.' + cls).forEach(function (b) {
        b.classList.remove('is-selected', 'is-correct', 'is-incorrect');
      });
    });
    ['e8Q1Feedback', 'e8Q2Feedback', 'e8Q3Feedback'].forEach(function (id) {
      var f = document.getElementById(id);
      if (f) { f.classList.remove('show', 'good', 'think'); f.textContent = ''; }
    });
    [1, 2, 3].forEach(function (n) {
      var tab = document.getElementById('e8Tab' + n);
      var pnl = document.getElementById('e8Panel' + n);
      if (tab) { tab.classList.remove('is-done'); tab.setAttribute('aria-selected', n === 1 ? 'true' : 'false'); tab.disabled = (n !== 1); }
      if (pnl) pnl.classList.toggle('active', n === 1);
      var nb = document.getElementById('e8Next' + n);
      if (nb) nb.classList.remove('show');
    });
    var e8p = document.getElementById('e8Progress');
    if (e8p) e8p.textContent = '0 of 3 complete';
    var trackFill = document.getElementById('audioTrackFill');
    if (trackFill) trackFill.style.width = '0%';
    var audioTime = document.getElementById('audioTime');
    if (audioTime) audioTime.textContent = '0:00';

    // Environment 8, sorting chips back to the pool
    var pool = document.getElementById('chipPool');
    ['trayA', 'trayB'].forEach(function (trayId) {
      var tray = document.getElementById(trayId);
      if (!tray || !pool) return;
      tray.querySelectorAll('.chip').forEach(function (chip) {
        var actions = chip.querySelector('.chip-actions');
        if (actions) {
          actions.innerHTML = '<button class="chip-btn" data-move="A">Group A</button><button class="chip-btn" data-move="B">Group B</button>';
        }
        pool.appendChild(chip);
      });
    });
    var s8answer = document.getElementById('s8-answer');
    if (s8answer) s8answer.classList.remove('show');
    var s8reveal = document.getElementById('s8-reveal-btn');
    if (s8reveal) s8reveal.classList.remove('ready');

    // Environment 9, reflection
    var think = document.getElementById('thinkBox');
    if (think) think.value = '';
    resetRevealTargets(['modelAnswer']);
  }

  /* ============================================================
     FOUNDATION 5: COMPLETION GUARDS
     Some components count their own progress in private variables
     that cannot be reached from outside. After a reset those counts
     would still be satisfied, so a completion callout could reappear
     before it has been earned again. These guards hold each callout
     shut until the central state agrees it has been earned.
     Slide 3 needs this permanently because it is locked. The guards
     for Environments 4 and 5 become unnecessary once those screens
     are rebuilt in a later stage.
     ============================================================ */
  function guardCallout(elementId, isEarned) {
    var el = document.getElementById(elementId);
    if (!el || typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () {
      if (el.classList.contains('show') && !isEarned()) {
        el.classList.remove('show');
      }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function trackOnce(list, value) {
    if (list.indexOf(value) === -1) list.push(value);
  }

  // Capture phase runs before each component's own handler, so the central
  // state is already updated by the time a guard evaluates.
  document.addEventListener('click', function (e) {
    var choice = e.target.closest ? e.target.closest('#screen-3 .choice-btn') : null;
    if (choice) {
      var card = choice.closest('.flashcard');
      if (card && card.dataset.id) trackOnce(State.progress.s3Answered, card.dataset.id);
      return;
    }
  }, true);

  // Only Slide 3 still needs a guard. The environments that previously
  // required one have been rebuilt and now report to the central state
  // directly, so their guards have been removed as planned.
  guardCallout('s3-summary', function () { return State.progress.s3Answered.length >= 4; });

  /* ---------- navigation controls ---------- */
  backBtn.addEventListener('click', function () { goTo(current - 1, -1); });
  nextBtn.addEventListener('click', function () {
    if (current === TOTAL) { resetAll(); goTo(1, 1); return; }
    goTo(current + 1, 1);
  });
  document.getElementById('coverBeginBtn').addEventListener('click', function () {
    goTo(COVER_INDEX + 1, 1);
  });
  document.getElementById('restartBtn').addEventListener('click', function () {
    resetAll();
    goTo(1, 1);
  });

  /* ============================================================
     ENVIRONMENT 0: NICKNAME
     Uses the Stage 1 central state and storage layer. No second
     state system, no account, no password, no email address.
     ============================================================ */
  var NICKNAME_MAX = 20;

  var nicknameInput = document.getElementById('nicknameInput');
  var nicknameCount = document.getElementById('nicknameCount');
  var nicknameError = document.getElementById('nicknameError');
  var welcomeContinueBtn = document.getElementById('welcomeContinueBtn');
  var welcomeHeading = document.getElementById('welcomeHeading');
  var welcomeLede = document.getElementById('welcomeLede');
  var welcomeEyebrow = document.getElementById('welcomeEyebrow');
  var changeNameBtn = document.getElementById('changeNameBtn');
  var nameChipValue = document.getElementById('nameChipValue');
  var coverTagline = document.querySelector('.cover-tagline');
  var COVER_TAGLINE_BASE = coverTagline ? coverTagline.textContent : '';

  function cleanNickname(value) {
    return String(value == null ? '' : value).trim().slice(0, NICKNAME_MAX);
  }

  function updateNicknameUI() {
    var raw = nicknameInput.value;
    var cleaned = cleanNickname(raw);
    nicknameCount.textContent = raw.length + ' / ' + NICKNAME_MAX;
    welcomeContinueBtn.disabled = cleaned.length === 0;
    if (cleaned.length > 0) {
      nicknameError.classList.remove('show');
      nicknameInput.setAttribute('aria-invalid', 'false');
    }
    return cleaned;
  }

  // The stored name is applied only where it genuinely adds warmth:
  // the header chip and the cover line. Deliberately not everywhere.
  function applyNicknameToInterface() {
    var name = State.nickname;
    if (name) {
      nameChipValue.textContent = name;
      changeNameBtn.classList.add('show');
      if (coverTagline) coverTagline.textContent = 'Ready, ' + name + '? ' + COVER_TAGLINE_BASE;
    } else {
      changeNameBtn.classList.remove('show');
      if (coverTagline) coverTagline.textContent = COVER_TAGLINE_BASE;
    }
  }

  function commitNickname() {
    var cleaned = updateNicknameUI();
    if (!cleaned) {
      nicknameError.classList.add('show');
      nicknameInput.setAttribute('aria-invalid', 'true');
      nicknameInput.focus();
      return false;
    }
    State.nickname = cleaned;
    persist();
    applyNicknameToInterface();
    return true;
  }

  // A stored name is treated as a returning learner: the field is
  // prefilled and the wording changes, rather than demanding the
  // same entry again.
  function prepareWelcome() {
    if (State.nickname) {
      nicknameInput.value = State.nickname;
      welcomeEyebrow.textContent = 'Good to see you again';
      welcomeHeading.textContent = 'Welcome back';
      welcomeLede.textContent = 'We have kept your name from last time. Change it here if you would like, then continue.';
    } else {
      welcomeEyebrow.textContent = 'Before we begin';
      welcomeHeading.textContent = 'Welcome';
      welcomeLede.textContent = 'What should we call you? This is only used to make the experience feel like yours.';
    }
    updateNicknameUI();
    applyNicknameToInterface();
  }

  // When the learner opens the welcome environment from the header
  // control partway through, this remembers where they were so that
  // Continue returns them to that exact place rather than restarting
  // the journey. Null means a normal first pass through onboarding.
  var returnToEnvironment = null;

  function leaveWelcome() {
    var target = returnToEnvironment !== null ? returnToEnvironment : WELCOME_INDEX + 1;
    returnToEnvironment = null;
    goTo(target, 1);
  }

  nicknameInput.addEventListener('input', updateNicknameUI);
  nicknameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commitNickname()) leaveWelcome();
    }
  });
  welcomeContinueBtn.addEventListener('click', function () {
    if (commitNickname()) leaveWelcome();
  });

  // Small header control returning the learner to the welcome
  // environment to edit their name. Learning progress is untouched
  // and the learner is returned to the environment they came from.
  changeNameBtn.addEventListener('click', function () {
    if (current !== WELCOME_INDEX) returnToEnvironment = current;
    prepareWelcome();
    goTo(WELCOME_INDEX, current > WELCOME_INDEX ? -1 : 1);
    window.setTimeout(function () { nicknameInput.focus(); }, 460);
  });

  prepareWelcome();

  /* ============================================================
     ENVIRONMENT 2: OVERVIEW VIDEO
     Built entirely from the OVERVIEW VIDEO CONFIGURATION block at
     the top of this script. Nothing here needs editing to swap it.
     ============================================================ */
  (function setUpOverviewVideo() {
    var video = document.getElementById('overviewVideo');
    var missing = document.getElementById('overviewMissing');
    if (!video) return;

    function showMissingNotice() {
      if (missing) missing.classList.add('show');
      video.style.visibility = 'hidden';
    }

    if (OVERVIEW_VIDEO.src && String(OVERVIEW_VIDEO.src).length > 0) {
      var source = document.createElement('source');
      source.src = OVERVIEW_VIDEO.src;
      source.type = OVERVIEW_VIDEO.type || 'video/mp4';
      video.appendChild(source);

      if (OVERVIEW_VIDEO.poster) video.poster = OVERVIEW_VIDEO.poster;
      if (OVERVIEW_VIDEO.description) video.setAttribute('aria-label', OVERVIEW_VIDEO.description);

      if (OVERVIEW_VIDEO.captions) {
        var track = document.createElement('track');
        track.kind = 'captions';
        track.src = OVERVIEW_VIDEO.captions;
        track.srclang = OVERVIEW_VIDEO.captionsLang || 'en';
        track.label = OVERVIEW_VIDEO.captionsLabel || 'Captions';
        track.default = true;
        video.appendChild(track);
      }

      video.addEventListener('error', showMissingNotice);
    } else {
      showMissingNotice();
    }

    // Pause the overview whenever the learner navigates away, so audio
    // never continues underneath another environment.
    var overviewScreen = document.getElementById('screen-overview');
    if (overviewScreen && typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (!overviewScreen.classList.contains('active') && !video.paused) {
          video.pause();
        }
      }).observe(overviewScreen, { attributes: true, attributeFilter: ['class'] });
    }
  })();

  updateChrome();

  /* ============================================================
     SHARED MEDIA FOR ENVIRONMENTS 4 AND 5
     The water clip is stored once here and attached to each player
     by script, so the same footage is not embedded three times.
     This is a separate copy from the one inside Slide 3, which is
     a locked component and is not referenced or altered.
     ============================================================ */
  var SHARED_MEDIA = {
    waterVideo: 'assets/video/env04-05-water-bucket.mp4',
    waterPoster: 'assets/image/env04-05-water-bucket-poster.jpg',
    phoneClipA: 'assets/video/scene07-phone-a-20-points-per-min.mp4',
    phonePosterA: 'assets/image/scene07-phone-a-poster.jpg',
    phoneClipB: 'assets/video/scene07-phone-b-10-points-per-min.mp4',
    phonePosterB: 'assets/image/scene07-phone-b-poster.jpg'
  };

  function attachVideo(id, opts) {
    var v = document.getElementById(id);
    if (!v) return null;
    v.src = SHARED_MEDIA.waterVideo;
    v.poster = SHARED_MEDIA.waterPoster;
    if (opts && opts.rate) v.playbackRate = opts.rate;
    return v;
  }

  /* ============================================================
     ENVIRONMENT 4: HOW MUCH DID IT CHANGE?
     ============================================================ */
  (function environment4() {
    var video = attachVideo('env4Video');
    var playBtn = document.getElementById('env4Play');
    var feedback = document.getElementById('env4Feedback');
    var gap = document.getElementById('env4Gap');
    var screen = document.getElementById('screen-env4');
    if (!video || !screen) return;

    function tryPlay() {
      var p = video.play();
      if (p && p.catch) p.catch(function () { playBtn.classList.add('show'); });
    }
    playBtn.addEventListener('click', function () {
      playBtn.classList.remove('show');
      tryPlay();
    });
    if (reduceMotion) playBtn.classList.add('show');

    // Play only while this environment is on screen.
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (screen.classList.contains('active')) {
          if (!reduceMotion) tryPlay();
        } else {
          video.pause();
        }
      }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    var FEEDBACK = {
      '6': { tone: 'good', text: 'Exactly. It went from 2 litres up to 8 litres, so 6 litres were added. The size of a change is the difference between where it started and where it ended.' },
      '4': { tone: 'think', text: 'Close, but check the two readings again. It started at 2 litres and ended at 8 litres. Counting up from 2 to 8 gives a larger gap than 4.' },
      '8': { tone: 'think', text: 'That is the final reading rather than the change. The bucket already held 2 litres before the tap was opened, so not all 8 litres were added.' }
    };

    document.querySelectorAll('.env4-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var choice = btn.dataset.choice;
        var isCorrect = choice === '6';
        document.querySelectorAll('.env4-opt').forEach(function (b) {
          b.classList.remove('is-selected', 'is-correct', 'is-incorrect');
        });
        btn.classList.add('is-selected', isCorrect ? 'is-correct' : 'is-incorrect');
        var f = FEEDBACK[choice];
        feedback.textContent = f.text;
        feedback.classList.remove('good', 'think');
        feedback.classList.add('show', f.tone);
        if (isCorrect) {
          gap.classList.add('show');
          State.progress.env4Answered = true;
        }
      });
    });
  })();

  /* ============================================================
     ENVIRONMENT 5: OVER HOW LONG?
     Tap B runs the same footage at one third speed, so the same
     amount of water arrives over three times the interval. Only
     the time differs, which is what makes the comparison fair.
     ============================================================ */
  (function environment5() {
    var a = attachVideo('env5VideoA', { rate: 1 });
    var b = attachVideo('env5VideoB', { rate: 1 / 3 });
    var playBoth = document.getElementById('env5PlayBoth');
    var feedback = document.getElementById('env5Feedback');
    var reveal = document.getElementById('env5Reveal');
    var screen = document.getElementById('screen-env5');
    if (!a || !b || !screen) return;

    function runBoth() {
      [a, b].forEach(function (v) {
        try { v.pause(); v.currentTime = 0; } catch (e) { /* ignore */ }
      });
      a.playbackRate = 1;
      b.playbackRate = 1 / 3;
      var pa = a.play(); if (pa && pa.catch) pa.catch(function () {});
      var pb = b.play(); if (pb && pb.catch) pb.catch(function () {});
    }
    playBoth.addEventListener('click', runBoth);

    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (screen.classList.contains('active')) {
          if (!reduceMotion) runBoth();
        } else {
          a.pause(); b.pause();
        }
      }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    var FEEDBACK = {
      'a': { tone: 'good', text: 'Yes. Tap A delivered the same 6 litres in far less time, so it was filling faster. The amount was identical, so the only thing that could separate them was how long each one took.' },
      'b': { tone: 'think', text: 'Have another look at the two timings. Tap B was still running long after Tap A had finished, so Tap B took longer to deliver the very same 6 litres.' },
      'same': { tone: 'think', text: 'They ended at the same level, which is why this feels right. But watch the clock rather than the level. Tap A finished in 6 seconds and Tap B needed 18, so they were not filling at the same speed.' }
    };

    document.querySelectorAll('.env5-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var choice = btn.dataset.choice;
        var isCorrect = choice === 'a';
        document.querySelectorAll('.env5-opt').forEach(function (x) {
          x.classList.remove('is-selected', 'is-correct', 'is-incorrect');
        });
        btn.classList.add('is-selected', isCorrect ? 'is-correct' : 'is-incorrect');
        var f = FEEDBACK[choice];
        feedback.textContent = f.text;
        feedback.classList.remove('good', 'think');
        feedback.classList.add('show', f.tone);
        if (isCorrect) {
          reveal.classList.add('show');
          State.progress.env5Answered = true;
        }
      });
    });
  })();

  /* ============================================================
     SCENE 7: TWO PHONES, TWO RATES

     Two separate supplied clips, both running at normal speed over
     the same five minutes. Phone A falls 100 to 0, so 20 points a
     minute. Phone B falls 100 to 50, so 10 points a minute. Same
     time, different amounts, which is what makes the rate the thing
     that separates them.

     The clips carry no clock, so the elapsed minutes readout is
     driven here from the running videos.

     The three questions live in a tabbed workspace beside the
     animation rather than stacked below it, so the learner can see
     the phones and the current question together without scrolling.
     Steps 2 and 3 stay locked until the step before is answered.
     ============================================================ */
  (function scene7() {
    var screen = document.getElementById('screen-env6');
    var a = document.getElementById('s7VideoA');
    var b = document.getElementById('s7VideoB');
    var playBtn = document.getElementById('s7PlayBoth');
    var clock = document.getElementById('s7Clock');
    var endA = document.getElementById('s7EndA');
    var endB = document.getElementById('s7EndB');
    if (!screen || !a || !b) return;

    var OBSERVED_MINUTES = 5;   // both clips cover the same five minutes
    var CLIP_SECONDS = 6;

    a.src = SHARED_MEDIA.phoneClipA; a.poster = SHARED_MEDIA.phonePosterA;
    b.src = SHARED_MEDIA.phoneClipB; b.poster = SHARED_MEDIA.phonePosterB;
    [a, b].forEach(function (v) { v.muted = true; v.loop = false; v.playbackRate = 1; });

    var rafId = null, startedAt = 0;

    function tick() {
      var elapsed = (Date.now() - startedAt) / 1000;
      var minutes = Math.min(OBSERVED_MINUTES, (elapsed / CLIP_SECONDS) * OBSERVED_MINUTES);
      clock.textContent = String(Math.round(minutes));
      if (minutes >= OBSERVED_MINUTES) {
        endA.classList.add('show');
        endB.classList.add('show');
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    function runBoth() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      endA.classList.remove('show'); endB.classList.remove('show');
      clock.textContent = '0';
      [a, b].forEach(function (v) {
        try { v.pause(); v.currentTime = 0; } catch (e) { /* ignore */ }
      });
      var pa = a.play(); if (pa && pa.catch) pa.catch(function () {});
      var pb = b.play(); if (pb && pb.catch) pb.catch(function () {});
      startedAt = Date.now();
      rafId = requestAnimationFrame(tick);
    }

    function stopBoth() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      a.pause(); b.pause();
    }

    playBtn.addEventListener('click', runBoth);

    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (screen.classList.contains('active')) {
          if (!reduceMotion) runBoth();
        } else {
          stopBoth();
        }
      }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- tabbed steps ---------- */
    var tabs = [document.getElementById('s7Tab1'), document.getElementById('s7Tab2'), document.getElementById('s7Tab3')];
    var panels = [document.getElementById('s7Panel1'), document.getElementById('s7Panel2'), document.getElementById('s7Panel3')];

    function showStep(n) {
      tabs.forEach(function (t, idx) {
        t.setAttribute('aria-selected', String(idx === n - 1));
      });
      panels.forEach(function (pnl, idx) {
        pnl.classList.toggle('active', idx === n - 1);
      });
    }

    function unlockStep(n) {
      if (tabs[n - 1]) tabs[n - 1].disabled = false;
    }

    function markDone(n) {
      if (tabs[n - 1]) tabs[n - 1].classList.add('is-done');
      var done = tabs.filter(function (t) { return t.classList.contains('is-done'); }).length;
      var counter = document.getElementById('s7Progress');
      if (counter) counter.textContent = done + ' of 3 complete';
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        if (t.disabled) return;
        showStep(parseInt(t.dataset.step, 10));
      });
    });

    /* ---------- question wiring ---------- */
    var Q1 = {
      'a20b10': { tone: 'good', text: 'That is it. Phone A fell all the way from 100 to 0 in those 5 minutes, which is 20 points a minute. Phone B only reached 50, so it lost 10 a minute. Phone A is draining twice as fast.' },
      'a10b20': { tone: 'think', text: 'The right pair of numbers, but the wrong way round. Phone A is the one that reached empty, so it must be losing points more quickly, not more slowly.' },
      'both20': { tone: 'think', text: 'They cannot both be 20. Watch where each one finishes: Phone A ends at 0 but Phone B is still sitting at 50, so over the same 5 minutes they did not lose the same amount.' }
    };
    var Q2 = {
      'a': { tone: 'good', text: 'Yes. Phone A loses points twice as fast, so over any shared stretch of time it will always have lost more.' },
      'b': { tone: 'think', text: 'Check which phone dropped further in the same 5 minutes. Phone A fell all the way to empty while Phone B was only halfway, so Phone A is the faster of the two.' },
      'equal': { tone: 'think', text: 'They would only lose the same if they were draining at the same rate, and these two are not. In 5 minutes one lost 100 points and the other lost 50.' }
    };
    var Q3 = {
      '60and30': { tone: 'good', text: 'Exactly. Phone A loses 20 each minute, so 3 minutes gives 60. Phone B loses 10 each minute, so 3 minutes gives 30.' },
      '20and10': { tone: 'think', text: 'Those are the rates for a single minute. The question asks about 3 minutes, so each figure needs to happen three times over.' },
      '60and60': { tone: 'think', text: 'Phone A is right at 60. Phone B is losing only half as fast though, so it cannot lose the same amount over the same 3 minutes.' }
    };

    function wire(optClass, fbId, answers, correct, nextBtnId, onCorrect) {
      var fb = document.getElementById(fbId);
      var nextBtn = nextBtnId ? document.getElementById(nextBtnId) : null;
      document.querySelectorAll('.' + optClass).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var choice = btn.dataset.choice;
          var isCorrect = choice === correct;
          document.querySelectorAll('.' + optClass).forEach(function (x) {
            x.classList.remove('is-selected', 'is-correct', 'is-incorrect');
          });
          btn.classList.add('is-selected', isCorrect ? 'is-correct' : 'is-incorrect');
          var f = answers[choice];
          fb.textContent = f.text;
          fb.classList.remove('good', 'think');
          fb.classList.add('show', f.tone);
          if (isCorrect) {
            var panel = btn.closest('.s7-panel');
            if (panel) panel.classList.add('is-complete');
            if (nextBtn) nextBtn.classList.add('show');
            if (onCorrect) onCorrect();
          }
        });
      });
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          showStep(parseInt(nextBtn.dataset.goto, 10));
        });
      }
    }

    var next1 = document.getElementById('s7Next1'); next1.dataset.goto = '2';
    var next2 = document.getElementById('s7Next2'); next2.dataset.goto = '3';

    wire('s7q1-opt', 's7Q1Feedback', Q1, 'a20b10', 's7Next1', function () {
      unlockStep(2); markDone(1);
      State.progress.env6Answered = true;
    });
    wire('s7q2-opt', 's7Q2Feedback', Q2, 'a', 's7Next2', function () {
      unlockStep(3); markDone(2);
    });
    wire('s7q3-opt', 's7Q3Feedback', Q3, '60and30', null, function () {
      markDone(3);
      document.getElementById('s7Results').hidden = false;
      document.getElementById('s7Close').classList.add('show');
    });
  })();

  /* ---------- generic reveal-toggle pattern (screens 2, 4, 5, 7, 9) ---------- */
  document.querySelectorAll('[data-reveal-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.dataset.revealTarget);
      if (!target) return;
      var isHidden = target.hasAttribute('hidden');
      if (isHidden) {
        target.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        if (btn.dataset.labelClose) btn.textContent = btn.dataset.labelClose;
      } else {
        target.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
        if (btn.dataset.labelOpen) btn.textContent = btn.dataset.labelOpen;
      }
    });
  });

  /* ---------- screen 3: flip flashcards (video front, question back) ---------- */
  (function () {
    var attempted = new Set();

    function toggleCard(card) {
      var willFlip = !card.classList.contains('flipped');
      card.classList.toggle('flipped', willFlip);
      card.setAttribute('aria-expanded', String(willFlip));
      var video = card.querySelector('.flash-video');
      var playBtn = card.querySelector('.flash-video-playbtn');
      if (video) {
        if (willFlip) {
          video.pause();
        } else if (!reduceMotion) {
          var p = video.play();
          if (p && p.catch) p.catch(function () { if (playBtn) playBtn.style.display = 'flex'; });
        }
      }
      card.querySelectorAll('.choice-btn').forEach(function (b) { b.tabIndex = willFlip ? 0 : -1; });
    }

    document.querySelectorAll('#screen-3 .flashcard').forEach(function (card) {
      var answer = card.dataset.answer;
      var feedbackEl = card.querySelector('.flash-feedback');
      var video = card.querySelector('.flash-video');
      var playBtn = card.querySelector('.flash-video-playbtn');

      if (video) {
        video.loop = !reduceMotion;
      }

      if (playBtn) {
        playBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          video.play();
          playBtn.style.display = 'none';
        });
      }

      card.addEventListener('click', function (e) {
        if (e.target.closest('.choice-btn') || e.target.closest('.flash-video-playbtn')) return;
        toggleCard(card);
      });

      card.addEventListener('keydown', function (e) {
        if (e.target.closest('.choice-btn') || e.target.closest('.flash-video-playbtn')) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleCard(card);
        }
      });

      card.querySelectorAll('.choice-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var choice = btn.dataset.choice;
          var isCorrect = choice === answer;
          card.querySelectorAll('.choice-btn').forEach(function (b) {
            b.classList.remove('is-correct', 'is-incorrect', 'is-selected');
          });
          btn.classList.add('is-selected', isCorrect ? 'is-correct' : 'is-incorrect');
          feedbackEl.hidden = false;
          feedbackEl.textContent = isCorrect ? card.dataset.feedbackCorrect : card.dataset.feedbackIncorrect;
          feedbackEl.classList.toggle('good', isCorrect);
          feedbackEl.classList.toggle('bad', !isCorrect);
          attempted.add(card.dataset.id);
          if (attempted.size >= 4) {
            document.getElementById('s3-summary').classList.add('show');
          }
        });
      });
    });
  })();

  /* ---------- screen 3: single-scenario-at-a-time carousel (layout only, reuses the logic above) ---------- */
  (function () {
    var TOTAL_SCENARIOS = 4;
    var current = 1;
    var cards = document.querySelectorAll('#screen-3 .flashcard');
    var label = document.getElementById('scenarioLabel');
    var dotsWrap = document.getElementById('scenarioDots');
    var backBtn = document.getElementById('scenarioBackBtn');
    var nextBtn = document.getElementById('scenarioNextBtn');

    for (var i = 1; i <= TOTAL_SCENARIOS; i++) {
      var d = document.createElement('span');
      d.className = 'scenario-dot';
      dotsWrap.appendChild(d);
    }
    var dots = dotsWrap.querySelectorAll('.scenario-dot');

    function showScenario(n) {
      current = n;
      cards.forEach(function (card) {
        var isActive = parseInt(card.dataset.scenario, 10) === n;
        card.classList.toggle('scenario-active', isActive);
        var video = card.querySelector('.flash-video');
        var playBtn = card.querySelector('.flash-video-playbtn');
        if (!video) return;
        if (isActive) {
          if (!reduceMotion && !card.classList.contains('flipped')) {
            var p = video.play();
            if (p && p.catch) p.catch(function () { if (playBtn) playBtn.style.display = 'flex'; });
          }
        } else {
          video.pause();
        }
      });
      dots.forEach(function (dot, idx) {
        dot.classList.toggle('is-current', idx + 1 === n);
      });
      label.textContent = 'Scenario ' + n + ' of ' + TOTAL_SCENARIOS;
      backBtn.disabled = (n === 1);
      nextBtn.disabled = (n === TOTAL_SCENARIOS);
    }

    backBtn.addEventListener('click', function () { if (current > 1) showScenario(current - 1); });
    nextBtn.addEventListener('click', function () { if (current < TOTAL_SCENARIOS) showScenario(current + 1); });

    showScenario(1);
  })();

  /* ---------- screen 6: generator slider / chart ---------- */
  (function () {
    var slider = document.getElementById('timeSlider');
    var timeVal = document.getElementById('timeReadoutVal');
    var usedReadout = document.getElementById('usedReadout');
    var avgReadout = document.getElementById('avgReadout');
    var instReadout = document.getElementById('instReadout');
    var progressPath = document.getElementById('genProgressPath');
    var marker = document.getElementById('genMarker');
    var chipBulbs = document.getElementById('chipBulbs');
    var chipAC = document.getElementById('chipAC');
    var chipFan = document.getElementById('chipFan');
    var takeaway = document.getElementById('s6-takeaway');
    var interacted = false;

    function xScale(t) { return 40 + (t / 5) * 420; }
    function yScale(u) { return 220 - (u / 7.5) * 200; }

    function usedAt(t) {
      if (t <= 1) return 0.5 * t;
      if (t <= 3) return 0.5 + 2.5 * (t - 1);
      return 5.5 + 1.0 * (t - 3);
    }
    function rateAt(t) {
      if (t < 1) return 0.5;
      if (t < 3) return 2.5;
      return 1.0;
    }
    function applianceAt(t) {
      if (t < 1) return 'bulbs';
      if (t < 3) return 'ac';
      return 'fan';
    }

    function render(t) {
      var used = usedAt(t);
      var avg = t > 0 ? used / t : 0;
      var inst = rateAt(t);

      timeVal.textContent = t.toFixed(1);
      usedReadout.textContent = used.toFixed(2) + ' L';
      avgReadout.textContent = t > 0 ? avg.toFixed(2) + ' L/hr' : 'Not yet';
      instReadout.textContent = inst.toFixed(2) + ' L/hr';

      var pts = [[0, 0]];
      if (t > 0) {
        if (t <= 1) {
          pts.push([t, used]);
        } else {
          pts.push([1, 0.5]);
          if (t <= 3) {
            pts.push([t, used]);
          } else {
            pts.push([3, 5.5]);
            pts.push([t, used]);
          }
        }
      }
      var d = 'M' + pts.map(function (p) {
        return xScale(p[0]).toFixed(1) + ',' + yScale(p[1]).toFixed(1);
      }).join(' L');
      progressPath.setAttribute('d', d);
      marker.setAttribute('cx', xScale(t).toFixed(1));
      marker.setAttribute('cy', yScale(used).toFixed(1));

      var seg = applianceAt(t);
      chipBulbs.classList.toggle('active', seg === 'bulbs');
      chipAC.classList.toggle('active', seg === 'ac');
      chipFan.classList.toggle('active', seg === 'fan');

      if (!interacted && t > 0.05) {
        interacted = true;
      }
      // Once the learner has explored past both changes of appliance, the
      // discovery question appears. The takeaway waits until they answer.
      if (t >= 3.4) {
        var q = document.getElementById('s6-question');
        if (q) q.hidden = false;
      }
    }

    slider.addEventListener('input', function () {
      var t = parseInt(slider.value, 10) / 10;
      render(t);
    });
    render(0);
  })();

  /* ---------- environment 7: discovery question ---------- */
  (function generatorQuestion() {
    var feedback = document.getElementById('s6Feedback');
    var takeaway = document.getElementById('s6-takeaway');
    if (!feedback) return;

    var ANSWERS = {
      'changed': { tone: 'good', text: 'Exactly. While two bulbs were on it burned about 0.5 litres an hour. With the air conditioner running that jumped to 2.5. With just a fan it settled near 1.0. One generator, but the rate kept changing.' },
      'steady': { tone: 'think', text: 'Look at the reading for the rate right now as you drag the slider. It does not hold still. It was 0.5 litres an hour early on and 2.5 while the air conditioner was running. The average is the number that barely moves, not the rate itself.' },
      'end': { tone: 'think', text: 'The rate changed more than once. Slide back to the first hour and watch the reading as you pass 1 hour and again as you pass 3 hours. It shifts each time something different is switched on.' }
    };

    document.querySelectorAll('.s6-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var choice = btn.dataset.choice;
        var isCorrect = choice === 'changed';
        document.querySelectorAll('.s6-opt').forEach(function (x) {
          x.classList.remove('is-selected', 'is-correct', 'is-incorrect');
        });
        btn.classList.add('is-selected', isCorrect ? 'is-correct' : 'is-incorrect');
        var f = ANSWERS[choice];
        feedback.textContent = f.text;
        feedback.classList.remove('good', 'think');
        feedback.classList.add('show', f.tone);
        if (isCorrect && takeaway) {
          takeaway.classList.add('show');
          State.progress.env7Answered = true;
        }
      });
    });
  })();

  /* ---------- screen 7: audio player ---------- */
  (function () {
    var audio = document.getElementById('trafficAudio');
    var playBtn = document.getElementById('audioPlayBtn');
    var playIcon = document.getElementById('audioPlayIcon');
    var trackFill = document.getElementById('audioTrackFill');
    var timeLabel = document.getElementById('audioTime');
    var fallback = document.getElementById('audioFallback');
    var errored = false;

    function fmt(s) {
      if (!isFinite(s) || isNaN(s)) return '0:00';
      var m = Math.floor(s / 60), sec = Math.floor(s % 60);
      return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    playBtn.addEventListener('click', function () {
      if (errored) return;
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) p.catch(function () { showFallback(); });
      } else {
        audio.pause();
      }
    });
    audio.addEventListener('play', function () { playIcon.setAttribute('href', '#ic-pause'); });
    audio.addEventListener('pause', function () { playIcon.setAttribute('href', '#ic-pause'); playIcon.setAttribute('href', '#ic-play'); });
    audio.addEventListener('timeupdate', function () {
      if (audio.duration) trackFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
      timeLabel.textContent = fmt(audio.currentTime);
    });
    audio.addEventListener('ended', function () { playIcon.setAttribute('href', '#ic-play'); });
    audio.addEventListener('error', showFallback);

    function showFallback() {
      if (errored) return;
      errored = true;
      fallback.classList.add('show');
      playBtn.style.opacity = '.4';
      playBtn.style.cursor = 'not-allowed';
      var transcriptBtn = document.getElementById('transcriptToggle');
      var panel = document.getElementById('transcriptPanel');
      if (panel.hasAttribute('hidden')) transcriptBtn.click();
    }
  })();

  /* ============================================================
     ENVIRONMENT 8: REASONING ABOUT THE AVERAGE
     The recall questions were replaced with reasoning ones. Each
     step appears only once the previous is answered correctly, so
     the page stays short and the argument builds in order.
     ============================================================ */
  (function environment8() {
    var Q1 = {
      'total': { tone: 'good', text: 'Yes. That is all an average is: the whole distance shared out evenly across the whole time. It is a summary of the trip, not a report on any part of it.' },
      'most': { tone: 'think', text: 'That feels reasonable, but the average does not promise it. Amina spent twenty minutes at a standstill and other stretches above 100. An average of 60 can come from all sorts of journeys, including that one.' },
      'max': { tone: 'think', text: 'An average sets no ceiling. Amina says they were doing well over 100 once the road cleared, and the average of 60 is still correct, because the slow parts pull it back down.' }
    };
    var Q2 = {
      'zero': { tone: 'good', text: 'Exactly. At that point in the journey the speed was zero, even though the average for the whole trip was 60. The same journey held two very different answers depending on when you asked.' },
      'sixty': { tone: 'think', text: 'The 60 belongs to the whole journey, not to that moment. Amina is clear that the car was not moving at all near the bridge, so at that moment the speed was zero.' },
      'unknown': { tone: 'think', text: 'We do know this one. Amina tells us they were stuck without moving for about twenty minutes, and a car that is not moving has a speed of zero.' }
    };
    var Q3 = {
      'spread': { tone: 'good', text: 'That is the heart of it. Dividing 120 by 2 is perfectly correct, but the answer describes an evened out version of the journey rather than the journey itself.' },
      'wrong': { tone: 'think', text: 'The arithmetic is fine. 120 kilometres divided by 2 hours really is 60. The catch is what that number is describing, which is the trip as a whole rather than any moment in it.' },
      'special': { tone: 'think', text: 'Average speed works on any journey. The issue is not the road, it is that averaging smooths out everything that happened along the way.' }
    };

    function wire(cls, fbId, answers, correct, onCorrect) {
      var fb = document.getElementById(fbId);
      if (!fb) return;
      document.querySelectorAll('.' + cls).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var choice = btn.dataset.choice;
          var isCorrect = choice === correct;
          document.querySelectorAll('.' + cls).forEach(function (x) {
            x.classList.remove('is-selected', 'is-correct', 'is-incorrect');
          });
          btn.classList.add('is-selected', isCorrect ? 'is-correct' : 'is-incorrect');
          var f = answers[choice];
          fb.textContent = f.text;
          fb.classList.remove('good', 'think');
          fb.classList.add('show', f.tone);
          if (isCorrect && onCorrect) onCorrect();
        });
      });
    }

    var tabs = [document.getElementById('e8Tab1'), document.getElementById('e8Tab2'), document.getElementById('e8Tab3')];
    var panels = [document.getElementById('e8Panel1'), document.getElementById('e8Panel2'), document.getElementById('e8Panel3')];

    function showStep(n) {
      tabs.forEach(function (t, i) { t.setAttribute('aria-selected', String(i === n - 1)); });
      panels.forEach(function (p, i) { p.classList.toggle('active', i === n - 1); });
    }
    function markDone(n) {
      if (tabs[n - 1]) tabs[n - 1].classList.add('is-done');
      var done = tabs.filter(function (t) { return t.classList.contains('is-done'); }).length;
      var counter = document.getElementById('e8Progress');
      if (counter) counter.textContent = done + ' of 3 complete';
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        if (!t.disabled) showStep(parseInt(t.dataset.step, 10));
      });
    });
    [['e8Next1', 2], ['e8Next2', 3]].forEach(function (pair) {
      var btn = document.getElementById(pair[0]);
      if (btn) btn.addEventListener('click', function () { showStep(pair[1]); });
    });

    wire('e8q1-opt', 'e8Q1Feedback', Q1, 'total', function () {
      tabs[1].disabled = false; markDone(1);
      document.getElementById('e8Next1').classList.add('show');
    });
    wire('e8q2-opt', 'e8Q2Feedback', Q2, 'zero', function () {
      tabs[2].disabled = false; markDone(2);
      document.getElementById('e8Next2').classList.add('show');
    });
    wire('e8q3-opt', 'e8Q3Feedback', Q3, 'spread', function () {
      markDone(3);
      State.progress.env8Answered = true;
    });
  })();

  /* ---------- screen 8: sort into groups ---------- */
  (function () {
    var pool = document.getElementById('chipPool');
    var trayA = document.getElementById('trayA');
    var trayB = document.getElementById('trayB');
    var revealBtn = document.getElementById('s8-reveal-btn');
    var answerBox = document.getElementById('s8-answer');

    function checkReady() {
      var remaining = pool.querySelectorAll('.chip').length;
      revealBtn.classList.toggle('ready', remaining === 0);
    }

    function wireChip(chip) {
      var buttons = chip.querySelectorAll('.chip-btn');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dest = btn.dataset.move === 'A' ? trayA : trayB;
          var actions = chip.querySelector('.chip-actions');
          actions.innerHTML = '';
          var removeBtn = document.createElement('button');
          removeBtn.className = 'chip-btn remove';
          removeBtn.textContent = 'Move back';
          removeBtn.addEventListener('click', function () {
            var freshActions = document.createElement('div');
            freshActions.className = 'chip-actions';
            freshActions.innerHTML = '<button class="chip-btn" data-move="A">Group A</button><button class="chip-btn" data-move="B">Group B</button>';
            chip.replaceChild(freshActions, chip.querySelector('.chip-actions'));
            wireChip(chip);
            pool.appendChild(chip);
            checkReady();
          });
          actions.appendChild(removeBtn);
          dest.appendChild(chip);
          checkReady();
        });
      });
    }

    document.querySelectorAll('#chipPool .chip').forEach(wireChip);

    revealBtn.addEventListener('click', function () {
      if (!revealBtn.classList.contains('ready')) return;
      answerBox.classList.add('show');
    });
  })();

})();
