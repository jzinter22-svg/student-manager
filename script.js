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

const addTeacherBtn = document.getElementById('addTeacherBtn');
const teacherFormCard = document.getElementById('teacherFormCard');
const teacherFormTitle = document.getElementById('teacherFormTitle');
const teacherForm = document.getElementById('teacherForm');
const teacherNameInput = document.getElementById('teacherName');
const teacherPhoneInput = document.getElementById('teacherPhone');
const teacherSpecializationInput = document.getElementById('teacherSpecialization');
const teacherFormError = document.getElementById('teacherFormError');
const teacherFormSubmit = document.getElementById('teacherFormSubmit');
const teacherFormCancel = document.getElementById('teacherFormCancel');
const teacherSearchInput = document.getElementById('teacherSearch');
const teachersError = document.getElementById('teachersError');
const teachersMessage = document.getElementById('teachersMessage');
const teachersLoading = document.getElementById('teachersLoading');
const teachersList = document.getElementById('teachersList');

const addClassBtn = document.getElementById('addClassBtn');
const classFormCard = document.getElementById('classFormCard');
const classFormTitle = document.getElementById('classFormTitle');
const classForm = document.getElementById('classForm');
const classNameInput = document.getElementById('className');
const classGradeLevelInput = document.getElementById('classGradeLevel');
const classAcademicYearInput = document.getElementById('classAcademicYear');
const classFormError = document.getElementById('classFormError');
const classFormSubmit = document.getElementById('classFormSubmit');
const classFormCancel = document.getElementById('classFormCancel');
const classSearchInput = document.getElementById('classSearch');
const classesError = document.getElementById('classesError');
const classesMessage = document.getElementById('classesMessage');
const classesLoading = document.getElementById('classesLoading');
const classesList = document.getElementById('classesList');

const addSubjectBtn = document.getElementById('addSubjectBtn');
const subjectFormCard = document.getElementById('subjectFormCard');
const subjectFormTitle = document.getElementById('subjectFormTitle');
const subjectForm = document.getElementById('subjectForm');
const subjectNameInput = document.getElementById('subjectName');
const subjectCodeInput = document.getElementById('subjectCode');
const subjectTeacherField = document.getElementById('subjectTeacherField');
const subjectTeacherSelect = document.getElementById('subjectTeacher');
const subjectTeacherNote = document.getElementById('subjectTeacherNote');
const subjectFormError = document.getElementById('subjectFormError');
const subjectFormSubmit = document.getElementById('subjectFormSubmit');
const subjectFormCancel = document.getElementById('subjectFormCancel');
const subjectSearchInput = document.getElementById('subjectSearch');
const subjectsError = document.getElementById('subjectsError');
const subjectsMessage = document.getElementById('subjectsMessage');
const subjectsLoading = document.getElementById('subjectsLoading');
const subjectsList = document.getElementById('subjectsList');

const addEnrollmentBtn = document.getElementById('addEnrollmentBtn');
const enrollmentFormCard = document.getElementById('enrollmentFormCard');
const enrollmentForm = document.getElementById('enrollmentForm');
const enrollmentStudentSelect = document.getElementById('enrollmentStudent');
const enrollmentClassSelect = document.getElementById('enrollmentClass');
const currentEnrollmentWarning = document.getElementById('currentEnrollmentWarning');
const enrollmentFormError = document.getElementById('enrollmentFormError');
const enrollmentFormSubmit = document.getElementById('enrollmentFormSubmit');
const enrollmentFormCancel = document.getElementById('enrollmentFormCancel');

const transferFormCard = document.getElementById('transferFormCard');
const transferStudentLabel = document.getElementById('transferStudentLabel');
const transferCurrentClass = document.getElementById('transferCurrentClass');
const transferAcademicYear = document.getElementById('transferAcademicYear');
const transferForm = document.getElementById('transferForm');
const transferClassSelect = document.getElementById('transferClass');
const transferFormError = document.getElementById('transferFormError');
const transferFormSubmit = document.getElementById('transferFormSubmit');
const transferFormCancel = document.getElementById('transferFormCancel');

const enrollmentSearchInput = document.getElementById('enrollmentSearch');
const enrollmentYearFilterSelect = document.getElementById('enrollmentYearFilter');
const enrollmentsError = document.getElementById('enrollmentsError');
const enrollmentsMessage = document.getElementById('enrollmentsMessage');
const enrollmentsLoading = document.getElementById('enrollmentsLoading');
const enrollmentsList = document.getElementById('enrollmentsList');

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
    studentsLoadState: 'idle', // 'idle' | 'loading' | 'loaded' | 'error'
    teachers: [],
    teachersLoadState: 'idle',
    editingTeacherId: null, // null while adding; a teacher id while editing
    classes: [],
    classesLoadState: 'idle',
    editingClassId: null,
    subjects: [],
    subjectsLoadState: 'idle',
    editingSubjectId: null,
    enrollments: [],
    enrollmentsLoadState: 'idle',
    transferringEnrollmentId: null
};

const NAV_SECTIONS = {
    dashboard: { view: 'view-dashboard', functional: true },
    students: { view: 'view-students', functional: true },
    teachers: { view: 'view-teachers', functional: true },
    classes: { view: 'view-classes', functional: true },
    enrollments: { view: 'view-enrollments', functional: true },
    subjects: { view: 'view-subjects', functional: true },
    attendance: { view: 'view-placeholder', functional: false, label: 'الحضور' },
    grades: { view: 'view-placeholder', functional: false, label: 'الدرجات' }
};

