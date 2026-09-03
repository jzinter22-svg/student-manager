// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
// A thin wrapper around fetch(). Requests are same-origin by default (this
// page and the API are served from the same server.js), so the browser
// sends the HttpOnly session cookie automatically -- nothing here ever
// reads, sets, or stores that cookie itself.

class ApiError extends Error {
    constructor(message, status, serverMessage, isNetworkError) {
        super(message);
        this.status = status;
        this.serverMessage = serverMessage || '';
        this.isNetworkError = Boolean(isNetworkError);
    }
}

async function apiFetch(url, options) {
    options = options || {};
    let response;

    try {
        response = await fetch(url, {
            credentials: 'same-origin',
            headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
            method: options.method || 'GET',
            body: options.body
        });
    } catch (networkError) {
        throw new ApiError('تعذر الاتصال بالخادم. حاول مرة أخرى.', 0, '', true);
    }

    let data = null;
    try {
        data = await response.json();
    } catch (parseError) {
        data = null;
    }

    if (!response.ok) {
        const serverMessage = (data && (data.error || data.message)) || '';
        throw new ApiError(serverMessage || 'حدث خطأ غير متوقع.', response.status, serverMessage, false);
    }

    return data;
}

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const initialLoading = document.getElementById('initialLoading');

const screens = {
    login: document.getElementById('screen-login'),
    register: document.getElementById('screen-register'),
    app: document.getElementById('screen-app')
};

const loginForm = document.getElementById('loginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const loginNotice = document.getElementById('loginNotice');
const loginSubmit = document.getElementById('loginSubmit');
const showRegisterBtn = document.getElementById('showRegisterBtn');

const registerForm = document.getElementById('registerForm');
const regSchoolNameInput = document.getElementById('regSchoolName');
const regSchoolCodeInput = document.getElementById('regSchoolCode');
const regUserNameInput = document.getElementById('regUserName');
const regEmailInput = document.getElementById('regEmail');
const regPasswordInput = document.getElementById('regPassword');
const regPasswordConfirmInput = document.getElementById('regPasswordConfirm');
const registerError = document.getElementById('registerError');
const registerSubmit = document.getElementById('registerSubmit');
const showLoginBtn = document.getElementById('showLoginBtn');

const logoutBtn = document.getElementById('logoutBtn');
const headerUserName = document.getElementById('headerUserName');
const headerUserRole = document.getElementById('headerUserRole');
const headerUserSchool = document.getElementById('headerUserSchool');

const menuToggle = document.getElementById('menuToggle');
const sidebarNav = document.getElementById('sidebarNav');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));

const welcomeGreeting = document.getElementById('welcomeGreeting');
const welcomeSchool = document.getElementById('welcomeSchool');
const dashboardError = document.getElementById('dashboardError');
const statTotalStudents = document.getElementById('statTotalStudents');
const qaAddStudent = document.getElementById('qaAddStudent');
const qaViewStudents = document.getElementById('qaViewStudents');
const recentStudentsList = document.getElementById('recentStudentsList');

const placeholderTitle = document.getElementById('placeholderTitle');

const addStudentForm = document.getElementById('addStudentForm');
const studentNameInput = document.getElementById('studentName');
const addStudentSubmit = document.getElementById('addStudentSubmit');
const studentsError = document.getElementById('studentsError');
const studentsMessage = document.getElementById('studentsMessage');
const studentsLoading = document.getElementById('studentsLoading');
const studentSearchInput = document.getElementById('studentSearch');
const studentsList = document.getElementById('studentsList');

// Application state. state.students is the authenticated school's full
// student dataset, loaded once and reused by both the dashboard and the
// students view -- re-fetched only after a mutation (adding a student) or
// an explicit retry, never on every small UI interaction.
const state = {
    user: null,
    students: [],
    studentsLoadState: 'idle' // 'idle' | 'loading' | 'loaded' | 'error'
};

const NAV_SECTIONS = {
    dashboard: { view: 'view-dashboard', functional: true },
    students: { view: 'view-students', functional: true },
    teachers: { view: 'view-placeholder', functional: false, label: 'المعلمون' },
    classes: { view: 'view-placeholder', functional: false, label: 'الصفوف' },
    subjects: { view: 'view-placeholder', functional: false, label: 'المواد' },
    attendance: { view: 'view-placeholder', functional: false, label: 'الحضور' },
    grades: { view: 'view-placeholder', functional: false, label: 'الدرجات' }
};

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function showError(el, text) {
    el.textContent = text;
}

