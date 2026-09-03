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
const infoSchool = document.getElementById('infoSchool');
const infoName = document.getElementById('infoName');
const infoEmail = document.getElementById('infoEmail');
const infoRole = document.getElementById('infoRole');

const addStudentForm = document.getElementById('addStudentForm');
const studentNameInput = document.getElementById('studentName');
const addStudentSubmit = document.getElementById('addStudentSubmit');
const studentsError = document.getElementById('studentsError');
const studentsMessage = document.getElementById('studentsMessage');
const studentsList = document.getElementById('studentsList');

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
    hideAllScreens();
    screens.app.hidden = false;
    renderUserInfo(user);
    loadStudents();
}

// ---------------------------------------------------------------------------
// Authentication state
// ---------------------------------------------------------------------------

// The backend session cookie is the only source of truth for authentication.
// This never assumes a logged-in state just because a cookie is present --
// it always asks the server via GET /api/auth/me.
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
    infoSchool.textContent = user.school_name || '';
    infoName.textContent = user.name || '';
    infoEmail.textContent = user.email || '';
    infoRole.textContent = translateRole(user.role);
}

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
// this frontend never sends a school_id anywhere)
// ---------------------------------------------------------------------------

function handleSessionError(error, errorEl) {
    if (error.status === 401) {
        showLoginScreen();
        showNotice(loginNotice, 'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.');
        return true;
    }
    if (error.isNetworkError) {
        showError(errorEl, 'تعذر الاتصال بالخادم. حاول مرة أخرى.');
        return true;
    }
    showError(errorEl, 'حدث خطأ غير متوقع. حاول مرة أخرى.');
    return true;
}

function renderStudents(students) {
    studentsList.innerHTML = '';

    if (!students || students.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'students-empty';
        empty.textContent = 'لا يوجد طلاب بعد.';
        studentsList.appendChild(empty);
        return;
    }

    students.forEach(function (student) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'student-name';
        name.textContent = student.name;
        item.appendChild(name);
        studentsList.appendChild(item);
    });
}

async function loadStudents() {
    clearError(studentsError);
    try {
        const data = await apiFetch('/api/students', { method: 'GET' });
        renderStudents(data.students);
    } catch (error) {
        handleSessionError(error, studentsError);
    }
}

addStudentForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(studentsError);
    clearNotice(studentsMessage);

    const name = studentNameInput.value.trim();
    if (!name) {
        showError(studentsError, 'يرجى إدخال اسم الطالب.');
        return;
    }

    withLoading(addStudentSubmit, 'جاري الإضافة...', async function () {
        try {
            await apiFetch('/api/students', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            studentNameInput.value = '';
            showNotice(studentsMessage, 'تمت إضافة الطالب بنجاح.');
            await loadStudents();
        } catch (error) {
            handleSessionError(error, studentsError);
        }
    });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

checkAuth();