// Only owner/admin may create, update, or delete teachers (enforced by the
// backend via requireRole -- this only controls whether the UI even shows
// the add/edit/delete controls, it is not the actual authorization).
function canManageTeachers() {
    return Boolean(state.user) && (state.user.role === 'owner' || state.user.role === 'admin');
}

// Classes use the identical owner/admin-only rule as teachers.
function canManageClasses() {
    return canManageTeachers();
}

// Subjects differ from Teachers/Classes: a teacher-role user can create
// their own subjects (staff still cannot create anything at all).
function canCreateSubjects() {
    return Boolean(state.user) && ['owner', 'admin', 'teacher'].includes(state.user.role);
}

// Per-subject ownership check: owner/admin manage any subject in their
// school; a teacher may only manage a subject that is actually theirs
// (compared against the teacher_id the server itself resolved and
// attached to /api/auth/me's response -- never a value this page invents).
function canManageSubject(subject) {
    if (!state.user) return false;
    if (state.user.role === 'owner' || state.user.role === 'admin') return true;
    if (state.user.role === 'teacher') {
        return state.user.teacher_id != null && subject.teacher_id === state.user.teacher_id;
    }
    return false;
}

function isTeacherRole() {
    return Boolean(state.user) && state.user.role === 'teacher';
}