function clearError(el) {
    el.textContent = '';
}

function showNotice(el, text) {
    el.textContent = text;
}

function clearNotice(el) {
    el.textContent = '';
}

async function withLoading(button, loadingText, task) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
    try {
        await task();
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

const ROLE_LABELS = {
    owner: 'مالك',
    admin: 'مدير',
    teacher: 'معلم',
    staff: 'موظف'
};

function translateRole(role) {
    return ROLE_LABELS[role] || role;
}

// ---------------------------------------------------------------------------
// Screen navigation
// ---------------------------------------------------------------------------

function hideAllScreens() {
    screens.login.hidden = true;
    screens.register.hidden = true;
    screens.app.hidden = true;
}

function showLoginScreen() {
    hideAllScreens();
    screens.login.hidden = false;
    clearError(loginError);
    loginForm.reset();
}

function showRegisterScreen() {
    hideAllScreens();
    screens.register.hidden = false;
    clearError(registerError);
}

function showAppScreen(user) {
    state.user = user;
    // Reset any previous session's cached student data before rendering,
    // so switching users (logout -> login as someone else) never briefly
    // shows a stale list from the prior session while the new fetch runs.
    state.students = [];
    state.studentsLoadState = 'idle';
    hideAllScreens();
    screens.app.hidden = false;
    renderUserInfo(user);
    navigateTo('dashboard');
    renderStudentDependentUI();
    loadStudentsData();
}

// ---------------------------------------------------------------------------
// Authentication state
// ---------------------------------------------------------------------------

// The backend session cookie is the only source of truth for authentication.
// This never assumes a logged-in state just because a cookie is present --
// it always asks the server via GET /api/auth/me. Called once at startup.
async function checkAuth() {
    try {
        const data = await apiFetch('/api/auth/me', { method: 'GET' });
        showAppScreen(data.user);
    } catch (error) {
        showLoginScreen();
    } finally {
        initialLoading.hidden = true;
    }
}

function renderUserInfo(user) {
    headerUserName.textContent = user.name || '';
    headerUserName.title = user.email || '';
    headerUserRole.textContent = translateRole(user.role);
    headerUserSchool.textContent = user.school_name || '';
    welcomeGreeting.textContent = 'مرحباً، ' + (user.name || '');
    welcomeSchool.textContent = user.school_name || '';
}

// ---------------------------------------------------------------------------
// Navigation (dashboard shell, sidebar, mobile drawer)
// ---------------------------------------------------------------------------

function setActiveNavItem(section) {
    navItems.forEach(function (btn) {
        const isActive = btn.dataset.section === section;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            btn.setAttribute('aria-current', 'page');
        } else {
            btn.removeAttribute('aria-current');
        }
    });
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(function (view) {
        view.hidden = view.id !== viewId;
    });
}

function openMobileSidebar() {
    sidebarNav.classList.add('open');
    sidebarBackdrop.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
}

function closeMobileSidebar() {
    sidebarNav.classList.remove('open');
    sidebarBackdrop.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
}

// Lightweight client-side "router": switches which view is visible and
// keeps the sidebar's active state in sync. Placeholder sections (teachers,
// classes, ...) all render the same view-placeholder section with a
// different title -- no fake CRUD UI is built for them.
function navigateTo(section) {
    const config = NAV_SECTIONS[section];
    if (!config) return;

    setActiveNavItem(section);

    if (config.functional) {
        showView(config.view);
    } else {
        placeholderTitle.textContent = config.label;
        showView(config.view);
    }

    if (section === 'students' && state.studentsLoadState === 'idle') {
        loadStudentsData();
    }

    closeMobileSidebar();
}

navItems.forEach(function (btn) {
    btn.addEventListener('click', function () {
        navigateTo(btn.dataset.section);
    });
});

menuToggle.addEventListener('click', function () {
    if (sidebarNav.classList.contains('open')) {
        closeMobileSidebar();
    } else {
        openMobileSidebar();
    }
});

