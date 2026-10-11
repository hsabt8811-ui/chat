/* AgriSocial — app.js */
// ============================================================
    //  FIREBASE COMPAT WRAPPERS
    //  نفس أسماء الدوال التي يستخدمها باقي الكود، لكن بدون ES Modules
    //  حتى لا تصبح الصفحة خضراء/فارغة عند فتح HTML من داخل التطبيق.
    // ============================================================
    const initializeApp = (cfg) => firebase.initializeApp(cfg);
    const getDatabase = (app) => firebase.database(app);
    const ref = (database, path) => database.ref(path);
    const get = (reference) => reference.once('value');
    const set = (reference, value) => reference.set(value);
    const update = (reference, value) => reference.update(value);
    const remove = (reference) => reference.remove();
    const push = (reference, value) => value === undefined ? reference.push() : reference.push(value);
    const orderByChild = (child) => (q) => q.orderByChild(child);
    const query = (reference, ...constraints) => constraints.reduce((q, constraint) => constraint(q), reference);
    const onValue = (reference, callback, onError) => { reference.on('value', callback, onError); return () => reference.off('value', callback); };
    const limitToLast = n => q => q.limitToLast(n);
    const equalTo = v => q => q.equalTo(v);


    // ============================================================
    //  CONFIG
    // ============================================================
    const fbCfg = {
      apiKey: "AIzaSyA_Pf9KV3q44uaagSh-bu2QpOfGR6kQ7xE",
      authDomain: "chat-dd44b.firebaseapp.com",
      projectId: "chat-dd44b",
      storageBucket: "chat-dd44b.firebasestorage.app",
      messagingSenderId: "138009125675",
      appId: "1:138009125675:web:c125c31c9331cc74201b6e",
      databaseURL: "https://chat-dd44b-default-rtdb.firebaseio.com"
    };
    const fb = initializeApp(fbCfg);
    const db = getDatabase(fb);

    const CLOUDINARY_CLOUD_NAME = "wg7r5dyk";
    const CLOUDINARY_UPLOAD_PRESET = "student_forum";
    const CLOUDINARY_UPLOAD_URL =
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

    // ============================================================
    //  STATE
    // ============================================================
    let CU = null;
    let postsMap = {};
    let feed = 'latest';
    let srchQ = '';
    let pendPoll = null;
    let offline = !navigator.onLine;
    let notifsC = [];
    let feedUnsubscribe = null;
    const cmtListeners = {};

    // ============================================================
    //  HELPERS
    // ============================================================
    const $ = id => document.getElementById(id);

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]); }

    function ago(ts) {
      if (!ts) return '';
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return 'الآن';
      if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
      if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
      if (s < 604800) return `منذ ${Math.floor(s / 86400)} يوم`;
      return new Date(ts).toLocaleDateString('ar-EG');
    }

    function likesOf(p) { return p.likes ? Object.keys(p.likes).length : 0; }

    // يمنع ظهور أي جزء من ملف CSS/HTML تم حفظه بالخطأ داخل منشور قديم.
    // هذا يعالج تحديدًا الحالة التي يظهر فيها نص مثل: font-family / #splash /
    // @keyframes splashAutoHide داخل المنتدى.
    function isAccidentalCodePost(text) {
      const t = String(text || '').trim();
      if (!t) return false;
      // أي نص ضخم يحتوي على بصمات CSS/HTML الخاصة بالمشروع يعتبر بيانات تالفة،
      // ولا يجب أن يظهر كمنشور مهما كان مكانه في قاعدة البيانات.
      const markers = [
        '/* ===== RESET & ROOT ===== */',
        '/* ===== SPLASH ===== */',
        '@keyframes splashAutoHide',
        '#splash',
        '--bg-card',
        '--gold',
        'font-family',
        'box-sizing: border-box',
        'position: fixed',
        'z-index:',
        'textarea',
        '.post-card',
        '.comments-sheet'
      ];
      let hits = 0;
      for (const m of markers) if (t.includes(m)) hits++;
      const cssRules = (t.match(/[.#][A-Za-z_][\w-]*\s*\{[^{}]*:[^{};]+;/g) || []).length;
      const declarations = (t.match(/[A-Za-z-]+\s*:\s*[^;{}]+;/g) || []).length;
      const hasKeyframes = /@keyframes\s+[\w-]+\s*\{/.test(t);
      const hasComments = /\/\*[\s\S]{0,120}\*\//.test(t);
      return hits >= 2
        || hasKeyframes
        || (t.length > 1200 && (cssRules >= 2 || declarations >= 12))
        || (t.length > 6000 && hasComments && declarations >= 8);
    }

    function toast(msg, type = 'ok') {
      const el = $('toast');
      $('tmsg').textContent = msg;
      el.className = 'on ' + type;
      el.querySelector('.ticon').className = `ticon fa-solid ${type === 'ok' ? 'fa-circle-check' : 'fa-circle-xmark'}`;
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('on'), 3200);
    }

    // ============================================================
    //  AVATAR, BADGES, RENDER
    // ============================================================
    function makeAvEl(data, size = 38, extraClass = '') {
      const url = data?.photoURL?.trim();
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText =
          `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);flex-shrink:0;`;
        img.className = 'post-av ' + extraClass;
        img.onerror = () => img.replaceWith(initialsEl(data, size, extraClass));
        return img;
      }
      return initialsEl(data, size, extraClass);
    }

    function initialsEl(data, size = 38, extraClass = '') {
      const name = (data?.fullName || data?.username || '?').trim();
      const letter = name.charAt(0).toUpperCase();
      const colors = ['#1a4d22', '#2d5a1b', '#1e3a5f', '#5a2d82', '#8b4513', '#1a5276'];
      const bg = colors[name.charCodeAt(0) % colors.length];
      const el = document.createElement('div');
      el.className = 'av-initials ' + extraClass;
      el.style.cssText =
        `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:linear-gradient(135deg,${bg},#2d6e35);border:2px solid var(--gold);flex-shrink:0;`;
      el.textContent = letter;
      return el;
    }

    function avHTML(data, size = 38, cls = 'post-av') {
      const url = data?.photoURL?.trim();
      if (url)
        return `<img src="${esc(url)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);flex-shrink:0;" class="${cls}" loading="lazy" onerror="this.style.display='none'">`;
      const name = (data?.fullName || '?').trim();
      const letter = name.charAt(0).toUpperCase();
      const colors = ['#1a4d22', '#2d5a1b', '#1e3a5f', '#5a2d82', '#8b4513', '#1a5276'];
      const bg = colors[name.charCodeAt(0) % colors.length];
      return `<div class="av-initials ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:linear-gradient(135deg,${bg},#2d6e35);border:2px solid var(--gold);">${esc(letter)}</div>`;
    }

    function vbadge(type) {
      return ['blue', 'gold', 'green'].includes(type) ? `<span class="vbadge vbadge-${type}" title="حساب موثق"></span>` : '';
    }

    function renderText(raw) {
      return esc(raw)
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        .replace(/@([a-zA-Z0-9_.]+)/g, (m, u) => `<span class="cmt-mention" data-un="${u}">@${u}</span>`);
    }

    // ============================================================
    //  BOOT : إظهار تسجيل الدخول أولاً بشكل مضمون
    // ============================================================
    function hideSplash() {
      const splash = $('splash');
      if (splash) splash.classList.add('gone');
    }

    function showAuth() {
      // شاشة تسجيل الدخول فقط — المنتدى يختفي تمامًا.
      const auth = $('auth');
      const app = $('app');
      if (app) app.classList.remove('on');
      if (auth) auth.classList.add('on');

      // نرجع دائمًا لتبويب تسجيل الدخول عند فتح الشاشة.
      document.querySelectorAll('.atab').forEach(x => x.classList.remove('on'));
      document.querySelectorAll('.apanel').forEach(x => x.classList.remove('on'));

      const loginTab = document.querySelector('.atab[data-tab="login"]');
      const loginPanel = $('loginPanel');
      if (loginTab) loginTab.classList.add('on');
      if (loginPanel) loginPanel.classList.add('on');
    }

    window.addEventListener('load', async () => {
      // لا ننتظر Firebase قبل إظهار شاشة الدخول.
      showAuth();
      loadTheme();

      // نخفي شاشة البداية بسرعة، مع وجود CSS fallback لو فشل JavaScript.
      setTimeout(hideSplash, 250);

      // نحاول استعادة الجلسة القديمة بدون أن نعطل شاشة الدخول.
      try {
        const ok = await Promise.race([
          restoreSession(),
          new Promise(resolve => setTimeout(() => resolve(false), 5000))
        ]);
        if (ok && CU) bootApp();
        else showAuth();
      } catch (e) {
        console.error('Session restore error:', e);
        localStorage.removeItem('agri_s3');
        CU = null;
        showAuth();
      }
    });

    async function restoreSession() {
      const raw = localStorage.getItem('agri_s3');
      if (!raw) return false;

      try {
        const saved = JSON.parse(raw);
        const uid = saved && saved.uid;
        if (!uid || typeof uid !== 'string') {
          localStorage.removeItem('agri_s3');
          return false;
        }

        const snap = await get(ref(db, `users_v2/${uid}`));
        if (!snap.exists()) {
          localStorage.removeItem('agri_s3');
          return false;
        }

        const d = snap.val() || {};
        if (d.status === 'banned') {
          localStorage.removeItem('agri_s3');
          return false;
        }

        CU = { uid, ...d };
        return true;
      } catch (e) {
        console.error('restoreSession:', e);
        localStorage.removeItem('agri_s3');
        CU = null;
        return false;
      }
    }

    function bootApp() {
      // شاشة المنتدى فقط — تسجيل الدخول تختفي تمامًا.
      const auth = $('auth');
      const app = $('app');
      if (auth) auth.classList.remove('on');
      if (app) app.classList.add('on');

      renderCreateAv();
      staffAudience = ['gold','blue'].includes(CU.verifiedType) ? 'all' : (CU.grade || '1');
      renderAudiencePicker();
            subscribeNotifs();
      postsMap = {}; feedReady = false; feedLimit = 40; subscribeFeed(); subscribeFollowing(); switchSc('home');
      updateGradeTitle();
    }

    function renderCreateAv() {
      const w = $('createAvWrap');
      w.innerHTML = '';
      const el = makeAvEl(CU, 38, 'cu-avatar');
      el.style.cursor = 'pointer';
      el.onclick = () => switchSc('profile');
      w.appendChild(el);
    }

    function updateGradeTitle() {
      const title = $('gradeTitle');
      const gradeMap = { '1': 'الأولى', '2': 'الثانية', '3': 'الثالثة', '4': 'الرابعة' };
      const isStaff = ['gold','blue'].includes(CU.verifiedType);
      if (isStaff) title.textContent = staffAudience === 'all' ? '🌱 المنتدى العام — جميع الفرق' : `🌱 منتدى ${gradeMap[staffAudience] || staffAudience}`;
      else if (CU.grade) title.textContent = `🌾 منتدى طلاب الفرقة ${gradeMap[CU.grade] || CU.grade}`;
      else title.textContent = 'منتدى AgriSocial';
    }

    // ============================================================
    //  THEME
    // ============================================================
    function loadTheme() { applyTheme(localStorage.getItem('agri_th') || 'light'); }

    function applyTheme(t) {
      document.body.dataset.theme = t;
      const i = document.querySelector('#themeBtn i');
      if (i) i.className = `fa-solid fa-${t === 'dark' ? 'sun' : 'moon'}`;
      localStorage.setItem('agri_th', t);
    }
    $('themeBtn').addEventListener('click', () => {
      document.body.classList.add('theme-anim');
      setTimeout(() => document.body.classList.remove('theme-anim'), 350);
      applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    // ============================================================
    //  PASS EYE
    // ============================================================
    document.querySelectorAll('.pass-eye').forEach(el => {
      el.addEventListener('click', () => {
        const inp = $(el.dataset.target);
        if (!inp) return;
        const isPass = inp.type === 'password';
        inp.type = isPass ? 'text' : 'password';
        el.querySelector('i').className = `fa-solid fa-eye${isPass ? '-slash' : ''}`;
      });
    });

    // ============================================================
    //  AUTH TABS
    // ============================================================
    document.querySelectorAll('.atab').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.atab').forEach(x => x.classList.remove('on'));
        document.querySelectorAll('.apanel').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        $(`${b.dataset.tab}Panel`).classList.add('on');
      });
    });

    // ============================================================
    //  REGISTRATION ROLE / GRADE
    // ============================================================
    function roleNeedsGrade(role) { return role === 'student'; }
    function syncRegisterRole() {
      const role = $('r_role')?.value || '';
      const wrap = $('gradeFieldWrap');
      const note = $('roleNote');
      const grade = $('r_grade');
      const bio = $('r_bio');
      const student = roleNeedsGrade(role);
      if (wrap) wrap.style.display = student ? '' : 'none';
      if (grade && !student) grade.value = '';

      if (student) {
        const g = grade?.value || '';
        const names = {'1':'الأولى','2':'الثانية','3':'الثالثة','4':'الرابعة'};
        if (g) {
          bio.value = `طالب بالفرقة ${names[g]}`;
          bio.readOnly = true;
          if (note) note.textContent = `نبذة الحساب: طالب بالفرقة ${names[g]}`;
        } else {
          bio.value = '';
          bio.readOnly = true;
          if (note) note.textContent = 'اختر الفرقة لكتابة نبذة الحساب تلقائيًا';
        }
      } else if (role === 'assistant' || role === 'doctor') {
        bio.readOnly = false;
        if (!bio.value || /^طالب بالفرقة/.test(bio.value)) bio.value = '';
        bio.placeholder = role === 'assistant' ? 'معيد — اكتب اسم مقررك' : 'دكتور — اكتب اسم مقررك';
        if (note) note.textContent = role === 'assistant' ? 'النبذة: معيد — اكتب اسم مقررك' : 'النبذة: دكتور — اكتب اسم مقررك';
      } else {
        bio.value = '';
        bio.readOnly = false;
        bio.placeholder = 'نبذة عنك';
        if (note) note.textContent = 'اختار الدور أولاً';
      }
    }
    $('r_role').addEventListener('change', syncRegisterRole);
    $('r_grade').addEventListener('change', syncRegisterRole);
    syncRegisterRole();


    // ============================================================
    //  LOGIN
    // ============================================================
    $('loginBtn').addEventListener('click', async () => {
      const id = $('l_id').value.trim(),
        pw = $('l_pw').value;
      if (!id || !pw) { toast('أدخل بيانات الدخول', 'er'); return; }
      $('loginBtn').disabled = true;
      $('loginBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ...';
      try {
        let snap = await get(query(ref(db, 'users_v2'), orderByChild('username'), equalTo(id)));
        if (!snap.exists()) snap = await get(query(ref(db, 'users_v2'), orderByChild('email'), equalTo(id)));
        let found = null,
          uid = null;
        snap.forEach(ch => {
          const u = ch.val();
          if ((u.username === id || u.email === id) && u.password === pw && u.status !== 'banned') {
            found = u;
            uid = ch.key;
          }
        });
        if (!found) { toast('بيانات الدخول غير صحيحة', 'er'); return; }
        localStorage.setItem('agri_s3', JSON.stringify({ uid }));
        CU = { uid, ...found };
        bootApp();
      } catch (e) { console.error(e);
        toast('خطأ في الاتصال. تأكد من اتصال الإنترنت وقواعد Firebase.', 'er');
      } finally {
        $('loginBtn').disabled = false;
        $('loginBtn').innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول';
      }
    });

    // تسجيل الدخول عند الضغط على Enter من حقلي المستخدم وكلمة المرور.
    ['l_id', 'l_pw'].forEach(id => {
      $(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          $('loginBtn').click();
        }
      });
    });

    // ============================================================
    //  REGISTER
    // ============================================================
    $('regBtn').addEventListener('click', async () => {
      const name = $('r_name').value.trim(),
        uname = $('r_user').value.trim(),
        email = $('r_email').value.trim(),
        pw = $('r_pw').value,
        bio = $('r_bio').value.trim(),
        role = $('r_role').value,
        grade = roleNeedsGrade(role) ? $('r_grade').value : '';
      if (name.split(/\s+/).filter(Boolean).length !== 4) { toast('اكتب الاسم رباعي: أربعة أجزاء بالضبط', 'er'); return; }
      if (!uname || !email || !pw || !role || (roleNeedsGrade(role) && !grade)) { toast('يرجى ملء الحقول المطلوبة', 'er'); return; }
      if (pw.length < 6) { toast('كلمة المرور 6 أحرف على الأقل', 'er'); return; }
      if (!/^[a-zA-Z0-9_.]+$/.test(uname)) { toast('اسم المستخدم: أحرف إنجليزية/أرقام/_/.', 'er'); return; }
      if (!/^[^\s@]+@gmail\.com$/i.test(email)) { toast('استخدم بريد Gmail صحيح مثل name@gmail.com', 'er'); return; }
      const gradeNames = {'1':'الأولى','2':'الثانية','3':'الثالثة','4':'الرابعة'};
      const finalBio = role === 'student' ? `طالب بالفرقة ${gradeNames[grade]}` : `${role === 'assistant' ? 'معيد' : 'دكتور'} — ${bio || 'اكتب اسم مقررك'}`;
      $('regBtn').disabled = true;
      $('regBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ...';
      try {
        const [su, se] = await Promise.all([
          get(query(ref(db, 'users_v2'), orderByChild('username'), equalTo(uname))),
          get(query(ref(db, 'users_v2'), orderByChild('email'), equalTo(email)))]);
        const uT = su.exists(), eT = se.exists();
        if (uT) { toast('اسم المستخدم محجوز', 'er'); return; }
        if (eT) { toast('البريد الإلكتروني مستخدم بالفعل', 'er'); return; }
        const photoURL = '';
        const newRef = await push(ref(db, 'users_v2'), {
          fullName: name,
          username: uname,
          email,
          password: pw,
          bio: finalBio,
          photoURL,
          role,
          grade,
          status: 'approved',
          verifiedType: null,
          createdAt: Date.now(),
          followers: 0
        });
        localStorage.setItem('agri_s3', JSON.stringify({ uid: newRef.key }));
        CU = {
          uid: newRef.key,
          fullName: name,
          username: uname,
          email,
          password: pw,
          bio: finalBio,
          photoURL,
          role,
          grade,
          status: 'approved',
          verifiedType: null,
          createdAt: Date.now(),
          followers: 0
        };
        toast('مرحباً ' + name + '! 🌱');
        bootApp();
      } catch (e) { console.error(e);
        toast('حدث خطأ', 'er'); } finally {
        $('regBtn').disabled = false;
        $('regBtn').innerHTML = '<i class="fa-solid fa-user-plus"></i> إنشاء الحساب';
      }
    });

    // ============================================================
    //  LOGOUT
    // ============================================================
    $('logoutBtn').addEventListener('click', () => {
      if (!confirm('تسجيل الخروج؟')) return;
      if (feedUnsubscribe) { feedUnsubscribe();
        feedUnsubscribe = null; }
      Object.keys(cmtListeners).forEach(pid => {
        if (cmtListeners[pid]) { cmtListeners[pid]();
          delete cmtListeners[pid]; }
      });
      localStorage.removeItem('agri_s3');
      if (followOff) followOff(); if (notifOff) notifOff(); notifSeen = null; myFollowing = new Set();
      postsMap = {}; $('postsWrap').innerHTML = '';
      CU = null;
      showAuth();
    });

    // ============================================================
    //  NAVIGATION
    // ============================================================
    document.querySelectorAll('.nit').forEach(n => n.addEventListener('click', () => switchSc(n.dataset.sc)));

    function switchSc(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
      document.querySelectorAll('.nit').forEach(n => n.classList.toggle('on', n.dataset.sc === id));
      const s = $(id + '-screen');
      if (s) s.classList.add('on');
      if (id === 'profile') renderProfile();
      else if (id === 'saved') loadSaved();
      else if (id === 'notifications') renderNotifs();
    }

    // ============================================================
    //  FEED (REAL-TIME)
    // ============================================================
    let feedLimit = 40, feedRef = null, feedReady = false, renderQueued = false;
    function unsubscribeFeed() { if (feedRef) { feedRef.off(); feedRef = null; } }
    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => { renderQueued = false; if (CU) renderPosts(); });
    }
    function syncOtherCards(pid) {
      const p = postsMap[pid];
      document.querySelectorAll(`#myPostsWrap .post-card[data-pid="${pid}"], #pubPostsWrap .post-card[data-pid="${pid}"], #savedWrap .post-card[data-pid="${pid}"]`)
        .forEach(c => { if (!p) c.remove(); else c.outerHTML = buildPost(p); });
    }
    function subscribeFeed() {
      unsubscribeFeed();
      feedRef = query(ref(db, 'posts'), orderByChild('timestamp'), limitToLast(feedLimit));
      const upsert = s => { postsMap[s.key] = { id: s.key, ...s.val() }; scheduleRender(); };
      feedRef.on('child_added', upsert, err => {
        console.error('Feed error:', err);
        $('postsWrap').innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>خطأ في التحميل</p></div>`;
      });
      feedRef.on('child_changed', s => { upsert(s); syncOtherCards(s.key); });
      feedRef.on('child_removed', s => { delete postsMap[s.key]; syncOtherCards(s.key); scheduleRender(); });
      feedRef.once('value', () => { feedReady = true; scheduleRender(); });
      feedUnsubscribe = unsubscribeFeed;
    }

    let staffAudience = 'all';

    function getPostsArr() {
      const arr = Object.values(postsMap);
      const isStaff = ['gold','blue'].includes(CU.verifiedType);
      if (isStaff) {
        if (staffAudience === 'all') return arr;
        return arr.filter(p => String(p.grade || p.audience || '') === String(staffAudience));
      }
      if (CU.verifiedType === 'green') return arr.filter(p => String(p.grade || '') === String(CU.grade || ''));
      return arr.filter(p => p.audience === 'all' || String(p.grade || '') === String(CU.grade || ''));
    }

    function renderAudiencePicker() {
      const w = $('audiencePicker');
      if (!w) return;
      const isGreen = CU.verifiedType === 'green';
      const isBlueOrGold = ['blue','gold'].includes(CU.verifiedType);
      // التوثيق الأخضر مقيد بفرقة الحساب ولا تظهر له أقسام الفرق.
      if (isGreen || !isBlueOrGold) { w.style.display = 'none'; w.innerHTML = ''; return; }
      w.style.display = 'grid';
      const items = [['1','الفرقة الأولى'],['2','الفرقة الثانية'],['3','الفرقة الثالثة'],['4','الفرقة الرابعة'],['all','عام']];
      w.innerHTML = items.map(([id,label]) => `<button type="button" class="aud-btn ${staffAudience===id?'on':''}" data-aud="${id}">${label}</button>`).join('');
      w.querySelectorAll('.aud-btn').forEach(b => b.addEventListener('click', () => {
        const next = b.dataset.aud;
        // الضغط مرة ثانية على نفس الفرقة يلغي التحديد ويرجع للوضع العام.
        staffAudience = (next !== 'all' && staffAudience === next) ? 'all' : next;
        renderAudiencePicker();
        renderPosts();
        updateGradeTitle();
      }));
    }

    function postSig(p) {
      return [p.content, p.edited, p.imageUrl, likesOf(p), !!(p.likes && p.likes[CU.uid]), p.commentsCount || 0,
        p.authorName, p.authorPhoto, p.authorVerifiedType, p.authorBio,
        p.poll ? JSON.stringify(p.poll.options.map(o => o.votes || 0)) + (p.poll.voters && p.poll.voters[CU.uid] !== undefined ? 'v' : '') : ''].join('|');
    }
    function renderPosts(sq = srchQ) {
      const wrap = $('postsWrap'), more = $('loadMoreBtn');
      if (!feedReady) { wrap.innerHTML = `<div class="loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`; return; }
      let arr = getPostsArr().filter(p => !isAccidentalCodePost(p.content));
      if (sq) arr = arr.filter(p => p.content && p.content.toLowerCase().includes(sq.toLowerCase()));
      if (feed === 'latest') arr.sort((a, b) => b.timestamp - a.timestamp);
      else if (feed === 'trending') arr.sort((a, b) => likesOf(b) - likesOf(a));
      else if (feed === 'mine') arr = arr.filter(p => p.authorId === CU.uid).sort((a, b) => b.timestamp - a.timestamp);
      if (more) more.style.display = Object.keys(postsMap).length >= feedLimit ? 'block' : 'none';
      if (!arr.length) { wrap.innerHTML = `<div class="empty"><i class="fa-regular fa-face-sad-tear"></i><p>لا توجد منشورات</p></div>`; return; }
      if (wrap.firstElementChild && !wrap.firstElementChild.classList.contains('post-card')) wrap.innerHTML = '';
      const existing = new Map();
      wrap.querySelectorAll(':scope > .post-card').forEach(c => existing.set(c.dataset.pid, c));
      const keep = new Set();
      arr.forEach((p, i) => {
        keep.add(p.id);
        const sig = postSig(p);
        let node = existing.get(p.id);
        if (!node || node.dataset.sig !== sig) {
          const t = document.createElement('template');
          t.innerHTML = buildPost(p).trim();
          const fresh = t.content.firstElementChild;
          fresh.dataset.sig = sig;
          if (node) node.replaceWith(fresh);
          node = fresh;
        }
        const cur = wrap.children[i];
        if (cur !== node) wrap.insertBefore(node, cur || null);
      });
      existing.forEach((c, pid) => { if (!keep.has(pid)) c.remove(); });
    }

    // ============================================================
    //  BUILD POST HTML
    // ============================================================
    function buildPost(p) {
      const liked = p.likes && p.likes[CU.uid] ? 'liked' : '';
      const lc = likesOf(p),
        cc = p.commentsCount || 0;
      const isOwn = p.authorId === CU.uid;
      const isDeveloper = CU.verifiedType === 'gold';
      const canMod = isOwn || isDeveloper;
      const pData = { fullName: p.authorName, photoURL: p.authorPhoto, username: p.authorUsername };
      return `
      <div class="post-card" data-pid="${p.id}">
        <div class="post-body">
          <div class="post-hdr">
            <span class="uid-link" data-uid="${p.authorId}">${avHTML(pData, 38, 'post-av')}</span>
            <div class="post-meta">
              <div class="post-arow">
                <span class="post-name-stack">
                  <span class="post-aname" data-uid="${p.authorId}">${esc(p.authorName)}${vb(p.authorId, p.authorVerifiedType)}${p.authorId !== CU.uid ? `<button type="button" class="follow-chip${myFollowing.has(p.authorId) ? ' on' : ''}" data-uid="${p.authorId}">+ متابعة</button>` : ''}</span>
                  <span class="post-user-bio post-user-link" data-uid="${p.authorId}">${esc(p.authorBio || '')}</span>
                </span>
              </div>
              <div class="post-time"><span class="ago" data-ts="${p.timestamp}">${ago(p.timestamp)}</span>${p.edited ? '<span class="edited-lbl">معدَّل</span>' : ''}</div>
            </div>
            <div class="pmenu-wrap">
              <button class="pmenu-btn" data-dd="${p.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button>
              <div class="pdd" id="dd-${p.id}">
                ${canMod ? `<div class="dd-it" data-act="edit" data-pid="${p.id}"><i class="fa-solid fa-pen"></i>تعديل</div>` : ''}
                ${canMod ? `<div class="dd-it danger" data-act="delete" data-pid="${p.id}"><i class="fa-solid fa-trash"></i>حذف</div>` : ''}
                <div class="dd-it" data-act="save" data-pid="${p.id}"><i class="fa-regular fa-bookmark"></i>حفظ</div>
                <div class="dd-it" data-act="report" data-pid="${p.id}"><i class="fa-solid fa-flag"></i>إبلاغ</div>
                <div class="dd-it" data-act="share" data-pid="${p.id}"><i class="fa-solid fa-share-nodes"></i>مشاركة</div>
              </div>
            </div>
          </div>
          <div class="post-txt">${renderText(p.content || '')}</div>
          ${p.imageUrl ? `<div class="post-img-wrap"><img src="${esc(p.imageUrl)}" class="post-img" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
          ${p.poll ? buildPollInPost(p.poll, p.id) : ''}
        </div>
        <div class="post-footer">
          <div class="react-row">
            <button class="rbtn ${liked}" data-act="like" data-pid="${p.id}"><i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i><span class="rct">${lc || ''}</span></button>
            <button class="rbtn" data-act="comment" data-pid="${p.id}"><i class="fa-regular fa-comment"></i><span class="rct">${cc || ''}</span></button>
          </div>
          <button class="rbtn copy-btn" data-act="copy" data-pid="${p.id}" title="نسخ المنشور"><i class="fa-regular fa-copy"></i><span class="rct">نسخ</span></button>
        </div>
        <div class="cmts-wrap" id="cw-${p.id}" style="display:none!important;"></div>
      </div>`;
    }

    function buildPollInPost(poll, pid) {
      const total = poll.options.reduce((s, o) => s + (o.votes || 0), 0);
      const opts = poll.options.map((o, i) => {
        const pct = total > 0 ? Math.round((o.votes || 0) / total * 100) : 0;
        return `<div class="poll-opt"><div class="pbar" style="width:${pct}%"></div><input type="radio" name="poll_${pid}" value="${i}"><span class="pol">${esc(o.text)}</span><span class="pop">${pct}%</span></div>`;
      }).join('');
      return `<div class="poll-card"><div class="poll-q">${esc(poll.question)}</div>${opts}<div class="ptotal">${total} تصويت</div><button class="btn-pvote" data-pvid="${pid}"><i class="fa-solid fa-check"></i> تصويت</button></div>`;
    }

    // ============================================================
    //  BIND POST EVENTS
    // ============================================================
    function bindPostEv() { /* events are delegated below */ }
    function closeMenus() { document.querySelectorAll('.pdd.on').forEach(x => x.classList.remove('on')); }
    async function votePoll(btn) {
      const pid = btn.dataset.pvid;
      const sel = document.querySelector(`input[name="poll_${pid}"]:checked`);
      if (!sel) { toast('اختر خياراً', 'er'); return; }
      const p = postsMap[pid];
      if (p && p.poll && p.poll.voters && p.poll.voters[CU.uid] !== undefined) { toast('لقد صوّتّ بالفعل', 'er'); return; }
      const idx = parseInt(sel.value);
      btn.disabled = true;
      try {
        await ref(db, `posts/${pid}/poll/options/${idx}/votes`).transaction(v => (v || 0) + 1);
        ref(db, `posts/${pid}/poll/voters/${CU.uid}`).set(idx).catch(() => {});
        btn.innerHTML = '<i class="fa-solid fa-check"></i> تم التصويت';
        toast('تم تسجيل تصويتك');
      } catch (e) { btn.disabled = false; toast('تعذر التصويت', 'er'); }
    }
    document.addEventListener('click', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      const chip = t.closest('.follow-chip');
      if (chip) { e.stopImmediatePropagation(); toggleFollow(chip.dataset.uid); return; }
      const menu = t.closest('.pmenu-btn');
      if (menu) {
        e.stopImmediatePropagation();
        const dd = $('dd-' + menu.dataset.dd), was = dd.classList.contains('on');
        closeMenus(); if (!was) dd.classList.add('on'); return;
      }
      const it = t.closest('.dd-it[data-act]');
      if (it) {
        e.stopImmediatePropagation(); closeMenus();
        const fn = { edit: editPost, delete: deletePost, save: savePost, report: reportPost, share: sharePost }[it.dataset.act];
        if (fn) fn(it.dataset.pid); return;
      }
      const rb = t.closest('.rbtn[data-act]');
      if (rb) {
        const { act, pid } = rb.dataset;
        if (act === 'copy') { handleCopy(pid, rb); return; }
        if (offline) { toast('لا يوجد اتصال', 'er'); return; }
        if (act === 'like') handleLike(pid, rb); else if (act === 'comment') togCmts(pid);
        return;
      }
      const pv = t.closest('.btn-pvote'); if (pv) { votePoll(pv); return; }
      const men = t.closest('.cmt-mention'); if (men) { e.stopPropagation(); openPubByUser(men.dataset.un); return; }
      const img = t.closest('.post-img'); if (img) { window.open(img.src, '_blank'); return; }
      const u = t.closest('[data-uid]');
      if (u && u.dataset.uid) openPub(u.dataset.uid);
    });
    setInterval(() => document.querySelectorAll('.ago').forEach(e => { e.textContent = ago(+e.dataset.ts); }), 60000);

    document.addEventListener('click', () => {
      document.querySelectorAll('.pdd').forEach(x => x.classList.remove('on'));
    });

    // ============================================================
    //  COPY
    // ============================================================
    function handleCopy(pid, btn) {
      const p = postsMap[pid];
      if (!p) return;
      const txt = `${p.authorName || ''}:\n${p.content || ''}`;
      const doCopy = () => {
        btn.classList.add('copied');
        btn.querySelector('i').className = 'fa-solid fa-check';
        btn.querySelector('.rct').textContent = 'تم!';
        toast('تم نسخ المنشور 📋');
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.querySelector('i').className = 'fa-regular fa-copy';
          btn.querySelector('.rct').textContent = 'نسخ';
        }, 2500);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(txt).then(doCopy).catch(() => { fallbackCopy(txt);
          doCopy(); });
      } else { fallbackCopy(txt);
        doCopy(); }
    }

    function fallbackCopy(txt) {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;opacity:0;top:-999px;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    // ============================================================
    //  LIKE
    // ============================================================
    async function handleLike(pid, btn) {
      const lr = ref(db, `posts/${pid}/likes/${CU.uid}`);
      const now = !(postsMap[pid] && postsMap[pid].likes && postsMap[pid].likes[CU.uid]);
      if (now) await set(lr, true);
      else await remove(lr);
      btn.classList.toggle('liked', now);
      btn.querySelector('i').className = `fa-${now ? 'solid' : 'regular'} fa-heart`;
      const owner = postsMap[pid] && postsMap[pid].authorId;
      if (owner && owner !== CU.uid) {
        const nk = `like_${pid}_${CU.uid}`;
        if (now) notify(owner, 'like', 'إعجاب جديد 🤍', `${CU.fullName} أعجب بمنشورك`, { postId: pid }, nk);
        else ref(db, `notifications/${owner}/${nk}`).remove().catch(() => {});
      }
    }

    // ============================================================
    //  POST ACTIONS
    // ============================================================
    async function editPost(pid) {
      const p = postsMap[pid];
      if (!p) return;
      const nc = prompt('تعديل المنشور:', p.content);
      if (nc !== null && nc.trim()) {
        await update(ref(db, `posts/${pid}`), { content: nc.trim(), edited: true, editedAt: Date.now() });
        toast('تم التعديل');
      }
    }

    async function deletePost(pid) {
      if (!confirm('حذف المنشور نهائياً؟')) return;
      try {
        await remove(ref(db, `comments/${pid}`));
        await remove(ref(db, `posts/${pid}`));
        delete postsMap[pid];
        toast('تم الحذف');
      } catch (e) { console.error(e);
        toast('فشل الحذف', 'er'); }
    }

    async function savePost(pid) {
      if (!pid) return;
      const localKey = 'agri_saved_posts';
      try {
        // لا تعرض رسالة "سجل الدخول" للحفظ.
        // نحفظ محليًا دائمًا، ونزامن مع Firebase عندما تكون جلسة المستخدم موجودة.
        let local = [];
        try { local = JSON.parse(localStorage.getItem(localKey) || '[]'); } catch (_) { local = []; }
        if (!local.includes(pid)) local.push(pid);
        localStorage.setItem(localKey, JSON.stringify(local));

        if (CU?.uid) {
          try { await set(ref(db, `saves/${CU.uid}/${pid}`), true); }
          catch (syncErr) { console.warn('Firebase save sync:', syncErr); }
        }

        toast('تم الحفظ ✓');
        switchSc('saved');
      } catch (e) {
        console.error('savePost:', e);
        toast('تعذر حفظ المنشور', 'er');
      }
    }

    async function reportPost(pid) {
      await push(ref(db, 'reports'), { postId: pid, by: CU.uid, timestamp: Date.now() });
      toast('شكراً، تم إرسال البلاغ');
    }

    async function sharePost(pid) {
      const p = postsMap[pid];
      if (!p) return;
      const text = `${p.authorName}:\n${p.content}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'AgriSocial', text });
        } catch (e) { /* user cancelled */ }
      } else {
        handleCopy(pid, document.querySelector(`.rbtn.copy-btn[data-pid="${pid}"]`));
      }
    }

    // ============================================================
    //  COMMENTS (REAL-TIME)
    // ============================================================
    function togCmts(pid) {
      openCommentsSheet(pid);
    }

    function subscribeCmts(pid) {
      unsubscribeCmts(pid);
      const cmtRef = query(ref(db, `comments/${pid}`), orderByChild('timestamp'));
      const unsub = onValue(cmtRef, snap => {
        const cmts = [];
        snap.forEach(ch => {
          const val = ch.val();
          cmts.push({ ...val, id: ch.key });
        });
        cmts.sort((a, b) => a.timestamp - b.timestamp);
renderCmtsUI(pid, cmts);
      }, err => {
        console.error('Comments error:', err);
        const cw = $(`cw-${pid}`);
        if (cw) cw.innerHTML = `<div class="no-cmts" style="color:var(--red)">خطأ في تحميل التعليقات</div>`;
      });
      cmtListeners[pid] = unsub;
    }

    function unsubscribeCmts(pid) {
      if (cmtListeners[pid]) {
        cmtListeners[pid]();
        delete cmtListeners[pid];
      }
    }

    // ============================================================
    //  RENDER COMMENTS UI
    // ============================================================
    function renderCmtsUI(pid, cmts) {
      const list = $('commentsList');
      if (!list || activeCommentsPid !== pid) return;

      // اعرض كل التعليقات القادمة من Firebase بدون أي حد أو استبدال لتعليق سابق.
      const allComments = Array.isArray(cmts) ? [...cmts] : [];
      // الأحدث أولاً كما في المنتدى والإشعارات.
      allComments.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

      if (!allComments.length) {
        list.innerHTML = `<div class="no-cmts" style="padding:35px 10px;text-align:center;color:var(--tx-m)">
          <i class="fa-regular fa-comments" style="font-size:2rem;display:block;margin-bottom:8px;"></i>
          لا توجد تعليقات — كن أول من يعلق!
        </div>`;
        return;
      }

      const html = allComments.map(c => {
        const canDel = c.authorId === CU.uid || CU.verifiedType === 'gold';
        const ctxt = esc(c.text || '').replace(/@([a-zA-Z0-9_.]+)/g, (m, u) =>
          `<span class="cmt-mention" data-un="${u}">@${u}</span>`);

        let attachHtml = '';
        if (c.audioUrl) {
          attachHtml += `
            <div class="comment-voice-bubble">
              <i class="fa-solid fa-microphone"></i>
              <audio controls controlsList="nodownload noplaybackrate" disablePictureInPicture preload="metadata" src="${esc(c.audioUrl)}" oncontextmenu="return false"></audio>
            </div>`;
        }

        return `
        <div class="cmt-item" data-cid="${esc(c.id || '')}">
          <span class="uid-link" data-uid="${esc(c.authorId || '')}">${buildCmtAvHTML(c)}</span>
          <div class="cmt-body">
            <div class="cmt-bubble">
              <div class="cmt-top">
                <span class="cmt-name-wrap" data-uid="${esc(c.authorId || '')}">
                  <span class="cmt-name">${esc(c.authorName || '')}${vb(c.authorId, c.authorVerifiedType || '')}</span>
                  <span class="cmt-user-bio">${esc(c.authorBio || '')}</span>
                </span>
                <span class="cmt-time">${ago(c.timestamp)}</span>
              </div>
              <div class="cmt-txt">${ctxt}${attachHtml}</div>
            </div>
            <div class="cmt-acts">
              <span class="cmt-act" data-reply="${esc(pid)}" data-replyto="${esc(c.authorUsername || c.authorName || '')}">
                <i class="fa-solid fa-reply"></i> رد
              </span>
              ${canDel ? `<span class="cmt-act del" data-delcmt="${esc(pid)}" data-cid="${esc(c.id || '')}">
                <i class="fa-solid fa-trash"></i> حذف
              </span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');

      list.innerHTML = html;

      list.querySelectorAll('.cmt-act[data-reply]').forEach(el => {
        el.addEventListener('click', () => {
          const replyTo = el.dataset.replyto || '';
          $('sheetCommentInput').value = replyTo ? `@${replyTo.replace(/^@/, '')} ` : '';
          $('sheetCommentInput').focus();
        });
      });
      list.querySelectorAll('.cmt-act.del').forEach(el => {
        el.addEventListener('click', () => delCmt(el.dataset.delcmt, el.dataset.cid));
      });
      list.querySelectorAll('.cmt-txt img').forEach(img => {
        img.addEventListener('click', () => window.open(img.src, '_blank'));
      });
      list.querySelectorAll('audio').forEach(audio => {
        audio.setAttribute('controlsList', 'nodownload noplaybackrate');
        audio.setAttribute('disablepictureinpicture', '');
        audio.addEventListener('contextmenu', e => e.preventDefault());
      });

      // ابدأ دائمًا من أعلى القائمة لأن أحدث تعليق في الأعلى.
      requestAnimationFrame(() => { list.scrollTop = 0; });
      hydrateBios(list);
    }

    function buildCmtAvHTML(c) {
      const url = (c.photoURL || c.authorPhoto || '').trim();
      if (url) return `<img src="${esc(url)}" class="cmt-av" style="width:20px;height:20px;" onerror="this.style.display='none'">`;
      const nm = (c.authorName || '?').trim();
      const lt = nm.charAt(0).toUpperCase();
      const bgs = ['#1a4d22', '#2d5a1b', '#1e3a5f', '#5a2d82', '#8b4513', '#1a5276'];
      const cbg = bgs[nm.charCodeAt(0) % bgs.length];
      return `<div style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,${cbg},#2d6e35);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#fff;flex-shrink:0;">${esc(lt)}</div>`;
    }


    // ============================================================
    //  COMMENTS SHEET + VOICE RECORDING
    // ============================================================
    let activeCommentsPid = null;
    let commentsSheetUnsub = null;
    let sheetImageUrl = '';
    let sheetVoiceUrl = '';
    let mediaRecorderSheet = null;
    let mediaStreamSheet = null;
    let voiceChunksSheet = [];
    let voicePreviewUrlSheet = '';

    function openCommentsSheet(pid) {
      activeCommentsPid = pid;
      sheetImageUrl = '';
      sheetVoiceUrl = '';
      voicePreviewUrlSheet = '';

      const p = postsMap[pid];
      $('commentsPostPreview').textContent =
        p ? `${p.authorName || ''}: ${p.content || ''}` : '';

      $('sheetCommentInput').value = '';
      $('sheetAttachmentPreview').innerHTML = '';
      $('sheetAttachmentPreview').classList.remove('on');
      $('commentRecordActions').classList.remove('on');
      $('sheetMicBtn').classList.remove('recording');

      $('commentsSheet').classList.add('on');
      $('commentsSheet').style.display = 'flex';
      $('commentsSheet').style.pointerEvents = 'auto';
      document.body.classList.add('comments-open');
            if (!commentsHistoryActive) { history.pushState({agriSocialComments:true}, '', '#comments'); commentsHistoryActive = true; }
      document.body.style.overflow = 'hidden';

      if (commentsSheetUnsub) commentsSheetUnsub();

      const snapRef = ref(db, `comments/${pid}`);
      commentsSheetUnsub = onValue(snapRef, snap => {
        const cmts = [];
        const raw = snap.val() || {};
        Object.keys(raw).forEach(id => {
          const val = raw[id];
          if (val && typeof val === 'object') cmts.push({ ...val, id });
        });
        // قراءة كل أبناء comments/<postId> لضمان ظهور جميع التعليقات.
        renderCmtsUI(pid, cmts);
      }, err => {
        console.error('Comments sheet error:', err);
        const list = $('commentsList');
        if (list) list.innerHTML = `<div style="padding:35px;text-align:center;color:var(--red)">خطأ في تحميل التعليقات</div>`;
      });

      setTimeout(() => $('sheetCommentInput').focus(), 250);
    }

    let commentsHistoryActive = false;
    function closeCommentsSheet() {
      // إغلاق التعليقات يجب أن يكون مضمونًا حتى لو حدث خطأ في التسجيل
      // أو في مستمع Firebase أو في سجل المتصفح.
      try { stopSheetRecording(true); } catch (_) {}
      try {
        if (commentsSheetUnsub) commentsSheetUnsub();
      } catch (_) {}
      commentsSheetUnsub = null;
      activeCommentsPid = null;

      const sheet = document.getElementById('commentsSheet');
      if (sheet) {
        sheet.classList.remove('on');
        sheet.style.display = 'none';
        sheet.style.visibility = 'hidden';
        sheet.style.pointerEvents = 'none';
      }

      try { document.body.classList.remove('comments-open'); } catch (_) {}
      try { document.body.style.overflow = ''; } catch (_) {}
      commentsHistoryActive = false;

      // إزالة hash بدون history.back حتى لا يغادر المستخدم المنتدى.
      try {
        if (location.hash === '#comments') {
          history.replaceState(history.state, document.title, location.pathname + location.search);
        }
      } catch (_) {}

          }

    window.closeCommentsSheet = closeCommentsSheet;

    function renderSheetAttachment() {
      const box = $('sheetAttachmentPreview');
      if (!box) return;


      if (sheetVoiceUrl) {
        box.innerHTML = `
          <div class="comment-voice-preview">
            <i class="fa-solid fa-microphone"></i>
            <audio controls controlsList="nodownload noplaybackrate" disablePictureInPicture preload="metadata" src="${esc(sheetVoiceUrl)}" oncontextmenu="return false"></audio>
            <button type="button" id="removeSheetVoice"
              style="border:0;background:transparent;color:var(--red);font-size:1.1rem;">✕</button>
          </div>`;
        box.classList.add('on');
        $('removeSheetVoice').onclick = () => {
          sheetVoiceUrl = '';
          if (voicePreviewUrlSheet) {
            URL.revokeObjectURL(voicePreviewUrlSheet);
            voicePreviewUrlSheet = '';
          }
          renderSheetAttachment();
        };
        return;
      }

      box.innerHTML = '';
      box.classList.remove('on');
    }

    async function startSheetRecording() {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        toast('تسجيل الصوت غير مدعوم على هذا الجهاز/المتصفح', 'er');
        return;
      }

      if (mediaRecorderSheet && mediaRecorderSheet.state === 'recording') return;

      try {
        mediaStreamSheet = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceChunksSheet = [];
        mediaRecorderSheet = new MediaRecorder(mediaStreamSheet);

        mediaRecorderSheet.ondataavailable = e => {
          if (e.data && e.data.size) voiceChunksSheet.push(e.data);
        };

        mediaRecorderSheet.onstop = async () => {
          const blob = new Blob(voiceChunksSheet, { type: mediaRecorderSheet.mimeType || 'audio/webm' });

          if (voicePreviewUrlSheet) URL.revokeObjectURL(voicePreviewUrlSheet);
          voicePreviewUrlSheet = URL.createObjectURL(blob);

          // عرض التسجيل محليًا أولاً لكي يسمعه الطالب قبل الإرسال.
          const box = $('sheetAttachmentPreview');
          box.innerHTML = `
            <div style="font-weight:800;margin-bottom:5px;">
              <i class="fa-solid fa-headphones"></i> معاينة التسجيل قبل الإرسال
            </div>
            <div class="comment-voice-preview">
              <audio controls controlsList="nodownload noplaybackrate" disablePictureInPicture src="${voicePreviewUrlSheet}" oncontextmenu="return false"></audio>
              <button type="button" id="deleteRecordedVoice"
                style="border:0;background:transparent;color:var(--red);font-size:1.1rem;">✕</button>
            </div>`;
          box.classList.add('on');

          $('deleteRecordedVoice').onclick = () => {
            sheetVoiceUrl = '';
            box.innerHTML = '';
            box.classList.remove('on');
            if (voicePreviewUrlSheet) {
              URL.revokeObjectURL(voicePreviewUrlSheet);
              voicePreviewUrlSheet = '';
            }
          };

          // رفع التسجيل إلى Cloudinary فقط بعد إيقاف التسجيل.
          try {
            const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
            const url = await uploadFileToCloudinary(file);
            if (url) {
              sheetVoiceUrl = url;
              renderSheetAttachment();
              toast('تم تجهيز الصوت ويمكنك سماعه قبل الإرسال ✓');
            } else {
              toast('فشل رفع التسجيل الصوتي', 'er');
            }
          } catch (e) {
            console.error(e);
            toast('فشل رفع التسجيل الصوتي', 'er');
          }
        };

        mediaRecorderSheet.start();
        $('sheetMicBtn').classList.add('recording');
        $('commentRecordActions').classList.add('on');
        $('recordStopBtn').innerHTML = '<i class="fa-solid fa-stop"></i> إيقاف';
        toast('جاري التسجيل...');

      } catch (e) {
        console.error(e);
        toast('اسمح للمتصفح باستخدام الميكروفون أولاً', 'er');
      }
    }

    function stopSheetRecording(cancelOnly = false) {
      if (mediaRecorderSheet && mediaRecorderSheet.state === 'recording') {
        mediaRecorderSheet.stop();
      }
      if (mediaStreamSheet) {
        mediaStreamSheet.getTracks().forEach(t => t.stop());
        mediaStreamSheet = null;
      }
      $('sheetMicBtn')?.classList.remove('recording');
      $('commentRecordActions')?.classList.remove('on');
      if ($('recordStopBtn')) $('recordStopBtn').innerHTML = '<i class="fa-solid fa-microphone"></i> تسجيل';

      if (cancelOnly) {
        sheetVoiceUrl = '';
        if (voicePreviewUrlSheet) {
          URL.revokeObjectURL(voicePreviewUrlSheet);
          voicePreviewUrlSheet = '';
        }
      }
    }

    async function sendSheetComment() {
      if (!activeCommentsPid) return;

      const inp = $('sheetCommentInput');
      const txt = inp.value.trim();

      if (!txt && !sheetVoiceUrl) {
        toast('اكتب تعليقاً أو أضف تسجيلًا صوتيًا', 'er');
        return;
      }

      const pid = activeCommentsPid;
      const sendBtn = $('sheetSendBtn');
      sendBtn.disabled = true;

      try {
        const data = {
          authorId: CU.uid,
          authorName: CU.fullName || '',
          authorUsername: CU.username || '',
          authorBio: CU.bio || '',
          authorPhoto: CU.photoURL || '',
          authorVerifiedType: CU.verifiedType || null,
          text: txt,
          timestamp: Date.now()
        };

        if (sheetVoiceUrl) data.audioUrl = sheetVoiceUrl;

        const newCommentRef = await push(ref(db, `comments/${pid}`), data);
        const newCommentId = newCommentRef.key;

        const postAuthor = postsMap[pid] && postsMap[pid].authorId;
        notify(postAuthor, 'comment', 'تعليق جديد 💬', `${CU.fullName}: ${txt.substring(0, 55) || 'أرسل مرفقًا'}`, { postId: pid, commentId: newCommentId });
        notifyMentions(txt, pid, newCommentId, postAuthor);

        inp.value = '';
        sheetImageUrl = '';
        sheetVoiceUrl = '';
        $('sheetAttachmentPreview').innerHTML = '';
        $('sheetAttachmentPreview').classList.remove('on');

        // تحديث عداد التعليقات بدون إعادة تحميل الصفحة.
        ref(db, `posts/${pid}/commentsCount`).transaction(c => Math.max(0, (Number(c) || 0) + (1))).catch(() => {});

        toast('تم إرسال التعليق ✓');
      } catch (e) {
        console.error(e);
        toast('فشل إرسال التعليق', 'er');
      } finally {
        sendBtn.disabled = false;
        inp.focus();
      }
    }

    window.addEventListener('popstate', () => {
      const sheet = $('commentsSheet');
      if (sheet && sheet.classList.contains('on')) closeCommentsSheet();
    });
    window.addEventListener('hashchange', () => {
      const sheet = $('commentsSheet');
      if (sheet && sheet.classList.contains('on') && location.hash !== '#comments') closeCommentsSheet();
    });

    // زر الرجوع/الإغلاق: ربط مباشر + تفويض احتياطي للموبايل.
    const commentsCloseBtn = $('commentsCloseBtn');
    if (commentsCloseBtn) {
      commentsCloseBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        closeCommentsSheet();
        return false;
      };
    }
    $('commentsSheet').addEventListener('click', e => {
      if (e.target === $('commentsSheet')) closeCommentsSheet();
    });

    $('sheetSendBtn').addEventListener('click', sendSheetComment);

    $('sheetCommentInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendSheetComment();
      }
    });

    $('sheetMicBtn').addEventListener('click', () => {
      // الضغط على الميكروفون يفتح الخيارات فقط ولا يبدأ التسجيل تلقائيًا.
      if (mediaRecorderSheet?.state === 'recording') return;
      $('commentRecordActions').classList.add('on');
    });

    $('recordStopBtn').addEventListener('click', async () => {
      if (mediaRecorderSheet?.state === 'recording') {
        // أثناء التسجيل يصبح الزر إيقافًا.
        stopSheetRecording(false);
      } else {
        // لا يبدأ التسجيل إلا بالضغط على كلمة "تسجيل".
        await startSheetRecording();
      }
    });

    $('recordCancelBtn').addEventListener('click', () => {
      stopSheetRecording(true);
      $('sheetAttachmentPreview').innerHTML = '';
      $('sheetAttachmentPreview').classList.remove('on');
      toast('تم إلغاء التسجيل');
    });

    // ============================================================
    //  SEND COMMENT
    // ============================================================
    async function sendCmt(pid) {
      const inp = $(`cin-${pid}`);
      if (!inp) return;
      const text = inp.value.trim();
      const preview = $(`cmt-file-preview-${pid}`);
      const attachUrl = preview?.dataset?.attachUrl || null;
      const attachType = preview?.dataset?.attachType || null;
      if (!text && !(attachUrl && attachType === 'audio')) { toast('اكتب تعليقاً أو أضف تسجيلًا صوتيًا', 'er'); return; }
      inp.value = '';
      inp.disabled = true;
      try {
        const data = {
          authorId: CU.uid,
          authorName: CU.fullName || '',
          authorUsername: CU.username || '',
          authorBio: CU.bio || '',
          authorPhoto: CU.photoURL || '',
          authorVerifiedType: CU.verifiedType || null,
          text,
          timestamp: Date.now()
        };
        if (attachUrl && attachType === 'audio') data.audioUrl = attachUrl;
        await push(ref(db, `comments/${pid}`), data);
        if (preview) { preview.innerHTML = '';
          delete preview.dataset.attachType;
          delete preview.dataset.attachUrl; }
        ref(db, `posts/${pid}/commentsCount`).transaction(c => Math.max(0, (Number(c) || 0) + (1))).catch(() => {});
        if (postsMap[pid] && postsMap[pid].authorId !== CU.uid) {
          await push(ref(db, `notifications/${postsMap[pid].authorId}`), {
            type: 'comment',
            title: 'تعليق جديد 💬',
            body: `${CU.fullName}: ${text.substring(0, 55)}`,
            from: CU.uid,
            postId: pid,
            timestamp: Date.now(),
            read: false
          });
        }
      } catch (e) { console.error(e);
        toast('فشل إرسال التعليق', 'er'); } finally { if (inp) { inp.disabled = false;
          inp.focus(); } }
    }

    async function delCmt(pid, cid) {
      if (!confirm('حذف التعليق؟')) return;
      try {
        await remove(ref(db, `comments/${pid}/${cid}`));
        ref(db, `posts/${pid}/commentsCount`).transaction(c => Math.max(0, (Number(c) || 0) + (-1))).catch(() => {});
        toast('تم حذف التعليق');
      } catch (e) { console.error(e);
        toast('فشل الحذف', 'er'); }
    }

    // ============================================================
    //  FEED TABS & SEARCH
    // ============================================================
    document.querySelectorAll('.ftab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.ftab').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        feed = t.dataset.feed;
        renderPosts();
      });
    });
    $('searchBtn').addEventListener('click', () => {
      const w = $('searchWrap');
      const show = !w.classList.contains('on');
      w.classList.toggle('on', show);
      if (show) $('searchIn').focus();
      else { $('searchIn').value = '';
        srchQ = '';
        renderPosts(); }
    });
    let srchT; $('searchIn').addEventListener('input', e => { clearTimeout(srchT); const v = e.target.value.trim(); srchT = setTimeout(() => { srchQ = v; renderPosts(v); }, 180); });
    $('loadMoreBtn').addEventListener('click', () => { feedLimit += 30; feedReady = true; subscribeFeed(); });


    // ============================================================
    //  CLOUDINARY IMAGE / VOICE UPLOAD
    // ============================================================
    async function uploadFileToCloudinary(file) {
      if (!file) throw new Error('No file');
      if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        throw new Error('Cloudinary configuration missing');
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(CLOUDINARY_UPLOAD_URL, { method:'POST', body:fd });
      if (!res.ok) throw new Error('Cloudinary HTTP '+res.status);
      const data = await res.json();
      if (!data.secure_url) throw new Error('No secure_url');
      return data.secure_url;
    }

    // ============================================================
    //  CREATE POST
    // ============================================================
    let postImageUrl = '';

    let postImageFile = null;
    let postImageObjectUrl = '';

    $('imgBtn').addEventListener('click', () => {
      $('mImgFile').value = '';
      $('mImgUrl').value = '';
      $('mImgPrev').style.display = 'none';
      postImageUrl = '';
      postImageFile = null;
      postImageObjectUrl = '';
      $('imgModal').classList.add('on');
    });


    async function prepareImageForUpload(file){
      if (!file) throw new Error('no-file');
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('unsupported-image');
      if (file.size <= 6 * 1024 * 1024) return file;
      return await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read-failed'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('decode-failed'));
          img.onload = () => {
            const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            const scale = Math.min(1, 1800 / Math.max(w,h));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w*scale));
            canvas.height = Math.max(1, Math.round(h*scale));
            const ctx = canvas.getContext('2d', {alpha:false});
            if(!ctx) return reject(new Error('canvas-failed'));
            ctx.drawImage(img,0,0,canvas.width,canvas.height);
            canvas.toBlob(blob=>{
              if(!blob) return reject(new Error('compression-failed'));
              resolve((typeof File === 'function') ? new File([blob], `agrisocial-${Date.now()}.jpg`, {type:'image/jpeg',lastModified:Date.now()}) : blob);
            },'image/jpeg',0.82);
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    // استخدام FileReader للمعاينة، مثل النموذج الذكي، وتجنب URL.createObjectURL داخل WebView.
    $('mImgFile').addEventListener('change', function() {
      const file = this.files && this.files[0];
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        toast('اختر ملف صورة فقط', 'er');
        this.value = '';
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast('الصورة كبيرة جدًا، الحد الأقصى 10MB', 'er');
        this.value = '';
        return;
      }
      postImageFile = file;
      $('mImgUrl').value = '';
      const reader = new FileReader();
      reader.onload = ev => {
        $('mImgPrevImg').src = ev.target.result;
        $('mImgPrev').style.display = 'block';
      };
      reader.onerror = () => toast('فشل قراءة الصورة من الجهاز', 'er');
      reader.readAsDataURL(file);
    });
    $('mImgUrl').addEventListener('input', function(){
      const url = this.value.trim();
      if (!url) return;
      postImageFile = null;
      postImageObjectUrl = '';
      $('mImgPrevImg').src = url;
      $('mImgPrevImg').onerror = () => toast('الرابط ليس رابط صورة مباشر صالح', 'er');
      $('mImgPrev').style.display = 'block';
    });

    $('cancelImg').addEventListener('click', () => {
      $('imgModal').classList.remove('on');
      postImageUrl = ''; postImageFile = null;
      postImageObjectUrl = '';
    });

    $('confirmImg').addEventListener('click', async () => {
      const direct = $('mImgUrl').value.trim();
      const btn = $('confirmImg');
      if (!direct && !postImageFile) { toast('ضع رابط الصورة أو اختر صورة من الجهاز', 'er'); return; }
      btn.disabled = true;
      btn.textContent = 'جارٍ تجهيز الصورة...';
      try {
        let url = direct;
        if (!url && postImageFile) { const safeImage = await prepareImageForUpload(postImageFile); url = await uploadFileToCloudinary(safeImage); }
        if (!url) throw new Error('upload failed');
        postImageUrl = url;
        $('prevImg').src = url;
        $('mediaPrev').style.display = 'block';
        $('mediaPrev').dataset.url = url;
        $('imgModal').classList.remove('on');
        toast('تم تجهيز الصورة ✓');
      } catch(e) {
        console.error('image upload:', e);
        toast('تعذر رفع الصورة. جرّب رابطًا مباشرًا للصورة.', 'er');
      } finally {
        btn.disabled = false;
        btn.textContent = 'إضافة';
      }
    });
    $('imgModal').addEventListener('click', e => { if (e.target === $('imgModal')) $('cancelImg').click(); });

    $('rmImgBtn').addEventListener('click', () => {
      $('mediaPrev').style.display = 'none';
      $('prevImg').src = '';
      delete $('mediaPrev').dataset.url;
      postImageUrl = '';
    });

    $('pollToggle').addEventListener('click', () => $('pollBox').classList.toggle('on'));
    $('addOptBtn').addEventListener('click', () => {
      const w = $('pollOptsWrap');
      const inp = document.createElement('input');
      inp.className = 'poll-inp';
      inp.type = 'text';
      inp.placeholder = `الخيار ${w.children.length + 1}`;
      inp.style.marginBottom = '7px';
      w.appendChild(inp);
    });
    $('savePollBtn').addEventListener('click', () => {
      const q = $('pollQ').value.trim();
      const realOpts = Array.from($('pollOptsWrap').querySelectorAll('input')).map(i => ({ text: i.value.trim(),
        votes: 0 }));
      if (!q || realOpts.length < 2 || realOpts.some(o => !o.text)) { toast('أدخل سؤالاً وخيارين', 'er'); return; }
      pendPoll = { question: q, options: realOpts };
      $('pollBox').classList.remove('on');
      toast('تم إعداد الاستطلاع 📊');
    });

    $('pubBtn').addEventListener('click', async () => {
      if (offline) { toast('لا يوجد اتصال', 'er'); return; }
      const content = $('postTxt').value.trim();
      const imgUrl = $('mediaPrev').dataset.url || '';
      if (!content && !imgUrl && !pendPoll) { toast('المنشور فارغ', 'er'); return; }
      $('pubBtn').disabled = true;
      $('pubBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        const pd = {
          authorId: CU.uid,
          authorName: CU.fullName,
          authorUsername: CU.username || '',
          authorBio: CU.bio || '',
          authorPhoto: CU.photoURL || '',
          authorVerifiedType: CU.verifiedType || null,
          content,
          imageUrl: imgUrl || null,
          timestamp: Date.now(),
          likes: {},
          commentsCount: 0,
          grade: ['gold','blue'].includes(CU.verifiedType) ? (staffAudience === 'all' ? '' : staffAudience) : (CU.grade || ''),
          audience: ['gold','blue'].includes(CU.verifiedType) ? staffAudience : (CU.grade || '')
        };
        if (pendPoll) { pd.poll = pendPoll;
          pendPoll = null; }
        const newPostRef = await push(ref(db, 'posts'), pd);

        fanOutPostNotifications(pd, newPostRef.key);

        $('postTxt').value = '';
        $('mediaPrev').style.display = 'none';
        $('prevImg').src = '';
        delete $('mediaPrev').dataset.url;
        $('pollBox').classList.remove('on');
        $('pollQ').value = '';
        $('pollOptsWrap').innerHTML =
          `<input class="poll-inp" type="text" placeholder="الخيار الأول"><input class="poll-inp" type="text" placeholder="الخيار الثاني">`;
        toast('تم نشر المنشور 🌱');
      } catch (e) { console.error(e);
        toast('فشل النشر', 'er'); } finally {
        $('pubBtn').disabled = false;
        $('pubBtn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> نشر';
      }
    });

    // ============================================================
    //  NOTIFICATIONS
    // ============================================================
    let notifSeen = null, notifOff = null;
    function subscribeNotifs() {
      if (notifOff) notifOff();
      notifOff = onValue(query(ref(db, `notifications/${CU.uid}`), orderByChild('timestamp'), limitToLast(100)), snap => {
        const list = [];
        snap.forEach(ch => list.push({ id: ch.key, ...ch.val() }));
        list.sort((a, b) => b.timestamp - a.timestamp);
        if (notifSeen) list.filter(n => !n.read && !notifSeen.has(n.id)).slice(0, 2).forEach(n => toast(`${n.title || 'إشعار'} — ${n.body || ''}`));
        notifSeen = new Set(list.map(n => n.id));
        notifsC = list;
        const u = list.filter(n => !n.read).length, nb = $('navBadge'), td = $('topDot');
        nb.textContent = u > 9 ? '9+' : u; nb.classList.toggle('on', !!u); td.classList.toggle('on', !!u);
        if ($('notifications-screen').classList.contains('on')) renderNotifs();
      });
    }

    async function openNotificationTarget(n) {
      if (!n) return;
      try {
        // Mark as read first.
        if (CU?.uid && n.id) await update(ref(db, `notifications/${CU.uid}/${n.id}`), { read: true });

        if (n.type === 'follow' && n.from) {
          await openPub(n.from);
          return;
        }

        if ((n.type === 'comment' || n.type === 'reply' || n.type === 'mention') && n.postId) {
          switchSc('home');
          setTimeout(() => {
            openCommentsSheet(n.postId);
            if (n.commentId) {
              setTimeout(() => {
                const item = document.querySelector(`.cmt-item[data-cid="${CSS.escape(n.commentId)}"]`);
                if (item) {
                  item.classList.add('notif-focus');
                  item.scrollIntoView({ behavior:'smooth', block:'center' });
                  setTimeout(() => item.classList.remove('notif-focus'), 3000);
                }
              }, 450);
            }
          }, 80);
          return;
        }

        if ((n.type === 'like' || n.type === 'verified_post' || n.type === 'following_post') && n.postId) {
          switchSc('home');
          setTimeout(() => {
            const card = document.querySelector(`.post-card[data-pid="${CSS.escape(n.postId)}"]`);
            if (!card) { openCommentsSheet(n.postId); return; }
            if (card) {
              card.scrollIntoView({ behavior:'smooth', block:'center' });
              card.style.outline = '2px solid var(--gold)';
              card.style.boxShadow = '0 0 0 5px var(--gold-d)';
              setTimeout(() => { card.style.outline=''; card.style.boxShadow=''; }, 3000);
            }
          }, 80);
          return;
        }
      } catch (e) {
        console.error('notification navigation:', e);
      }
    }

    function renderNotifs() {
      const w = $('notifsWrap');
      if (!notifsC.length) { w.innerHTML = `<div class="empty"><i class="fa-regular fa-bell-slash"></i><p>لا توجد إشعارات</p></div>`; return; }
      const im = { like: 'fa-heart', comment: 'fa-comment', reply: 'fa-reply', mention: 'fa-at', follow: 'fa-user-plus', following_post: 'fa-newspaper', verified_post: 'fa-circle-check', system: 'fa-bell' };
      const cl = { like: 'ni-like', comment: 'ni-cmt', reply: 'ni-cmt', mention: 'ni-cmt', follow: 'ni-follow', following_post: 'ni-cmt', verified_post: 'ni-sys', system: 'ni-sys' };
      const hasUnread = notifsC.some(n => !n.read);
      w.innerHTML = (hasUnread ? `<button type="button" class="notif-readall" id="readAllBtn"><i class="fa-solid fa-check-double"></i> تعليم الكل كمقروء</button>` : '') +
        notifsC.map(n => `
      <div class="notif-card actionable ${n.read ? '' : 'unread'}" data-nid="${esc(n.id)}">
        <div class="notif-av-wrap">${avHTML({ fullName: n.fromName || '?', photoURL: n.fromPhoto }, 42, 'notif-av')}<span class="ni-mini ${cl[n.type] || 'ni-sys'}"><i class="fa-solid ${im[n.type] || 'fa-bell'}"></i></span></div>
        <div class="notif-body">
          <div class="notif-ttl">${esc(n.title || 'إشعار')}${n.from ? vb(n.from, n.verifiedType) : ''}</div>
          <div class="notif-txt">${esc(n.body || '')}</div>
          <div class="notif-time">${ago(n.timestamp)}</div>
        </div>
        ${!n.read ? '<div class="notif-dot"></div>' : ''}
      </div>`).join('');
    }
    $('notifsWrap').addEventListener('click', e => {
      if (e.target.closest('#readAllBtn')) {
        const upd = {}; notifsC.forEach(n => { if (!n.read) upd[`notifications/${CU.uid}/${n.id}/read`] = true; });
        if (Object.keys(upd).length) update(ref(db), upd); return;
      }
      const card = e.target.closest('.notif-card');
      if (card) openNotificationTarget(notifsC.find(x => x.id === card.dataset.nid));
    });
    $('notifTopBtn').addEventListener('click', () => switchSc('notifications'));

    // ============================================================
    //  SAVED
    // ============================================================
    async function loadSaved() {
      const w = $('savedWrap');
      w.innerHTML = `<div class="loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
      try {
        let ids = [];
        if (CU && CU.uid) {
          const snap = await get(ref(db, `saves/${CU.uid}`));
          if (snap.exists()) ids = Object.keys(snap.val());
        }
        if (!ids.length) {
          try { ids = JSON.parse(localStorage.getItem('agri_saved_posts') || '[]'); } catch (_) { ids = []; }
        }
        const saved = [];
        for (const id of ids) {
          const ps = await get(ref(db, `posts/${id}`));
          if (ps.exists()) saved.push({ id, ...ps.val() });
        }
        if (!saved.length) { w.innerHTML =
          `<div class="empty"><i class="fa-regular fa-bookmark"></i><p>لا توجد محفوظات</p></div>`; return; }
        w.innerHTML = saved.sort((a, b) => b.timestamp - a.timestamp).map(buildPost).join('');
        bindPostEv();
      } catch (e) { console.error(e); w.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>خطأ في التحميل</p></div>`; }
    }

    // ============================================================
    //  PROFILE
    // ============================================================
    async function renderProfile() {
      const aw = $('profAvWrap');
      aw.innerHTML = '';
      const el = makeAvEl(CU, 70);
      el.className = 'prof-av';
      el.style.cursor = 'pointer';
      el.onclick = () => $('editProfBtn').click();
      aw.appendChild(el);
      $('profFN').textContent = CU.fullName || '—';
      $('profBadge').innerHTML = vbadge(CU.verifiedType);
      $('profHandle').textContent = '@' + (CU.username || '');
      $('profBio').textContent = CU.bio || '';
      const myP = getPostsArr().filter(p => p.authorId === CU.uid);
      $('sPosts').textContent = myP.length;
      const fSnap = await get(ref(db, `users_v2/${CU.uid}/followers`));
      $('sFollowers').textContent = fSnap.val() || 0;
      $('sLikes').textContent = myP.reduce((s, p) => s + likesOf(p), 0);
      const mp = $('myPostsWrap');
      if (myP.length) {
        mp.innerHTML =
          `<div class="sec-ttl"><i class="fa-solid fa-table-cells-large"></i> منشوراتي (${myP.length})</div>` +
          myP.sort((a, b) => b.timestamp - a.timestamp).map(buildPost).join('');
        bindPostEv();
      } else {
        mp.innerHTML = `<div class="empty"><i class="fa-regular fa-pen-to-square"></i><p>لم تنشر بعد</p></div>`;
      }
    }

    $('editProfBtn').addEventListener('click', () => {
      $('ef_name').value = CU.fullName || '';
      $('ef_user').value = CU.username || '';
      $('ef_bio').value = CU.bio || '';

      $('editCard').classList.add('on');
      $('editCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('cancelProfBtn').addEventListener('click', () => $('editCard').classList.remove('on'));
    $('saveProfBtn').addEventListener('click', async () => {
      const name = $('ef_name').value.trim();
      const uname = $('ef_user').value.trim();
      const bio = $('ef_bio').value.trim();
      if (!name || !uname) { toast('الاسم واسم المستخدم مطلوبان', 'er'); return; }
      try {
        await update(ref(db, `users_v2/${CU.uid}`), { fullName: name, username: uname, bio });
        Object.assign(CU, { fullName: name, username: uname, bio });
        renderCreateAv();
        $('editCard').classList.remove('on');
        renderProfile();
        toast('تم التحديث');
      } catch { toast('حدث خطأ', 'er'); }
    });

    // ============================================================
    //  PUBLIC PROFILE + FOLLOWING
    // ============================================================
    let activePublicProfileUid = null;

    window.openPub = async uid => {
      if (!uid) return;
      if (uid === CU.uid) { switchSc('profile'); return; }
      try {
        const snap = await get(ref(db, `users_v2/${uid}`));
        if (!snap.exists()) { toast('مستخدم غير موجود', 'er'); return; }
        await showPubSheet(uid, snap.val());
      } catch (e) { console.error(e); toast('تعذر فتح الملف الشخصي', 'er'); }
    };

    window.openPubByUser = async uname => {
      try {
        const uid = await userIdByName(uname);
        if (!uid) { toast('@' + uname + ' غير موجود', 'er'); return; }
        openPub(uid);
      } catch (e) { console.error(e); toast('تعذر فتح الملف الشخصي', 'er'); }
    };

    async function isFollowing(uid) {
      if (!CU?.uid || !uid) return false;
      const snap = await get(ref(db, `users_v2/${CU.uid}/following/${uid}`));
      return snap.exists() && snap.val() === true;
    }

    async function toggleFollow(uid) {
      if (!CU || !CU.uid || !uid || uid === CU.uid) return;
      if (offline) { toast('لا يوجد اتصال', 'er'); return; }
      const now = !myFollowing.has(uid);
      now ? myFollowing.add(uid) : myFollowing.delete(uid);
      syncFollowChips();
      try {
        await update(ref(db), { [`users_v2/${CU.uid}/following/${uid}`]: now ? true : null });
        const res = await ref(db, `users_v2/${uid}/followers`).transaction(c => Math.max(0, (Number(c) || 0) + (now ? 1 : -1)));
        if (activePublicProfileUid === uid) $('pubFollowers').textContent = res.snapshot.val() || 0;
        ref(db, `followers_of/${uid}/${CU.uid}`).set(now ? true : null).catch(() => {});
        if (now) {
          notify(uid, 'follow', 'متابع جديد 👤', `${CU.fullName || '@' + (CU.username || '')} بدأ بمتابعتك`, {}, `follow_${CU.uid}`);
          toast('بدأت المتابعة ✓');
        } else {
          ref(db, `notifications/${uid}/follow_${CU.uid}`).remove().catch(() => {});
          toast('تم إلغاء المتابعة');
        }
      } catch (e) {
        console.error('follow:', e);
        now ? myFollowing.delete(uid) : myFollowing.add(uid);
        syncFollowChips();
        toast('تعذر تحديث المتابعة', 'er');
      }
    }

    function updateFollowButton(following) {
      const btn = $('pubFollowBtn');
      if (!btn) return;
      btn.classList.toggle('following', !!following);
      btn.innerHTML = following
        ? '<i class="fa-solid fa-user-check"></i><span>تتابعه</span>'
        : '<i class="fa-solid fa-user-plus"></i><span>متابعة</span>';
    }

    async function showPubSheet(uid, u) {
      activePublicProfileUid = uid;
      const aw = $('pubAvWrap');
      aw.innerHTML = '';
      const el = makeAvEl(u, 72);
      el.className = 'pub-av';
      aw.appendChild(el);
      $('pubFN').textContent = u.fullName || '';
      $('pubBadge').innerHTML = vbadge(u.verifiedType);
      $('pubHandle').textContent = '@' + (u.username || '');
      $('pubBio').textContent = u.bio || '';
      await loadUserPosts(uid);
      const userPosts = Object.values(postsMap).filter(p => p.authorId === uid).sort((a,b) => b.timestamp-a.timestamp);
      $('pubPosts').textContent = userPosts.length;
      $('pubFollowers').textContent = Number(u.followers || 0);
      $('pubLikes').textContent = userPosts.reduce((s, p) => s + likesOf(p), 0);
      const roleMap = { student: 'طالب 🌿', assistant: 'معيد 🔬', doctor: 'دكتور 👨‍🏫' };
      $('pubRoleWrap').innerHTML = u.role ? `<span class="pub-role"><i class="fa-solid fa-graduation-cap"></i> ${roleMap[u.role] || u.role}</span>` : '';

      $('pubPostsWrap').innerHTML = userPosts.length
        ? userPosts.map(buildPost).join('')
        : `<div class="empty"><i class="fa-regular fa-pen-to-square"></i><p>لا توجد منشورات بعد</p></div>`;
      if (userPosts.length) bindPostEv();

      updateFollowButton(myFollowing.has(uid));
      $('pubOv').classList.add('on');
      document.body.style.overflow = 'hidden';
      $('pubOv').scrollTop = 0;
    }

    $('pubFollowBtn').addEventListener('click', () => toggleFollow(activePublicProfileUid));
    $('pubCloseBtn').addEventListener('click', () => { $('pubOv').classList.remove('on'); document.body.style.overflow = ''; });
    $('pubOv').addEventListener('click', e => { if (e.target === $('pubOv')) { $('pubOv').classList.remove('on'); document.body.style.overflow = ''; } });
    // ============================================================
    //  ONLINE / OFFLINE
    // ============================================================
    window.addEventListener('online', () => { offline = false;
      toast('تم استعادة الاتصال'); });
    window.addEventListener('offline', () => { offline = true;
      toast('انقطع الاتصال', 'er'); });
  




    // ============================================================
    //  EXTRAS: follow state, notifications helper, bios cache
    // ============================================================
    let myFollowing = new Set(), followOff = null;
    function subscribeFollowing() {
      if (followOff) followOff();
      followOff = onValue(ref(db, `users_v2/${CU.uid}/following`), s => {
        const v = s.val() || {};
        myFollowing = new Set(Object.keys(v).filter(k => v[k] === true));
        syncFollowChips();
      });
    }
    function syncFollowChips() {
      document.querySelectorAll('.follow-chip').forEach(c => {
        const on = myFollowing.has(c.dataset.uid);
        c.classList.toggle('on', on);
      });
      if (activePublicProfileUid) updateFollowButton(myFollowing.has(activePublicProfileUid));
    }
    function notify(to, type, title, body, extra = {}, key) {
      if (!to || to === CU.uid) return Promise.resolve();
      const data = { type, title, body, from: CU.uid, fromName: CU.fullName || '', fromPhoto: CU.photoURL || '', timestamp: Date.now(), read: false, ...extra };
      const r = ref(db, `notifications/${to}`);
      return (key ? r.child(key).set(data) : r.push(data)).catch(e => console.warn('notify:', e));
    }
    const nameCache = new Map();
    async function userIdByName(un) {
      un = String(un || '');
      if (nameCache.has(un)) return nameCache.get(un);
      const s = await get(query(ref(db, 'users_v2'), orderByChild('username'), equalTo(un)));
      let uid = null; s.forEach(ch => { uid = uid || ch.key; });
      if (uid) nameCache.set(un, uid);
      return uid;
    }
    async function notifyMentions(text, pid, cid, skipUid) {
      const names = [...new Set((String(text).match(/@([a-zA-Z0-9_.]+)/g) || []).map(x => x.slice(1)))].slice(0, 5);
      for (const un of names) {
        try {
          const uid = await userIdByName(un);
          if (uid && uid !== skipUid) notify(uid, 'mention', 'تمت الإشارة إليك 🏷️', `${CU.fullName}: ${String(text).substring(0, 55)}`, { postId: pid, commentId: cid });
        } catch (_) {}
      }
    }
    async function loadUserPosts(uid) {
      try {
        const s = await get(query(ref(db, 'posts'), orderByChild('authorId'), equalTo(uid)));
        s.forEach(ch => { postsMap[ch.key] = { id: ch.key, ...ch.val() }; });
      } catch (e) { console.warn('loadUserPosts:', e); }
    }
    const bioCache = new Map();
    function hydrateBios(root) {
      root.querySelectorAll('.cmt-name-wrap[data-uid]').forEach(async w => {
        const uid = w.dataset.uid; if (!uid) return;
        if (!bioCache.has(uid)) bioCache.set(uid, get(ref(db, `users_v2/${uid}/bio`)).then(s => String(s.val() || '').trim()).catch(() => ''));
        const bio = await bioCache.get(uid), el = w.querySelector('.cmt-user-bio');
        if (el) { el.textContent = bio; el.style.display = bio ? 'block' : 'none'; }
      });
    }
    // إشعارات منشور جديد: قراءة المستخدمين مرة واحدة فقط عند الحاجة
    async function fanOutPostNotifications(pd, pid) {
      try {
        const targets = new Map(), now = Date.now();
        const add = (uid, type, title, body) => {
          if (uid === CU.uid || targets.has(uid)) return;
          targets.set(uid, { type, title, body, from: CU.uid, fromName: CU.fullName || '', fromPhoto: CU.photoURL || '', postId: pid, verifiedType: CU.verifiedType || null, timestamp: now, read: false });
        };
        const indexed = (await get(ref(db, `users_v2/${CU.uid}/followersIndexed`))).val() === true;
        const fSnap = await get(ref(db, `followers_of/${CU.uid}`));
        const followerIds = fSnap.exists() ? Object.keys(fSnap.val()) : [];
        const users = (CU.verifiedType || !indexed) ? await get(ref(db, 'users_v2')) : null;
        if (users && CU.verifiedType) {
          users.forEach(ch => {
            const u = ch.val() || {};
            if (u.role !== 'student' || u.status === 'banned') return;
            if (pd.audience === 'all' || String(u.grade || '') === String(pd.audience)) add(ch.key, 'verified_post', 'منشور جديد من حساب موثق', `${CU.fullName || 'حساب موثق'} نشر منشورًا جديدًا`);
          });
        }
        if (users && !indexed) {
          const mirror = { [`users_v2/${CU.uid}/followersIndexed`]: true };
          users.forEach(ch => { const u = ch.val() || {}; if (u.following && u.following[CU.uid] === true && u.status !== 'banned') { followerIds.push(ch.key); mirror[`followers_of/${CU.uid}/${ch.key}`] = true; } });
          update(ref(db), mirror).catch(() => {});
        }
        new Set(followerIds).forEach(id => add(id, 'following_post', 'منشور جديد من شخص تتابعه 🌱', `${CU.fullName || 'مستخدم'} نشر منشورًا جديدًا`));
        const upd = {}; targets.forEach((v, uid) => { upd[`notifications/${uid}/post_${pid}`] = v; });
        if (Object.keys(upd).length) await update(ref(db), upd);
      } catch (e) { console.error('fan-out:', e); }
    }

    // ============================================================
    //  LIVE VERIFIED BADGE: يعتمد على حالة الحساب الحالية (يشمل المنشورات والتعليقات القديمة)
    // ============================================================
    const verifiedMap = {}, vbWatch = new Set();
    function vb(uid, fallback) {
      uid = String(uid || '');
      if (uid && !vbWatch.has(uid)) watchVerified(uid);
      const t = uid in verifiedMap ? verifiedMap[uid] : fallback;
      return `<span class="vb-slot" data-vb="${esc(uid)}">${vbadge(t)}</span>`;
    }
    function watchVerified(uid) {
      if (vbWatch.size >= 200) return;
      vbWatch.add(uid);
      ref(db, `users_v2/${uid}/verifiedType`).on('value', s => {
        const v = s.val();
        const t = ['blue', 'gold', 'green'].includes(v) ? v : null;
        verifiedMap[uid] = t;
        document.querySelectorAll(`.vb-slot[data-vb="${uid}"]`).forEach(e => { e.innerHTML = vbadge(t); });
      }, () => {});
    }