// Enrollments use the identical owner/admin-only rule as Teachers/Classes
// (no per-item ownership nuance -- unlike Subjects, an enrollment has no
// concept of "belonging" to a teacher).
function canManageEnrollments() {
    return canManageTeachers();
}

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
    state.teachers = [];
    state.teachersLoadState = 'idle';
    state.classes = [];
    state.classesLoadState = 'idle';
    state.subjects = [];
    state.subjectsLoadState = 'idle';
    state.enrollments = [];
    state.enrollmentsLoadState = 'idle';
    hideAllScreens();
    screens.app.hidden = false;
    renderUserInfo(user);
    navigateTo('dashboard');
    renderStudentDependentUI();
    closeTeacherForm();
    renderTeachersList();
    closeClassForm();
    renderClassesList();
    closeSubjectForm();
    renderSubjectsList();
    closeEnrollmentForm();
    closeTransferForm();
    renderEnrollmentsList();
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
    if (section === 'teachers' && state.teachersLoadState === 'idle') {
        loadTeachersData();
    }
    if (section === 'classes' && state.classesLoadState === 'idle') {
        loadClassesData();
    }
    if (section === 'subjects' && state.subjectsLoadState === 'idle') {
        loadSubjectsData();
    }
    if (section === 'enrollments' && state.enrollmentsLoadState === 'idle') {
        loadEnrollmentsData();
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
// Teachers (protected; create/update/delete additionally require
// owner/admin server-side via requireRole -- this frontend never reads,
// stores, or sends a school_id anywhere here either)
// ---------------------------------------------------------------------------

function openTeacherForm(teacher) {
    state.editingTeacherId = teacher ? teacher.id : null;
    teacherFormTitle.textContent = teacher ? 'تعديل معلم' : 'إضافة معلم';
    teacherFormSubmit.textContent = teacher ? 'حفظ التعديلات' : 'حفظ';
    teacherNameInput.value = teacher ? teacher.name : '';
    teacherPhoneInput.value = teacher ? teacher.phone : '';
    teacherSpecializationInput.value = teacher ? teacher.specialization : '';
    clearError(teacherFormError);
    teacherFormCard.hidden = false;
    teacherNameInput.focus();
}

function closeTeacherForm() {
    state.editingTeacherId = null;
    teacherForm.reset();
    clearError(teacherFormError);
    teacherFormCard.hidden = true;
}

addTeacherBtn.addEventListener('click', function () {
    openTeacherForm(null);
});

teacherFormCancel.addEventListener('click', closeTeacherForm);

function getFilteredTeachers() {
    const query = teacherSearchInput.value.trim().toLowerCase();
    if (!query) return state.teachers;
    return state.teachers.filter(function (teacher) {
        const name = (teacher.name || '').toLowerCase();
        const phone = (teacher.phone || '').toLowerCase();
        const specialization = (teacher.specialization || '').toLowerCase();
        return name.indexOf(query) !== -1 || phone.indexOf(query) !== -1 || specialization.indexOf(query) !== -1;
    });
}

function deleteTeacher(teacher) {
    const confirmed = window.confirm('هل أنت متأكد من حذف المعلم "' + teacher.name + '"؟');
    if (!confirmed) return;

    clearError(teachersError);
    clearNotice(teachersMessage);

    apiFetch('/api/teachers/' + teacher.id, { method: 'DELETE' })
        .then(function () {
            showNotice(teachersMessage, 'تم حذف المعلم بنجاح.');
            return loadTeachersData();
        })
        .catch(function (error) {
            handleApiError(error, 'تعذر حذف المعلم. حاول مرة أخرى.', [teachersError]);
        });
}

function buildTeacherListItem(teacher) {
    const item = document.createElement('li');
    item.className = 'teacher-item';

    const info = document.createElement('div');
    info.className = 'teacher-info';

    const name = document.createElement('span');
    name.className = 'teacher-name';
    name.textContent = teacher.name;
    info.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'teacher-meta';
    meta.textContent = teacher.phone + ' · ' + teacher.specialization;
    info.appendChild(meta);

    item.appendChild(info);

    if (canManageTeachers()) {
        const actions = document.createElement('div');
        actions.className = 'teacher-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary btn-small';
        editBtn.textContent = 'تعديل';
        editBtn.addEventListener('click', function () {
            openTeacherForm(teacher);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'حذف';
        deleteBtn.addEventListener('click', function () {
            deleteTeacher(teacher);
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
    }

    return item;
}

function renderTeachersList() {
    addTeacherBtn.hidden = !canManageTeachers();
    teachersList.innerHTML = '';

    if (state.teachersLoadState !== 'loaded') {
        return;
    }

    const filtered = getFilteredTeachers();

    if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'teachers-empty';
        empty.textContent = state.teachers.length === 0
            ? 'لا يوجد معلمون مسجلون بعد.'
            : 'لا توجد نتائج مطابقة للبحث.';
        teachersList.appendChild(empty);
        return;
    }

    filtered.forEach(function (teacher) {
        teachersList.appendChild(buildTeacherListItem(teacher));
    });
}

async function loadTeachersData() {
    state.teachersLoadState = 'loading';
    teachersLoading.hidden = false;
    clearError(teachersError);

    try {
        const data = await apiFetch('/api/teachers', { method: 'GET' });
        state.teachers = data.teachers || [];
        state.teachersLoadState = 'loaded';
    } catch (error) {
        state.teachersLoadState = 'error';
        handleApiError(error, 'تعذر تحميل بيانات المعلمين.', [teachersError]);
    } finally {
        teachersLoading.hidden = true;
        renderTeachersList();
    }
}

teacherSearchInput.addEventListener('input', renderTeachersList);

teacherForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(teacherFormError);

    const name = teacherNameInput.value.trim();
    const phone = teacherPhoneInput.value.trim();
    const specialization = teacherSpecializationInput.value.trim();

    if (!name || !phone || !specialization) {
        showError(teacherFormError, 'يرجى تعبئة جميع الحقول المطلوبة: اسم المعلم ورقم الهاتف والتخصص.');
        return;
    }

    const isEditing = state.editingTeacherId !== null;
    const url = isEditing ? '/api/teachers/' + state.editingTeacherId : '/api/teachers';
    const method = isEditing ? 'PATCH' : 'POST';

    withLoading(
        teacherFormSubmit,
        isEditing ? 'جاري حفظ التعديلات...' : 'جاري إضافة المعلم...',
        async function () {
            try {
                await apiFetch(url, {
                    method: method,
                    body: JSON.stringify({ name, phone, specialization })
                });
                clearError(teachersError);
                showNotice(teachersMessage, isEditing ? 'تم تحديث بيانات المعلم بنجاح.' : 'تمت إضافة المعلم بنجاح.');
                closeTeacherForm();
                await loadTeachersData();
            } catch (error) {
                handleApiError(
                    error,
                    isEditing ? 'تعذر حفظ التعديلات. حاول مرة أخرى.' : 'تعذر إضافة المعلم. حاول مرة أخرى.',
                    [teacherFormError]
                );
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Classes (protected; create/update/delete additionally require
// owner/admin server-side via requireRole -- this frontend never reads,
// stores, or sends a school_id anywhere here either)
// ---------------------------------------------------------------------------

function openClassForm(classItem) {
    state.editingClassId = classItem ? classItem.id : null;
    classFormTitle.textContent = classItem ? 'تعديل الصف' : 'إضافة صف';
    classFormSubmit.textContent = classItem ? 'حفظ التعديلات' : 'حفظ';
    classNameInput.value = classItem ? classItem.name : '';
    classGradeLevelInput.value = classItem ? classItem.grade_level : '';
    classAcademicYearInput.value = classItem ? classItem.academic_year : '';
    clearError(classFormError);
    classFormCard.hidden = false;
    classNameInput.focus();
}

function closeClassForm() {
    state.editingClassId = null;
    classForm.reset();
    clearError(classFormError);
    classFormCard.hidden = true;
}

addClassBtn.addEventListener('click', function () {
    openClassForm(null);
});

classFormCancel.addEventListener('click', closeClassForm);

function getFilteredClasses() {
    const query = classSearchInput.value.trim().toLowerCase();
    if (!query) return state.classes;
    return state.classes.filter(function (classItem) {
        const name = (classItem.name || '').toLowerCase();
        const gradeLevel = (classItem.grade_level || '').toLowerCase();
        const academicYear = (classItem.academic_year || '').toLowerCase();
        return name.indexOf(query) !== -1 || gradeLevel.indexOf(query) !== -1 || academicYear.indexOf(query) !== -1;
    });
}

function deleteClass(classItem) {
    const confirmed = window.confirm('هل أنت متأكد من حذف الصف "' + classItem.name + '"؟');
    if (!confirmed) return;

    clearError(classesError);
    clearNotice(classesMessage);

    apiFetch('/api/classes/' + classItem.id, { method: 'DELETE' })
        .then(function () {
            showNotice(classesMessage, 'تم حذف الصف بنجاح.');
            return loadClassesData();
        })
        .catch(function (error) {
            handleApiError(error, 'تعذر حذف الصف. حاول مرة أخرى.', [classesError]);
        });
}

// Reuses the .teacher-item/.teacher-info/.teacher-actions layout classes --
// same visual shape (a name, a secondary meta line, edit/delete actions).
function buildClassListItem(classItem) {
    const item = document.createElement('li');
    item.className = 'teacher-item';

    const info = document.createElement('div');
    info.className = 'teacher-info';

    const name = document.createElement('span');
    name.className = 'teacher-name';
    name.textContent = classItem.name;
    info.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'teacher-meta';
    meta.textContent = classItem.grade_level + ' · ' + classItem.academic_year;
    info.appendChild(meta);

    item.appendChild(info);

    if (canManageClasses()) {
        const actions = document.createElement('div');
        actions.className = 'teacher-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary btn-small';
        editBtn.textContent = 'تعديل';
        editBtn.addEventListener('click', function () {
            openClassForm(classItem);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'حذف';
        deleteBtn.addEventListener('click', function () {
            deleteClass(classItem);
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
    }

    return item;
}

function renderClassesList() {
    addClassBtn.hidden = !canManageClasses();
    classesList.innerHTML = '';

    if (state.classesLoadState !== 'loaded') {
        return;
    }

    const filtered = getFilteredClasses();

    if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'teachers-empty';
        empty.textContent = state.classes.length === 0
            ? 'لا توجد صفوف دراسية حتى الآن.'
            : 'لا توجد نتائج مطابقة للبحث.';
        classesList.appendChild(empty);
        return;
    }

    filtered.forEach(function (classItem) {
        classesList.appendChild(buildClassListItem(classItem));
    });
}

async function loadClassesData() {
    state.classesLoadState = 'loading';
    classesLoading.hidden = false;
    clearError(classesError);

    try {
        const data = await apiFetch('/api/classes', { method: 'GET' });
        state.classes = data.classes || [];
        state.classesLoadState = 'loaded';
    } catch (error) {
        state.classesLoadState = 'error';
        handleApiError(error, 'تعذر تحميل بيانات الصفوف.', [classesError]);
    } finally {
        classesLoading.hidden = true;
        renderClassesList();
    }
}

classSearchInput.addEventListener('input', renderClassesList);

classForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(classFormError);

    const name = classNameInput.value.trim();
    const gradeLevel = classGradeLevelInput.value.trim();
    const academicYear = classAcademicYearInput.value.trim();

    if (!name || !gradeLevel || !academicYear) {
        showError(classFormError, 'يرجى تعبئة جميع الحقول المطلوبة: اسم الصف والمرحلة والسنة الدراسية.');
        return;
    }

    const isEditing = state.editingClassId !== null;
    const url = isEditing ? '/api/classes/' + state.editingClassId : '/api/classes';
    const method = isEditing ? 'PATCH' : 'POST';

    withLoading(
        classFormSubmit,
        isEditing ? 'جاري حفظ التعديلات...' : 'جاري إضافة الصف...',
        async function () {
            try {
                await apiFetch(url, {
                    method: method,
                    body: JSON.stringify({ name, grade_level: gradeLevel, academic_year: academicYear })
                });
                clearError(classesError);
                showNotice(classesMessage, isEditing ? 'تم تحديث بيانات الصف بنجاح.' : 'تمت إضافة الصف بنجاح.');
                closeClassForm();
                await loadClassesData();
            } catch (error) {
                handleApiError(
                    error,
                    isEditing ? 'تعذر حفظ التعديلات. حاول مرة أخرى.' : 'تعذر إضافة الصف. حاول مرة أخرى.',
                    [classFormError]
                );
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Subjects (protected; a subject always belongs to exactly one teacher.
// owner/admin choose that teacher from a dynamically loaded list -- never
// hardcoded -- and may reassign it; a teacher-role user can never see or
// set teacher_id at all, since the server always resolves it from their
// own session. This frontend never reads, stores, or sends a school_id
// anywhere here either.)
// ---------------------------------------------------------------------------

function populateSubjectTeacherSelect(selectedTeacherId) {
    subjectTeacherSelect.innerHTML = '<option value="">اختر المعلم...</option>';
    state.teachers.forEach(function (teacher) {
        const option = document.createElement('option');
        option.value = String(teacher.id);
        option.textContent = teacher.name;
        subjectTeacherSelect.appendChild(option);
    });
    subjectTeacherSelect.value = selectedTeacherId != null ? String(selectedTeacherId) : '';
}

function openSubjectForm(subject) {
    state.editingSubjectId = subject ? subject.id : null;
    subjectFormTitle.textContent = subject ? 'تعديل المادة' : 'إضافة مادة';
    subjectFormSubmit.textContent = subject ? 'حفظ التعديلات' : 'حفظ';
    subjectNameInput.value = subject ? subject.name : '';
    subjectCodeInput.value = subject ? (subject.code || '') : '';
    clearError(subjectFormError);

    if (isTeacherRole()) {
        // A teacher never picks the teacher -- the server always assigns
        // the subject to their own linked record.
        subjectTeacherField.hidden = true;
        subjectTeacherNote.hidden = false;
    } else {
        subjectTeacherField.hidden = false;
        subjectTeacherNote.hidden = true;
        const selectedTeacherId = subject ? subject.teacher_id : null;
        if (state.teachersLoadState === 'loaded') {
            populateSubjectTeacherSelect(selectedTeacherId);
        } else {
            subjectTeacherSelect.innerHTML = '<option value="">جاري تحميل قائمة المعلمين...</option>';
            loadTeachersData().then(function () {
                populateSubjectTeacherSelect(selectedTeacherId);
            });
        }
    }

    subjectFormCard.hidden = false;
    subjectNameInput.focus();
}

function closeSubjectForm() {
    state.editingSubjectId = null;
    subjectForm.reset();
    clearError(subjectFormError);
    subjectFormCard.hidden = true;
}

addSubjectBtn.addEventListener('click', function () {
    openSubjectForm(null);
});

subjectFormCancel.addEventListener('click', closeSubjectForm);

function getFilteredSubjects() {
    const query = subjectSearchInput.value.trim().toLowerCase();
    if (!query) return state.subjects;
    return state.subjects.filter(function (subject) {
        const name = (subject.name || '').toLowerCase();
        const code = (subject.code || '').toLowerCase();
        const teacherName = (subject.teacher_name || '').toLowerCase();
        return name.indexOf(query) !== -1 || code.indexOf(query) !== -1 || teacherName.indexOf(query) !== -1;
    });
}

function deleteSubject(subject) {
    const confirmed = window.confirm('هل أنت متأكد من حذف المادة "' + subject.name + '"؟');
    if (!confirmed) return;

    clearError(subjectsError);
    clearNotice(subjectsMessage);

    apiFetch('/api/subjects/' + subject.id, { method: 'DELETE' })
        .then(function () {
            showNotice(subjectsMessage, 'تم حذف المادة بنجاح.');
            return loadSubjectsData();
        })
        .catch(function (error) {
            handleApiError(error, 'تعذر حذف المادة. حاول مرة أخرى.', [subjectsError]);
        });
}

// Reuses the .teacher-item/.teacher-info/.teacher-actions layout classes,
// same as Classes -- identical visual shape (name, a secondary meta line,
// edit/delete actions).
function buildSubjectListItem(subject) {
    const item = document.createElement('li');
    item.className = 'teacher-item';

    const info = document.createElement('div');
    info.className = 'teacher-info';

    const name = document.createElement('span');
    name.className = 'teacher-name';
    name.textContent = subject.name;
    info.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'teacher-meta';
    meta.textContent = (subject.code ? subject.code + ' · ' : '') + subject.teacher_name;
    info.appendChild(meta);

    item.appendChild(info);

    if (canManageSubject(subject)) {
        const actions = document.createElement('div');
        actions.className = 'teacher-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary btn-small';
        editBtn.textContent = 'تعديل';
        editBtn.addEventListener('click', function () {
            openSubjectForm(subject);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'حذف';
        deleteBtn.addEventListener('click', function () {
            deleteSubject(subject);
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
    }

    return item;
}

function renderSubjectsList() {
    addSubjectBtn.hidden = !canCreateSubjects();
    subjectsList.innerHTML = '';

    if (state.subjectsLoadState !== 'loaded') {
        return;
    }

    const filtered = getFilteredSubjects();

    if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'teachers-empty';
        empty.textContent = state.subjects.length === 0
            ? 'لا توجد مواد دراسية حتى الآن.'
            : 'لا توجد نتائج مطابقة للبحث.';
        subjectsList.appendChild(empty);
        return;
    }

    filtered.forEach(function (subject) {
        subjectsList.appendChild(buildSubjectListItem(subject));
    });
}

async function loadSubjectsData() {
    state.subjectsLoadState = 'loading';
    subjectsLoading.hidden = false;
    clearError(subjectsError);

    try {
        const data = await apiFetch('/api/subjects', { method: 'GET' });
        state.subjects = data.subjects || [];
        state.subjectsLoadState = 'loaded';
    } catch (error) {
        state.subjectsLoadState = 'error';
        handleApiError(error, 'تعذر تحميل بيانات المواد.', [subjectsError]);
    } finally {
        subjectsLoading.hidden = true;
        renderSubjectsList();
    }
}

subjectSearchInput.addEventListener('input', renderSubjectsList);

// Maps the backend's (English) error strings to specific Arabic messages
// where a more precise one is worth showing; falls back to defaultMessage
// otherwise -- mirrors the same pattern used for registration errors.
function translateSubjectError(error, defaultMessage) {
    const raw = error.serverMessage || '';
    if (raw.indexOf('already in use') !== -1) {
        return 'اسم المادة مستخدم بالفعل في هذه المدرسة.';
    }
    if (raw.indexOf('No teacher record is linked') !== -1) {
        return 'لا يوجد سجل معلم مرتبط بحسابك. يرجى التواصل مع إدارة المدرسة.';
    }
    if (raw.indexOf('teacher_id is required') !== -1 || raw.indexOf('Teacher not found') !== -1) {
        return 'يرجى اختيار معلم صالح من نفس المدرسة.';
    }
    return defaultMessage;
}

subjectForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(subjectFormError);

    const name = subjectNameInput.value.trim();
    const code = subjectCodeInput.value.trim();

    if (!name) {
        showError(subjectFormError, 'يرجى إدخال اسم المادة.');
        return;
    }

    const payload = { name, code };
    if (!isTeacherRole()) {
        const teacherId = subjectTeacherSelect.value;
        if (!teacherId) {
            showError(subjectFormError, 'يرجى اختيار المعلم المسؤول عن هذه المادة.');
            return;
        }
        payload.teacher_id = Number(teacherId);
    }

    const isEditing = state.editingSubjectId !== null;
    const url = isEditing ? '/api/subjects/' + state.editingSubjectId : '/api/subjects';
    const method = isEditing ? 'PATCH' : 'POST';

    withLoading(
        subjectFormSubmit,
        isEditing ? 'جاري حفظ التعديلات...' : 'جاري إضافة المادة...',
        async function () {
            try {
                await apiFetch(url, {
                    method: method,
                    body: JSON.stringify(payload)
                });
                clearError(subjectsError);
                showNotice(subjectsMessage, isEditing ? 'تم تحديث بيانات المادة بنجاح.' : 'تمت إضافة المادة بنجاح.');
                closeSubjectForm();
                await loadSubjectsData();
            } catch (error) {
                const defaultMessage = isEditing ? 'تعذر حفظ التعديلات. حاول مرة أخرى.' : 'تعذر إضافة المادة. حاول مرة أخرى.';
                handleApiError(error, translateSubjectError(error, defaultMessage), [subjectFormError]);
            }
        }
    );
});

// ---------------------------------------------------------------------------
// Enrollments (protected; create/transfer/end are owner/admin only, view
// is available to every role including teacher/staff. Reuses the
// already-loaded state.students/state.classes for the form dropdowns --
// no new fetches beyond what Students/Classes already load; this
// frontend never reads, stores, or sends a school_id anywhere here
// either, and academic_year always comes from the class the server
// looked up, never something this page invents.)
// ---------------------------------------------------------------------------

function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return day + '/' + month + '/' + date.getFullYear();
}

function findCurrentEnrollmentForStudent(studentId) {
    return state.enrollments.find(function (e) {
        return e.student_id === studentId && e.is_current;
    }) || null;
}

function getEnrollmentAcademicYears() {
    const years = new Set();
    state.enrollments.forEach(function (e) {
        if (e.academic_year) years.add(e.academic_year);
    });
    return Array.from(years).sort().reverse();
}

function populateEnrollmentYearFilter() {
    const previousValue = enrollmentYearFilterSelect.value;
    const years = getEnrollmentAcademicYears();
    enrollmentYearFilterSelect.innerHTML = '<option value="">كل السنوات</option>';
    years.forEach(function (year) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        enrollmentYearFilterSelect.appendChild(option);
    });
    if (years.indexOf(previousValue) !== -1) {
        enrollmentYearFilterSelect.value = previousValue;
    }
}

function populateClassSelect(selectEl, excludeClassId, placeholderText) {
    selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = placeholderText || 'اختر الصف...';
    selectEl.appendChild(placeholder);
    state.classes.forEach(function (classItem) {
        if (excludeClassId && classItem.id === excludeClassId) return;
        const option = document.createElement('option');
        option.value = String(classItem.id);
        option.textContent = classItem.name + ' · ' + classItem.grade_level + ' · ' + classItem.academic_year;
        selectEl.appendChild(option);
    });
}

// Real students/classes only -- both are already-loaded application data
// from the existing Students/Classes modules, never a hardcoded list.
function ensureEnrollmentFormData() {
    const tasks = [];
    if (state.studentsLoadState !== 'loaded') tasks.push(loadStudentsData());
    if (state.classesLoadState !== 'loaded') tasks.push(loadClassesData());
    return Promise.all(tasks);
}

function renderCurrentEnrollmentWarning(studentId) {
    currentEnrollmentWarning.innerHTML = '';
    currentEnrollmentWarning.hidden = true;

    const current = findCurrentEnrollmentForStudent(studentId);
    if (!current) return;

    currentEnrollmentWarning.hidden = false;
    const text = document.createElement('p');
    text.textContent = 'هذا الطالب مسجل حاليًا في الصف "' + current.class_name + '" (' + current.academic_year +
        '). استخدم خيار نقل الطالب بدلًا من تسجيله مرة أخرى.';
    currentEnrollmentWarning.appendChild(text);

    const goToTransferBtn = document.createElement('button');
    goToTransferBtn.type = 'button';
    goToTransferBtn.className = 'btn btn-secondary btn-small';
    goToTransferBtn.textContent = 'الانتقال إلى نقل الطالب';
    goToTransferBtn.addEventListener('click', function () {
        closeEnrollmentForm();
        openTransferForm(current);
    });
    currentEnrollmentWarning.appendChild(goToTransferBtn);
}

enrollmentStudentSelect.addEventListener('change', function () {
    const studentId = Number(enrollmentStudentSelect.value) || null;
    if (!studentId) {
        currentEnrollmentWarning.hidden = true;
        currentEnrollmentWarning.innerHTML = '';
        return;
    }
    renderCurrentEnrollmentWarning(studentId);
});

function openEnrollmentForm() {
    clearError(enrollmentFormError);
    enrollmentForm.reset();
    currentEnrollmentWarning.hidden = true;
    currentEnrollmentWarning.innerHTML = '';
    enrollmentFormCard.hidden = false;

    enrollmentStudentSelect.innerHTML = '<option value="">جاري التحميل...</option>';
    enrollmentClassSelect.innerHTML = '<option value="">جاري التحميل...</option>';
    ensureEnrollmentFormData().then(function () {
        enrollmentStudentSelect.innerHTML = '<option value="">اختر الطالب...</option>';
        state.students.forEach(function (student) {
            const option = document.createElement('option');
            option.value = String(student.id);
            option.textContent = student.name + (student.student_code ? ' (' + student.student_code + ')' : '');
            enrollmentStudentSelect.appendChild(option);
        });
        populateClassSelect(enrollmentClassSelect, null, 'اختر الصف...');
    });
}

function closeEnrollmentForm() {
    enrollmentForm.reset();
    clearError(enrollmentFormError);
    currentEnrollmentWarning.hidden = true;
    currentEnrollmentWarning.innerHTML = '';
    enrollmentFormCard.hidden = true;
}

addEnrollmentBtn.addEventListener('click', openEnrollmentForm);
enrollmentFormCancel.addEventListener('click', closeEnrollmentForm);

// Maps the backend's (English) error strings to the specific Arabic
// messages this phase calls for, falling back to defaultMessage
// otherwise -- same pattern used for registration/subject errors.
function translateEnrollmentError(error, defaultMessage) {
    const raw = error.serverMessage || '';
    if (raw.indexOf('already has an active enrollment') !== -1) {
        return 'الطالب مسجل بالفعل في صف آخر في هذه السنة الدراسية. استخدم خيار "نقل الطالب" بدلًا من تسجيله مرة أخرى.';
    }
    if (raw.indexOf('Cannot transfer to the same class') !== -1) {
        return 'لا يمكن نقل الطالب إلى نفس الصف الحالي.';
    }
    if (raw.indexOf('different academic year') !== -1) {
        return 'لا يمكن نقل الطالب إلى صف من سنة دراسية مختلفة.';
    }
    if (raw.indexOf('already ended') !== -1) {
        return 'تم إنهاء هذا التسجيل بالفعل.';
    }
    if (raw.indexOf('Student not found') !== -1 || raw.indexOf('Class not found') !== -1) {
        return 'يرجى اختيار طالب وصف صالحين من نفس المدرسة.';
    }
    return defaultMessage;
}

enrollmentForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(enrollmentFormError);

    const studentId = Number(enrollmentStudentSelect.value) || null;
    const classId = Number(enrollmentClassSelect.value) || null;

    if (!studentId) {
        showError(enrollmentFormError, 'يرجى اختيار الطالب.');
        return;
    }
    if (!classId) {
        showError(enrollmentFormError, 'يرجى اختيار الصف.');
        return;
    }

    withLoading(enrollmentFormSubmit, 'جاري تسجيل الطالب...', async function () {
        try {
            await apiFetch('/api/enrollments', {
                method: 'POST',
                body: JSON.stringify({ student_id: studentId, class_id: classId })
            });
            clearError(enrollmentsError);
            showNotice(enrollmentsMessage, 'تم تسجيل الطالب بنجاح.');
            closeEnrollmentForm();
            await loadEnrollmentsData();
        } catch (error) {
            handleApiError(error, translateEnrollmentError(error, 'تعذر تسجيل الطالب. حاول مرة أخرى.'), [enrollmentFormError]);
        }
    });
});

// ---- Transfer ----

function openTransferForm(enrollment) {
    state.transferringEnrollmentId = enrollment.id;
    clearError(transferFormError);
    transferForm.reset();
    transferStudentLabel.textContent = enrollment.student_name +
        (enrollment.student_code ? ' (' + enrollment.student_code + ')' : '');
    transferCurrentClass.textContent = enrollment.class_name + ' · ' + enrollment.grade_level;
    transferAcademicYear.textContent = enrollment.academic_year;
    transferFormCard.hidden = false;

    transferClassSelect.innerHTML = '<option value="">جاري التحميل...</option>';
    const populate = function () {
        populateClassSelect(transferClassSelect, enrollment.class_id, 'اختر الصف الجديد...');
    };
    if (state.classesLoadState === 'loaded') {
        populate();
    } else {
        loadClassesData().then(populate);
    }
}

function closeTransferForm() {
    state.transferringEnrollmentId = null;
    transferForm.reset();
    clearError(transferFormError);
    transferFormCard.hidden = true;
}

transferFormCancel.addEventListener('click', closeTransferForm);

transferForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(transferFormError);

    const newClassId = Number(transferClassSelect.value) || null;
    if (!newClassId) {
        showError(transferFormError, 'يرجى اختيار الصف الجديد.');
        return;
    }
    if (!window.confirm('هل أنت متأكد من نقل الطالب إلى الصف الجديد؟')) {
        return;
    }

    const enrollmentId = state.transferringEnrollmentId;
    withLoading(transferFormSubmit, 'جاري تنفيذ النقل...', async function () {
        try {
            await apiFetch('/api/enrollments/' + enrollmentId + '/transfer', {
                method: 'POST',
                body: JSON.stringify({ class_id: newClassId })
            });
            clearError(enrollmentsError);
            showNotice(enrollmentsMessage, 'تم نقل الطالب بنجاح.');
            closeTransferForm();
            await loadEnrollmentsData();
        } catch (error) {
            handleApiError(error, translateEnrollmentError(error, 'تعذر نقل الطالب. حاول مرة أخرى.'), [transferFormError]);
        }
    });
});

// ---- End enrollment ----

function endEnrollment(enrollment) {
    if (!window.confirm('هل أنت متأكد من إنهاء تسجيل "' + enrollment.student_name + '" في الصف الحالي؟')) {
        return;
    }

    clearError(enrollmentsError);
    clearNotice(enrollmentsMessage);

    apiFetch('/api/enrollments/' + enrollment.id + '/end', { method: 'POST' })
        .then(function () {
            showNotice(enrollmentsMessage, 'تم إنهاء التسجيل بنجاح.');
            return loadEnrollmentsData();
        })
        .catch(function (error) {
            handleApiError(error, translateEnrollmentError(error, 'تعذر إنهاء التسجيل. حاول مرة أخرى.'), [enrollmentsError]);
        });
}

// ---- List, search, filter ----

function getFilteredEnrollments() {
    const query = enrollmentSearchInput.value.trim().toLowerCase();
    const yearFilter = enrollmentYearFilterSelect.value;
    return state.enrollments.filter(function (enrollment) {
        if (yearFilter && enrollment.academic_year !== yearFilter) return false;
        if (!query) return true;
        return [
            enrollment.student_name,
            enrollment.student_code,
            enrollment.class_name,
            enrollment.grade_level,
            enrollment.academic_year
        ].some(function (value) {
            return (value || '').toLowerCase().indexOf(query) !== -1;
        });
    });
}

function buildEnrollmentListItem(enrollment) {
    const item = document.createElement('li');
    item.className = 'teacher-item';

    const info = document.createElement('div');
    info.className = 'teacher-info';

    const nameLine = document.createElement('span');
    nameLine.className = 'teacher-name';
    nameLine.appendChild(document.createTextNode(enrollment.student_name + ' '));
    if (enrollment.student_code) {
        const codeBadge = document.createElement('span');
        codeBadge.className = 'code-badge';
        codeBadge.textContent = enrollment.student_code;
        nameLine.appendChild(codeBadge);
    }
    info.appendChild(nameLine);

    const classLine = document.createElement('span');
    classLine.className = 'teacher-meta';
    classLine.textContent = enrollment.class_name + ' · ' + enrollment.grade_level + ' · ' + enrollment.academic_year;
    info.appendChild(classLine);

    const dateLine = document.createElement('span');
    dateLine.className = 'teacher-meta';
    const rangeText = 'من ' + formatDate(enrollment.started_at) +
        (enrollment.ended_at ? ' إلى ' + formatDate(enrollment.ended_at) : '') + ' — ';
    dateLine.appendChild(document.createTextNode(rangeText));
    const statusBadge = document.createElement('span');
    statusBadge.className = 'status-badge ' + (enrollment.is_current ? 'status-current' : 'status-ended');
    statusBadge.textContent = enrollment.is_current ? 'حالي' : 'منتهي';
    dateLine.appendChild(statusBadge);
    info.appendChild(dateLine);

    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'teacher-actions';

    // Reuses the existing search box as the "student history" view: this
    // fills it with the student's name so the already-visible list
    // (current + historical rows, newest first) filters down to just
    // theirs -- no separate history UI needed.
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'btn btn-secondary btn-small';
    historyBtn.textContent = 'عرض سجل الطالب';
    historyBtn.addEventListener('click', function () {
        enrollmentSearchInput.value = enrollment.student_name;
        renderEnrollmentsList();
    });
    actions.appendChild(historyBtn);

    if (enrollment.is_current && canManageEnrollments()) {
        const transferBtn = document.createElement('button');
        transferBtn.type = 'button';
        transferBtn.className = 'btn btn-secondary btn-small';
        transferBtn.textContent = 'نقل الطالب';
        transferBtn.addEventListener('click', function () {
            openTransferForm(enrollment);
        });
        actions.appendChild(transferBtn);

        const endBtn = document.createElement('button');
        endBtn.type = 'button';
        endBtn.className = 'btn btn-danger btn-small';
        endBtn.textContent = 'إنهاء التسجيل';
        endBtn.addEventListener('click', function () {
            endEnrollment(enrollment);
        });
        actions.appendChild(endBtn);
    }

    item.appendChild(actions);
    return item;
}

function renderEnrollmentsList() {
    addEnrollmentBtn.hidden = !canManageEnrollments();
    populateEnrollmentYearFilter();
    enrollmentsList.innerHTML = '';

    if (state.enrollmentsLoadState !== 'loaded') {
        return;
    }

    const filtered = getFilteredEnrollments();

    if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'teachers-empty';
        empty.textContent = state.enrollments.length === 0
            ? 'لا توجد تسجيلات حتى الآن.'
            : 'لا توجد نتائج مطابقة للبحث.';
        enrollmentsList.appendChild(empty);
        return;
    }

    filtered.forEach(function (enrollment) {
        enrollmentsList.appendChild(buildEnrollmentListItem(enrollment));
    });
}

async function loadEnrollmentsData() {
    state.enrollmentsLoadState = 'loading';
    enrollmentsLoading.hidden = false;
    clearError(enrollmentsError);

    try {
        const data = await apiFetch('/api/enrollments', { method: 'GET' });
        state.enrollments = data.enrollments || [];
        state.enrollmentsLoadState = 'loaded';
    } catch (error) {
        state.enrollmentsLoadState = 'error';
        handleApiError(error, 'تعذر تحميل بيانات التسجيلات.', [enrollmentsError]);
    } finally {
        enrollmentsLoading.hidden = true;
        renderEnrollmentsList();
    }
}

enrollmentSearchInput.addEventListener('input', renderEnrollmentsList);
enrollmentYearFilterSelect.addEventListener('change', renderEnrollmentsList);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

checkAuth();