sidebarBackdrop.addEventListener('click', closeMobileSidebar);

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && sidebarNav.classList.contains('open')) {
        closeMobileSidebar();
    }
});

qaAddStudent.addEventListener('click', function () {
    navigateTo('students');
    studentNameInput.focus();
});

qaViewStudents.addEventListener('click', function () {
    navigateTo('students');
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

loginForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(loginError);
    clearNotice(loginNotice);

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
        showError(loginError, 'يرجى إدخال البريد الإلكتروني وكلمة المرور.');
        return;
    }

    withLoading(loginSubmit, 'جاري تسجيل الدخول...', async function () {
        try {
            const data = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            showAppScreen(data.user);
        } catch (error) {
            if (error.isNetworkError) {
                showError(loginError, 'تعذر الاتصال بالخادم. حاول مرة أخرى.');
            } else {
                // Deliberately generic: the API itself never reveals whether
                // the email exists, and neither should this message.
                showError(loginError, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            }
        }
    });
});

showRegisterBtn.addEventListener('click', showRegisterScreen);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function translateRegisterError(error) {
    if (error.isNetworkError) {
        return 'تعذر الاتصال بالخادم. حاول مرة أخرى.';
    }
    const raw = error.serverMessage || '';
    if (raw.indexOf('School code') !== -1) {
        return 'رمز المدرسة مستخدم بالفعل. اختر رمزًا آخر.';
    }
    if (raw.indexOf('Email is already in use') !== -1) {
        return 'البريد الإلكتروني مستخدم بالفعل.';
    }
    if (raw.indexOf('Invalid email') !== -1) {
        return 'صيغة البريد الإلكتروني غير صحيحة.';
    }
    if (raw.indexOf('Password must be at least') !== -1) {
        return 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
    }
    if (raw.indexOf('are all required') !== -1) {
        return 'يرجى تعبئة جميع الحقول المطلوبة.';
    }
    return 'تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.';
}

registerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(registerError);

    const schoolName = regSchoolNameInput.value.trim();
    const schoolCode = regSchoolCodeInput.value.trim();
    const userName = regUserNameInput.value.trim();
    const email = regEmailInput.value.trim();
    const password = regPasswordInput.value;
    const passwordConfirm = regPasswordConfirmInput.value;

    if (!schoolName || !schoolCode || !userName || !email || !password || !passwordConfirm) {
        showError(registerError, 'يرجى تعبئة جميع الحقول المطلوبة.');
        return;
    }
    if (password !== passwordConfirm) {
        showError(registerError, 'كلمتا المرور غير متطابقتين.');
        return;
    }
    if (password.length < 8) {
        showError(registerError, 'كلمة المرور يجب ألا تقل عن 8 أحرف.');
        return;
    }

    withLoading(registerSubmit, 'جاري إنشاء المدرسة...', async function () {
        try {
            await apiFetch('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    school: { name: schoolName, code: schoolCode },
                    user: { name: userName, email, password }
                })
            });
        } catch (error) {
            showError(registerError, translateRegisterError(error));
            return;
        }

        // Registration itself does not establish a session (existing Phase 2
        // backend behavior, unchanged here) -- immediately follow up with
        // the existing login endpoint using the same credentials so the
        // owner lands straight in the app shell without retyping anything.
        try {
            const loginData = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            registerForm.reset();
            showAppScreen(loginData.user);
        } catch (error) {
            registerForm.reset();
            showLoginScreen();
            showNotice(loginNotice, 'تم إنشاء المدرسة بنجاح. يرجى تسجيل الدخول.');
        }
    });
});

showLoginBtn.addEventListener('click', showLoginScreen);

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

logoutBtn.addEventListener('click', function () {
    withLoading(logoutBtn, 'جاري تسجيل الخروج...', async function () {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            // Even if this request fails (e.g. offline), the stale cookie
            // will simply fail server-side authentication on its next use,
            // so it's still safe to route back to the login screen.
        }
        showLoginScreen();
    });
});

// ---------------------------------------------------------------------------
// Students (protected, tenant-scoped entirely by the backend session --
// this frontend never reads, stores, or sends a school_id anywhere; every
// request below relies solely on the authenticated session cookie)
// ---------------------------------------------------------------------------

// Shared by every failure path below: a 401 always means the session is no
// longer valid server-side, regardless of which request triggered it.
function handleApiError(error, defaultMessage, errorEls) {
    if (error.status === 401) {
        showLoginScreen();
        showNotice(loginNotice, 'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.');
        return;
    }
    const message = error.isNetworkError ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : defaultMessage;
    (errorEls || []).forEach(function (el) {
        showError(el, message);
    });
}

function buildStudentListItem(student) {
    const item = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'student-name';
    name.textContent = student.name;
    item.appendChild(name);

    if (student.student_code) {
        const code = document.createElement('span');
        code.className = 'student-code';
        code.textContent = student.student_code;
        item.appendChild(code);
    }

    return item;
}

function getFilteredStudents() {
    const query = studentSearchInput.value.trim().toLowerCase();
    if (!query) return state.students;
    return state.students.filter(function (student) {
        const name = (student.name || '').toLowerCase();
        const code = (student.student_code || '').toLowerCase();
        return name.indexOf(query) !== -1 || code.indexOf(query) !== -1;
    });
}

function renderStudentsList() {
    studentsList.innerHTML = '';

    if (state.studentsLoadState !== 'loaded') {
        return;
    }

    const filtered = getFilteredStudents();

    if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'students-empty';
        empty.textContent = state.students.length === 0
            ? 'لا يوجد طلاب مسجلون بعد.'
            : 'لا توجد نتائج مطابقة للبحث.';
        studentsList.appendChild(empty);
        return;
    }

    filtered.forEach(function (student) {
        studentsList.appendChild(buildStudentListItem(student));
    });
}

function renderRecentStudents() {
    recentStudentsList.innerHTML = '';

    if (state.studentsLoadState !== 'loaded') {
        return;
    }

    if (state.students.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'students-empty';
        empty.textContent = 'لا يوجد طلاب حديثون.';
        recentStudentsList.appendChild(empty);
        return;
    }

    // Most recently created first.
    state.students.slice(-5).reverse().forEach(function (student) {
        recentStudentsList.appendChild(buildStudentListItem(student));
    });
}

function renderDashboardStats() {
    if (state.studentsLoadState === 'loaded') {
        statTotalStudents.textContent = String(state.students.length);
        statTotalStudents.classList.remove('stat-value-muted');
    } else if (state.studentsLoadState === 'error') {
        statTotalStudents.textContent = 'لا توجد بيانات كافية لعرض الإحصاءات بعد.';
        statTotalStudents.classList.add('stat-value-muted');
    } else {
        statTotalStudents.textContent = '—';
        statTotalStudents.classList.add('stat-value-muted');
    }
}

// Keeps the dashboard stat, the recent-students list, and the full
// students list all consistent with whatever state.students currently is.
function renderStudentDependentUI() {
    renderDashboardStats();
    renderRecentStudents();
    renderStudentsList();
}

// Fetches the authenticated school's students once and updates every view
// that depends on them (dashboard stat, recent students, students list).
// Called at login and after adding a student -- not on every navigation.
async function loadStudentsData() {
    state.studentsLoadState = 'loading';
    studentsLoading.hidden = false;
    clearError(dashboardError);
    clearError(studentsError);

    try {
        const data = await apiFetch('/api/students', { method: 'GET' });
        state.students = data.students || [];
        state.studentsLoadState = 'loaded';
    } catch (error) {
        state.studentsLoadState = 'error';
        handleApiError(error, 'تعذر تحميل بيانات الطلاب.', [dashboardError, studentsError]);
    } finally {
        studentsLoading.hidden = true;
        renderStudentDependentUI();
    }
}

studentSearchInput.addEventListener('input', renderStudentsList);

addStudentForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(studentsError);
    clearNotice(studentsMessage);

    const name = studentNameInput.value.trim();
    if (!name) {
        showError(studentsError, 'يرجى إدخال اسم الطالب.');
        return;
    }

    withLoading(addStudentSubmit, 'جاري إضافة الطالب...', async function () {
        try {
            await apiFetch('/api/students', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            studentNameInput.value = '';
            showNotice(studentsMessage, 'تمت إضافة الطالب بنجاح.');
            await loadStudentsData();
        } catch (error) {
            handleApiError(error, 'تعذر إضافة الطالب. حاول مرة أخرى.', [studentsError]);
        }
    });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

checkAuth();
