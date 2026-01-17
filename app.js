// --- State Management ---
const store = {
    students: JSON.parse(localStorage.getItem('wa_students')) || [],
    teachers: JSON.parse(localStorage.getItem('wa_teachers')) || [],
    attendance: JSON.parse(localStorage.getItem('wa_attendance')) || [],
    finance: JSON.parse(localStorage.getItem('wa_finance')) || [],
    exams: JSON.parse(localStorage.getItem('wa_exams')) || [],

    async save(key, silent = false) {
        // Local Save (keep for offline fallback)
        localStorage.setItem(`wa_${key}`, JSON.stringify(this[key]));

        // Cloud Sync (only for whitelisted tables)
        const syncWhitelist = ['students', 'teachers', 'attendance', 'finance', 'exams'];
        if (cloudSync.supabase && syncWhitelist.includes(key)) {
            try {
                const { error } = await cloudSync.supabase.from(key).upsert(this[key]);
                if (error) {
                    console.error(`Sync Error (${key}):`, error);
                    if (!silent) alert(`DIGNIIN: Xogtaada waxaa lagu keydiyay COMPUTER-KA oo kaliya.\n\nOnline-kii (Cloud) waa uu fashilmay.\nCODE: ${error.code}\nMESSAGE: ${error.message}`);
                }
            } catch (e) {
                console.error(`Sync Exception (${key}):`, e);
                if (!silent) alert(`Khalad ayaa dhacay markii Cloud-ka loo dirayey xogta: ${e.message}`);
            }
        }
        else {
            console.warn(`Local save only for ${key}. Cloud not configured.`);
            // Only alert if we ARE trying to sync but failed
            if (localStorage.getItem('supabase_url')) {
                console.error('Supabase client not initialized but URL exists.');
            }
        }
    },

    async fetchCloudData(silent = false) {
        if (!cloudSync.supabase) {
            if (!silent) alert('KHAKAD: Ma haysatid xiriirka Cloud-ka. Fadlan marka hore geli URL iyo Key qaybta Settings (Online Sync).');
            return;
        }

        const btn = document.getElementById('btn-sync-cloud');
        const originalContent = btn ? btn.innerHTML : '';
        if (btn && !silent) btn.innerHTML = '<i data-lucide="refresh-cw" class="w-10 h-10 animate-spin"></i><span class="text-[10px] font-bold">Syncing...</span>';

        try {
            const tables = ['students', 'teachers', 'attendance', 'finance', 'exams'];
            let hasChanges = false;

            for (const table of tables) {
                const { data, error } = await cloudSync.supabase.from(table).select('*');
                if (error) {
                    console.error(`Fetch Error (${table}):`, error);
                } else if (data) {
                    // --- SMART MERGE LOGIC ---
                    // Combine local and cloud data, ensuring we don't lose local-only records
                    const localDataMap = new Map(this[table].map(item => [item.id, item]));
                    let tableChanged = false;

                    data.forEach(cloudItem => {
                        const localItem = localDataMap.get(cloudItem.id);
                        // If cloud has it and local doesn't, OR if cloud item is different
                        if (!localItem || JSON.stringify(localItem) !== JSON.stringify(cloudItem)) {
                            localDataMap.set(cloudItem.id, cloudItem);
                            tableChanged = true;
                        }
                    });

                    // Check if local has items that cloud DOES NOT have (needs to be pushed UP)
                    const mergedData = Array.from(localDataMap.values());
                    if (mergedData.length > data.length) {
                        tableChanged = true; // Mark as changed to trigger cloud upload
                    }

                    if (tableChanged) {
                        this[table] = mergedData;
                        localStorage.setItem(`wa_${table}`, JSON.stringify(mergedData));

                        // Push the merged state back to cloud - SILENTLY in background
                        await this.save(table, true);
                        hasChanges = true;
                    }
                }
            }

            if (btn) btn.innerHTML = originalContent;
            lucide.createIcons();

            if (hasChanges) {
                const studentCount = this.students.length;
                if (!silent) alert(`HAMBALYO! Xogtaadii waa la cusboonaysiiyay.\nWaxaan soo jiidnay: ${studentCount} Arday.`);
                // Refresh current view
                const hash = window.location.hash.slice(1) || 'dashboard';
                router.navigate(hash);
            } else {
                if (!silent) alert(`Xogtaadu waa mid la mid ah tan Cloud-ka. (Ardayda hadda: ${this.students.length})`);
            }
        } catch (e) {
            if (btn) btn.innerHTML = originalContent;
            lucide.createIcons();
            if (!silent) alert('Xiriirka waa uu go\'ay: ' + e.message);
        }
    },

    exportData() {
        const data = {
            students: this.students,
            teachers: this.teachers,
            attendance: this.attendance,
            finance: this.finance,
            exams: this.exams
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `al_wafaaa_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('Ma hubtaa inaad rabto inaad soo celiso xogtan? Tani waxay tirtiri doontaa xogta hadda jirta.')) {
                    if (data.students) {
                        this.students = data.students;
                        this.save('students');
                    }
                    if (data.teachers) {
                        this.teachers = data.teachers;
                        this.save('teachers');
                    }
                    if (data.attendance) {
                        this.attendance = data.attendance;
                        this.save('attendance');
                    }
                    if (data.finance) {
                        this.finance = data.finance;
                        this.save('finance');
                    }
                    if (data.exams) {
                        this.exams = data.exams;
                        this.save('exams');
                    }
                    alert('Xogtii si guul leh ayaa loo soo celiyay! Bogga ayaa dib u load-gareynaya.');
                    window.location.reload();
                }
            } catch (err) {
                alert('Khalad ayaa ku dhacay aqrinta faylka. Fadlan hubi inuu yahay faylka saxda ah.');
                console.error(err);
            }
        };
        reader.readAsText(file);
    }
};

// --- Cloud Sync Logic (Supabase) ---
const cloudSync = {
    url: localStorage.getItem('supabase_url') || 'https://qdtghdtaocyeeqsiaxbz.supabase.co',
    key: localStorage.getItem('supabase_key') || 'sb_publishable_uteTK3dbWQTDsVDHCf1Mjg_ZlzTBohv',
    supabase: null,

    async init() {
        const cloudStatus = document.getElementById('cloud-status');
        const cloudText = cloudStatus?.querySelector('span:last-child');
        const cloudDot = cloudStatus?.querySelector('span:first-child');

        if (this.url && this.key) {
            try {
                this.supabase = supabase.createClient(this.url, this.key);

                // Test the connection AND check tables
                const { error } = await this.supabase.from('students').select('count', { count: 'exact', head: true });

                if (error) {
                    if (error.code === '42P01') {
                        this.showDiagnostic('Table Not Found (42P01)', 'Database-kaaga wali "Tables-kii" lama abuurin. Fadlan raac tillaabooyinka SQL.', 'orange');
                        if (cloudText) cloudText.innerText = 'Setup Required';
                        if (cloudDot) { cloudDot.className = 'w-2 h-2 rounded-full bg-orange-500 animate-pulse'; }
                        return false;
                    }
                    if (error.code === '42501') {
                        this.showDiagnostic('Permission Denied (42501)', 'Database-ka waa uu jiraa laakiin ma kuu ogola in wax lagu qoro. Fadlan SQL-ka labaad (Fix RLS) ku dhufo Supabase.', 'red');
                        if (cloudText) cloudText.innerText = 'Permission Error';
                        if (cloudDot) { cloudDot.className = 'w-2 h-2 rounded-full bg-red-500'; }
                        return false;
                    }
                    throw error;
                }

                console.log('Sync System: Online & Connected');
                if (cloudStatus) cloudStatus.classList.remove('hidden');
                if (cloudText) cloudText.innerText = 'Online Sync Active';
                if (cloudDot) { cloudDot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse'; }
                document.getElementById('btn-sync-cloud')?.classList.remove('hidden');
                lucide.createIcons();
                return true;
            } catch (e) {
                console.error('Supabase Init Error:', e.message);
                if (e.message.includes('Failed to fetch')) {
                    this.showDiagnostic('Network Error (Fetch Failed)', 'Internet-ka ayaa cidhiidhi ah ama URL-ka ayaa khaldan. Fadlan guji "Reset to Default".', 'red');
                }
                if (cloudText) cloudText.innerText = 'Connection Failed';
                if (cloudDot) { cloudDot.className = 'w-2 h-2 rounded-full bg-red-500'; }
                return false;
            }
        }
        return false;
    },

    showDiagnostic(title, msg, color = 'red') {
        const dashboard = document.getElementById('dashboard-view');
        if (!dashboard) return;

        const bg = color === 'red' ? 'bg-red-50' : 'bg-orange-50';
        const border = color === 'red' ? 'border-red-200' : 'border-orange-200';
        const iconBg = color === 'red' ? 'bg-red-500' : 'bg-orange-500';
        const textTitle = color === 'red' ? 'text-red-900' : 'text-orange-900';
        const textMsg = color === 'red' ? 'text-red-700' : 'text-orange-700';

        const errorHtml = `
            <div id="sync-diagnostic-banner" class="${bg} border-4 ${border} p-8 rounded-[2.5rem] mb-8 shadow-2xl">
                <div class="flex flex-col md:flex-row items-center gap-6">
                    <div class="${iconBg} w-20 h-20 rounded-[2rem] text-white flex items-center justify-center shrink-0 animate-pulse">
                        <i data-lucide="alert-octagon" class="w-10 h-10"></i>
                    </div>
                    <div class="text-center md:text-left">
                        <h3 class="text-2xl font-black ${textTitle} tracking-tighter uppercase">${title}</h3>
                        <p class="${textMsg} font-bold text-lg leading-snug mt-1">${msg}</p>
                        
                        <div class="mt-6 flex flex-wrap gap-4 justify-center md:justify-start">
                            <button onclick="cloudSync.openSettings()" class="bg-gray-800 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase hover:bg-black transition-all shadow-xl active:scale-95">
                                FUR SETTINGS (Fix SQL)
                            </button>
                            <button onclick="window.location.reload()" class="bg-white text-gray-800 border-2 border-gray-200 px-8 py-4 rounded-2xl font-black text-sm uppercase hover:bg-gray-50 transition-all shadow-md">
                                REFRESH BOGGA
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('sync-diagnostic-banner') || document.getElementById('table-setup-banner');
        if (existing) existing.remove();
        dashboard.insertAdjacentHTML('afterbegin', errorHtml);
        lucide.createIcons();
    },

    openSettings() {
        const html = `
            <div class="p-8">
                <div class="flex items-center gap-4 mb-8">
                    <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                        <i data-lucide="cloud-lightning" class="w-8 h-8"></i>
                    </div>
                    <div>
                        <h2 class="text-3xl font-black text-gray-800 tracking-tight">Cloud Database Settings</h2>
                        <p class="text-gray-500 font-medium">Gali xogta Supabase si aad online ugu shaqeyso.</p>
                    </div>
                </div>

                <div class="space-y-6">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Supabase Project URL</label>
                        <input type="text" id="supabase-url" value="${this.url}" 
                            class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-mono text-sm"
                            placeholder="https://xyz.supabase.co">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Supabase Anon Key</label>
                        <input type="password" id="supabase-key" value="${this.key}" 
                            class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-mono text-sm"
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
                    </div>

                    <div class="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex flex-col gap-4">
                        <div class="flex gap-4">
                            <div class="bg-white p-2 rounded-lg text-indigo-600 shadow-sm shrink-0">
                                <i data-lucide="info" class="w-5 h-5"></i>
                            </div>
                            <p class="text-sm text-indigo-700 leading-relaxed font-medium">
                                Markaad save-gareyso, nidaamku wuxuu isku dayayaa inuu ku xirmo daruuraha. Waxaad u baahan doonta inaad <strong>Migration</strong> samayso.
                            </p>
                        </div>
                        
                        <div class="border-t border-indigo-200/50 pt-4">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-[10px] font-black uppercase text-indigo-400">Database Setup (Copy & Paste to SQL Editor)</span>
                                <button onclick="cloudSync.copySQL()" class="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded font-bold hover:bg-indigo-700 transition-all">Copy SQL</button>
                            </div>
                            <pre class="bg-gray-900 text-gray-300 p-3 rounded-xl text-[10px] font-mono overflow-auto border border-gray-800 max-h-40" id="sql-script-box">
-- 1. Students
CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY,
  name text,
  age int,
  gender text,
  classLevel text,
  birthplace text,
  parent text,
  phone text,
  address text,
  guardian text,
  guardianPhone text,
  registeredAt text
);

-- 2. Teachers
CREATE TABLE IF NOT EXISTS teachers (
  id text PRIMARY KEY,
  name text,
  phone text,
  email text,
  address text
);

-- 3. Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id text PRIMARY KEY,
  studentId text REFERENCES students(id),
  date date,
  status text,
  month text,
  year int
);

-- 4. Finance
CREATE TABLE IF NOT EXISTS finance (
  id text PRIMARY KEY,
  type text,
  amount decimal,
  category text,
  date date,
  "desc" text,
  studentId text,
  teacherId text
);

-- 5. Exams
CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY,
  studentId text REFERENCES students(id),
  type text,
  scores jsonb,
  subjectHeaders jsonb,
  date date
);</pre>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row gap-4 pt-4">
                        <button onclick="cloudSync.saveSettings()" 
                            class="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                            <i data-lucide="save" class="w-5 h-5"></i>
                            Save & Connect
                        </button>
                        <button onclick="cloudSync.resetToDefaults()" 
                            class="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-bold shadow-lg shadow-gray-100 hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                            <i data-lucide="rotate-ccw" class="w-5 h-5"></i>
                            Reset to Default
                        </button>
                        <button onclick="cloudSync.migrateData(event)" 
                            class="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                            <i data-lucide="arrow-up-circle" class="w-5 h-5"></i>
                            Migrate Local to Cloud
                        </button>
                    </div>
                </div>
            </div>
        `;
        modal.open(html);
        lucide.createIcons();
    },

    copySQL() {
        const sql = document.getElementById('sql-script-box').innerText;
        navigator.clipboard.writeText(sql).then(() => {
            alert('SQL koodkii waa la koobiyey! Hadda ku dhufo (Paste) SQL Editor-ka Supabase.');
        });
    },

    async saveSettings() {
        let url = document.getElementById('supabase-url').value.trim();
        const key = document.getElementById('supabase-key').value.trim();

        if (!url || !key) {
            alert('Fadlan geli labada xogood (URL & Key)');
            return;
        }

        // Auto-fix URL if https is missing
        if (!url.startsWith('http')) url = 'https://' + url;

        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_key', key);
        this.url = url;
        this.key = key;

        // Initialize
        try {
            this.supabase = supabase.createClient(this.url, this.key);

            // Test Connection
            const { data, error } = await this.supabase.from('students').select('count', { count: 'exact', head: true });

            if (error) {
                if (error.message.includes('Failed to fetch')) {
                    alert('KHAKAD: Internet-ka ma shaqeynayo ama URL-ka ayaa khaldan. Hubi in URL-gu uu sax yahay.');
                } else if (error.code === '42P01') {
                    alert('Xiriirka waa sax! Laakiin weli maadan abuurin Tables-ka. Fadlan SQL Editor-ka isticmaal.');
                } else {
                    alert('Khalad kale: ' + error.message);
                }
            } else {
                alert('HAMBALYO! Xiriirka Supabase waa guul. Hadda waad bilaabi kartaa Migration-ka.');
                document.getElementById('cloud-status')?.classList.remove('hidden');
            }
        } catch (e) {
            alert('Xiriirka waa uu fashilmay: ' + e.message);
        }
    },

    resetToDefaults() {
        if (confirm('Ma hubtaa inaad rabto inaad dib ugu celiso xogta Supabase-ka sidii hore (Default)?')) {
            localStorage.removeItem('supabase_url');
            localStorage.removeItem('supabase_key');
            alert('Xogtii waa la tirtiray. Hadda bogga dib u load-garee (Refresh) si uu u isticmaalo Settings-ka saxda ah.');
            window.location.reload();
        }
    },

    async migrateData(event) {
        if (!this.supabase) {
            alert('Fadlan marka hore geli settings-ka Supabase oo Save dheh.');
            return;
        }

        if (!confirm('Ma hubtaa inaad rabto inaad xogta localStorage u guuriso Supabase? Tani waxay u baahan tahay in TABLES-ka (students, teachers, attendance, finance, exams) ay Supabase ku dhex jiraan.')) return;

        try {
            const btn = event?.target?.closest('button') || { innerHTML: '', style: {} };
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Migrating...';

            const tables = ['students', 'teachers', 'attendance', 'finance', 'exams'];
            let totalMoved = 0;

            for (const table of tables) {
                if (store[table].length > 0) {
                    const { error } = await this.supabase.from(table).upsert(store[table]);
                    if (error) throw new Error(`${table} error: ${error.message}`);
                    if (table === 'students') totalMoved = store[table].length;
                }
            }

            btn.innerHTML = originalText;
            alert(`HAMBALYO! Xogtaadii si guul leh ayaa loo gooyay Cloud-ka.\nWaxaan u rarnay ${totalMoved} Arday!`);
            renderDashboard.updateSyncStatus();
        } catch (e) {
            console.error('Migration Error:', e);
            alert('Khalad ayaa dhacay: ' + e.message);
        }
    }
};

cloudSync.init();

// --- Dummy Data Init (First Run Only) ---
if (store.students.length === 0) {
    store.students = [
        { id: "S001", name: "Axmed Cali", age: 10, classLevel: "المستوى الأول والثاني", parent: "Cali", phone: "615000000" },
        { id: "S002", name: "Fartuun Yusuf", age: 8, classLevel: "المستوى الثالث والرابع", parent: "Yusuf", phone: "615111111" },
    ];
    store.save('students');
}

if (!store.exams || store.exams.length === 0) {
    store.exams = [
        { id: "e1", studentId: "S001", subject: "Math", type: "Term 1", date: "2024-03-20", score: 85, total: 100 },
        { id: "e2", studentId: "S002", subject: "Arabic", type: "Term 1", date: "2024-03-21", score: 92, total: 100 }
    ];
    store.save('exams');
}

// --- Router ---
const router = {
    navigate(pageId) {
        // Handle empty hash or default
        if (!pageId) pageId = 'dashboard';

        // Auth Check
        if (store.currentUser && !auth.checkAccess(pageId)) {
            alert('Raali ahow, ma haysatid ogolaansho aad ku gasho boggan.');
            return;
        }

        // Update Sidebar UI (Support both button onclick and a href styles)
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        // Try to find the active link/button
        const activeLink = document.querySelector(`a[href="#${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        } else {
            // Fallback for old button style if any
            const activeBtn = document.querySelector(`button[onclick="router.navigate('${pageId}')"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }

        // Show/Hide Sections
        // Hide all potential view containers
        document.querySelectorAll('.view-section, .page-view').forEach(el => el.classList.add('hidden'));

        // Determine target ID (Handle inconsistency: dashboard-view vs view-students)
        let targetId = `view-${pageId}`;
        if (pageId === 'dashboard') targetId = 'dashboard-view';

        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        } else {
            console.error(`View not found: ${targetId}`);
        }

        // Trigger Render functions
        switch (pageId) {
            case 'dashboard': renderDashboard.render(); break;
            case 'students': renderStudents.list(); break;
            case 'teachers': renderTeachers.list(); break;
            case 'attendance': renderAttendance.init(); break;
            case 'finance': renderFinance.list(); break;
            case 'reports': renderReports.init(); break;
            case 'exams': renderExams.init(); break;
            case 'classes': renderClasses.init(); break;
        }
    }
};

// Initialize Router on Load and Hash Change
window.addEventListener('hashchange', () => {
    router.navigate(window.location.hash.slice(1));
});

window.addEventListener('DOMContentLoaded', async () => {
    router.navigate(window.location.hash.slice(1) || 'dashboard');

    // Initialize Cloud Sync
    const isConnected = await cloudSync.init();
    if (isConnected) {
        console.log('Auto-fetching cloud data...');
        store.fetchCloudData(true); // Initial sync

        // Start background auto-refresh every 15 seconds for "Real-Time" feel
        setInterval(() => {
            console.log('Background Sync: Checking for updates...');
            store.fetchCloudData(true);
        }, 15000);
    }
});

// --- Modal System ---
const modal = {
    overlay: document.getElementById('modal-overlay'),
    content: document.getElementById('modal-content'),

    open(html) {
        this.content.innerHTML = html;
        this.overlay.classList.remove('hidden');
    },

    close() {
        this.overlay.classList.add('hidden');
    }
};

document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) modal.close();
});

// --- Dashboard Logic ---
const renderDashboard = {
    render() {
        this.updateDate();
        document.getElementById('dash-total-students').innerText = store.students.length;
        document.getElementById('dash-total-teachers').innerText = store.teachers.length;

        // Calculate Attendance % (Simplified: check today's records vs total students)
        const today = new Date().toISOString().split('T')[0];
        const todayRecords = store.attendance.filter(a => a.date === today);
        const presentCount = todayRecords.filter(a => a.status === 'present').length;
        const percentage = store.students.length > 0 ? Math.round((presentCount / store.students.length) * 100) : 0;
        if (document.getElementById('dash-attendance')) document.getElementById('dash-attendance').innerText = `${percentage}%`;

        const income = store.finance.filter(f => f.type === 'income').reduce((acc, curr) => acc + Number(curr.amount), 0);
        const expense = store.finance.filter(f => f.type === 'expense').reduce((acc, curr) => acc + Number(curr.amount), 0);
        const balance = income - expense;
        if (document.getElementById('dash-balance')) document.getElementById('dash-balance').innerText = `$${balance.toLocaleString()}`;

        // Calculate Gender Stats
        let boys = 0;
        let girls = 0;
        store.students.forEach(s => {
            if (s.gender === 'Male' || !s.gender) boys++;
            else if (s.gender === 'Female') girls++;
        });

        // Initialize Gender Stats (New Beautiful Design)
        this.renderGenderStats(boys, girls);

        // Initialize Calendar
        try {
            this.renderCalendar();
        } catch (e) {
            console.error('Calendar Error:', e);
        }

        // Re-initialize icons for new dashboard content
        lucide.createIcons();

        // --- Role Based Dashboard Adjustment ---
        const user = store.currentUser;
        if (user) {
            const hide = (id) => document.getElementById(id)?.classList.add('hidden');
            const show = (id) => document.getElementById(id)?.classList.remove('hidden');

            ['btn-quick-student', 'btn-quick-finance', 'btn-quick-attendance', 'btn-quick-reports'].forEach(show);

            if (user.role === 'teacher') {
                hide('btn-quick-finance');
            } else if (user.role === 'accountant') {
                hide('btn-quick-student');
                hide('btn-quick-attendance');
            }
        }
    },

    // New "Beautiful" Design: Progress Cards & Bars instead of Circle Chart
    renderGenderStats(boys, girls) {
        const container = document.getElementById('gender-container');
        if (!container) return; // Safety check

        const total = boys + girls || 1;
        const boysPct = Math.round((boys / total) * 100);
        const girlsPct = Math.round((girls / total) * 100);

        // Completely replace container content
        container.innerHTML = `
            <div class="h-full flex flex-col justify-center gap-6">
                <!-- Stat Cards Row -->
                <div class="grid grid-cols-2 gap-4">
                    <!-- Boys Card -->
                    <div class="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4 transition-transform hover:scale-105">
                        <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                             <i data-lucide="user" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Wiilal</p>
                            <h3 class="text-3xl font-black text-gray-800">${boys}</h3>
                        </div>
                    </div>

                    <!-- Girls Card -->
                    <div class="bg-pink-50/50 p-4 rounded-2xl border border-pink-100 flex items-center gap-4 transition-transform hover:scale-105">
                        <div class="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center text-white shadow-lg shadow-pink-200">
                             <i data-lucide="user" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Gabdhaha</p>
                            <h3 class="text-3xl font-black text-gray-800">${girls}</h3>
                        </div>
                    </div>
                </div>

                <!-- Progress Bar Visualization -->
                <div class="mt-2">
                    <div class="flex justify-between text-sm font-bold text-gray-600 mb-2">
                        <span>Distribution</span>
                        <span>${total} Total</span>
                    </div>
                    <div class="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                        <div style="width: ${boysPct}%" class="h-full bg-blue-500 shadow-md transition-all duration-1000 ease-out"></div>
                        <div style="width: ${girlsPct}%" class="h-full bg-pink-500 shadow-md transition-all duration-1000 ease-out"></div>
                    </div>
                    <div class="flex justify-between text-xs font-bold mt-2 text-gray-400">
                        <div class="text-blue-500">${boysPct}% Wiilal</div>
                        <div class="text-pink-500">${girlsPct}% Gabdho</div>
                    </div>
                </div>
            </div>
        `;

        // Re-initialize icons for the new content
        lucide.createIcons();
    },

    renderCalendar() {
        const calendarWidget = document.getElementById('calendar-widget');
        const monthYearLabel = document.getElementById('calendar-month-year');

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const today = now.getDate();

        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        monthYearLabel.innerText = `${monthNames[currentMonth]} ${currentYear}`;

        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        let html = '<div class="calendar-header">';
        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(day => {
            html += `<div>${day}</div>`;
        });
        html += '</div><div class="calendar-grid">';

        // Empty slots for days before start of month
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        // Days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const isToday = i === today ? 'today' : '';
            html += `<div class="calendar-day ${isToday}">${i}</div>`;
        }

        html += '</div>';
        calendarWidget.innerHTML = html;
    },

    updateDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', options);
    }
};

// --- Students Logic ---
const renderStudents = {
    list() {
        const tbody = document.querySelector('#students-table tbody');
        const searchInput = document.getElementById('student-search');

        // Add search event listener
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filteredStudents = store.students.filter(s =>
                    s.name.toLowerCase().includes(query) ||
                    s.id.toLowerCase().includes(query) ||
                    (s.classLevel && s.classLevel.includes(query)) ||
                    (s.parent && s.parent.toLowerCase().includes(query)) ||
                    (s.phone && s.phone.includes(query))
                );
                this.renderTable(filteredStudents);
            });
            searchInput.dataset.listenerAdded = 'true';
        }

        this.renderTable(store.students);
    },

    renderTable(students) {
        const tbody = document.querySelector('#students-table tbody');
        tbody.innerHTML = students.map(s => `
            <tr class="hover:bg-blue-50/50 transition-colors">
                <td class="p-4 font-mono text-xs">${s.id}</td>
                <td class="p-4 font-bold text-gray-800">${s.name}</td>
                <td class="p-4 text-purple-600 font-bold text-xs">${s.classLevel || '-'}</td>
                <td class="p-4 text-gray-500 text-xs">${s.age || '-'}</td>
                <td class="p-4 text-gray-500 text-xs">${s.birthplace || '-'}</td>
                <td class="p-4 text-gray-500 text-sm">${s.parent}</td>
                <td class="p-4 text-gray-500 text-xs">${s.phone}</td>
                <td class="p-4 text-gray-500 text-xs">${s.address || '-'}</td>
                <td class="p-4 text-gray-500 text-xs">${s.guardian || '-'} <br> ${s.guardianPhone || ''}</td>
                <td class="p-4 text-gray-500 text-xs">${s.registeredAt ? s.registeredAt.split('T')[0] : '-'}</td>
                <td class="p-4 flex gap-2">
                    <button onclick="renderStudents.view('${s.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Arag"><i data-lucide="eye" class="w-4 h-4"></i></button>
                    <button onclick="renderStudents.edit('${s.id}')" class="text-green-500 hover:text-green-700 p-1" title="Wax ka badal"><i data-lucide="edit" class="w-4 h-4"></i></button>
                    <button onclick="renderStudents.printOne('${s.id}')" class="text-purple-500 hover:text-purple-700 p-1" title="Daabac Profile"><i data-lucide="printer" class="w-4 h-4"></i></button>
                    <button onclick="renderStudents.printAttendance('${s.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Daabac Xaadirinta"><i data-lucide="calendar-check" class="w-4 h-4"></i></button>
                    <button onclick="renderStudents.delete('${s.id}')" class="text-red-500 hover:text-red-700 p-1" title="Tirtir"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    },

    openModal(student = null) {
        const isEdit = !!student;
        modal.open(`
            <div class="p-5">
                <h2 class="text-lg font-bold mb-3 text-gray-800">${isEdit ? 'Badal Xogta' : 'Diiwaangali Arday'}</h2>
                <form onsubmit="renderStudents.save(event, '${isEdit ? student.id : ''}')">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="col-span-2">
                            <label class="block text-xs font-bold text-gray-500 mb-1">ID-ga Ardayga</label>
                            <input name="id" value="${student?.id || ''}" placeholder="Gali ID" required ${isEdit ? 'readonly' : ''} class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 ${isEdit ? 'text-gray-400' : 'focus:ring-2 focus:ring-blue-500 outline-none'}" />
                        </div>
                        
                        <input name="name" value="${student?.name || ''}" placeholder="Magaca Ardayga" required class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        
                        <select name="gender" required class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="" disabled ${!student?.gender ? 'selected' : ''}>Dooro Jinsiga</option>
                            <option value="Male" ${student?.gender === 'Male' ? 'selected' : ''}>Wiil (Male)</option>
                            <option value="Female" ${student?.gender === 'Female' ? 'selected' : ''}>Gabar (Female)</option>
                        </select>

                        <select name="classLevel" required class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="" disabled ${!student?.classLevel ? 'selected' : ''}>Dooro Fasalka</option>
                            <option value="المستوى الأول والثاني" ${student?.classLevel === 'المستوى الأول والثاني' ? 'selected' : ''}>المستوى الأول والثاني</option>
                            <option value="المستوى الثالث والرابع" ${student?.classLevel === 'المستوى الثالث والرابع' ? 'selected' : ''}>المستوى الثالث والرابع</option>
                            <option value="المستوى الخامس والسادس" ${student?.classLevel === 'المستوى الخامس والسادس' ? 'selected' : ''}>المستوى الخامس والسادس</option>
                            <option value="المستوى السابع والثامن" ${student?.classLevel === 'المستوى السابع والثامن' ? 'selected' : ''}>المستوى السابع والثامن</option>
                            <option value="المستوى التاسع والعاشر" ${student?.classLevel === 'المستوى التاسع والعاشر' ? 'selected' : ''}>المستوى التاسع والعاشر</option>
                            <option value="المستوى الحادي عشر والثاني عشر" ${student?.classLevel === 'المستوى الحادي عشر والثاني عشر' ? 'selected' : ''}>المستوى الحادي عشر والثاني عشر</option>
                        </select>

                        <input name="age" type="number" value="${student?.age || ''}" placeholder="Da'da (Age)" required class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        
                        <input name="birthplace" value="${student?.birthplace || ''}" placeholder="Goobta Dhalashada" class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />

                        <div class="col-span-2 border-t pt-2 mt-1">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Xogta Waalidka</h3>
                        </div>
                        <input name="parent" value="${student?.parent || ''}" placeholder="Magaca Waalidka" required class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input name="phone" value="${student?.phone || ''}" placeholder="Lambarka Waalidka" required class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input name="address" value="${student?.address || ''}" placeholder="Goobta uu daganyahay" class="col-span-2 w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        
                        <div class="col-span-2 border-t pt-2 mt-1">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Masuulka Guud (Optional)</h3>
                        </div>
                        <input name="guardian" value="${student?.guardian || ''}" placeholder="Magaca Masuulka" class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input name="guardianPhone" value="${student?.guardianPhone || ''}" placeholder="Lambarka Masuulka" class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        
                        <div class="col-span-2 border-t pt-2 mt-1">
                             <label class="block text-xs font-bold text-gray-500 mb-1">Taariikhda Diiwaangalka</label>
                             <input name="registeredAt" type="date" value="${student?.registeredAt ? student.registeredAt.split('T')[0] : new Date().toISOString().split('T')[0]}" class="w-full p-2 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                    </div>
                    <button type="submit" class="w-full mt-4 bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 transition-all">
                        ${isEdit ? 'Badal' : 'Keydi'}
                    </button>
                </form>
            </div>
        `);
    },

    async save(e, existingId) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        btn.disabled = true;

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        // Ensure date format is consistent
        if (!data.registeredAt) data.registeredAt = new Date().toISOString();

        if (existingId) {
            // Update
            const index = store.students.findIndex(s => s.id === existingId);
            if (index !== -1) {
                store.students[index] = { ...store.students[index], ...data };
            }
        } else {
            // Check duplicate ID
            if (store.students.find(s => s.id === data.id)) {
                alert('ID-gan horay ayaa loo isticmaalay!');
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
            store.students.push(data);
        }

        await store.save('students');
        modal.close();
        this.list();
    },

    edit(id) {
        const student = store.students.find(s => s.id === id);
        if (student) this.openModal(student);
    },

    view(id) {
        const s = store.students.find(s => s.id === id);
        if (!s) return;
        modal.open(`
             <div class="p-6">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h2 class="text-3xl font-bold text-gray-800">${s.name}</h2>
                    </div>
                    <div class="bg-gray-100 p-2 rounded-lg text-gray-500 font-mono text-sm">ID: ${s.id}</div>
                </div>
                
                <div class="grid grid-cols-2 gap-6 text-sm">
                    <div>
                        <p class="text-gray-500 mb-1">Fasalka (Class)</p>
                        <p class="font-bold text-purple-600">${s.classLevel || '-'}</p>
                    </div>
                    <div>
                        <p class="text-gray-500 mb-1">Da'da</p>
                        <p class="font-bold">${s.age || '-'}</p>
                    </div>
                     <div>
                        <p class="text-gray-500 mb-1">Goobta Dhalashada</p>
                        <p class="font-bold">${s.birthplace || '-'}</p>
                    </div>
                     <div>
                        <p class="text-gray-500 mb-1">Waalidka</p>
                        <p class="font-bold">${s.parent}</p>
                    </div>
                     <div>
                        <p class="text-gray-500 mb-1">Telefoonka Waalidka</p>
                        <p class="font-bold">${s.phone}</p>
                    </div>
                     <div>
                        <p class="text-gray-500 mb-1">Address</p>
                        <p class="font-bold">${s.address || '-'}</p>
                    </div>
                     <div>
                        <p class="text-gray-500 mb-1">Diiwaangalka</p>
                        <p class="font-bold">${s.registeredAt ? s.registeredAt.split('T')[0] : '-'}</p>
                    </div>
                    
                    ${s.guardian ? `
                    <div class="col-span-2 border-t pt-4">
                        <p class="text-gray-500 mb-1">Masuulka Guud</p>
                        <p class="font-bold">${s.guardian} (${s.guardianPhone || '-'})</p>
                    </div>` : ''}
                </div>
                
                <div class="mt-8 flex flex-col gap-4">
                    <div class="flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100">
                        <div class="flex items-center gap-2 text-purple-700 font-bold text-sm">
                            <i data-lucide="layout" class="w-4 h-4"></i> Habka Daabacaadda:
                        </div>
                        <select id="print-orientation" class="bg-white border border-purple-200 rounded-lg px-3 py-1 text-sm font-bold text-purple-700 outline-none focus:ring-2 focus:ring-purple-400">
                            <option value="portrait">📐 Dhiriir (Portrait)</option>
                            <option value="landscape">📏 Balac (Landscape)</option>
                        </select>
                    </div>

                    <div class="flex gap-3">
                        <button onclick="renderStudents.printOne('${s.id}', document.getElementById('print-orientation').value)" class="flex-1 bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 font-bold flex items-center justify-center gap-2">
                             <i data-lucide="printer" class="w-4 h-4"></i> Profile
                        </button>
                        <button onclick="renderStudents.printAttendance('${s.id}')" class="flex-1 bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 font-bold flex items-center justify-center gap-2">
                             <i data-lucide="calendar-check" class="w-4 h-4"></i> Xaadirinta
                        </button>
                        <button onclick="modal.close()" class="flex-1 bg-gray-100 text-gray-700 p-3 rounded-xl hover:bg-gray-200 font-bold">Xir</button>
                    </div>
                </div>
            </div>
        `);
        lucide.createIcons();
    },

    printOne(id, orientation = 'portrait') {
        const s = store.students.find(s => s.id === id);
        if (!s) return;

        const printFrame = document.getElementById('print-frame');
        const isLandscape = orientation === 'landscape';

        printFrame.innerHTML = `
            <style>
                @page { size: ${orientation}; margin: 10mm; }
            </style>
            <div class="print-card" style="padding: 25px; position: relative; border: 2px solid #374151; ${isLandscape ? 'width: 100%; max-width: none;' : ''}">
                <!-- Certificate-like Header -->
                <div style="text-align: center; margin-bottom: 25px; border-bottom: 3px double #4f46e5; padding-bottom: 15px;">
                    <div style="font-size: 36px; font-weight: 900; color: #4f46e5; text-transform: uppercase; letter-spacing: 4px; line-height: 1;">AL-WAFAAA ACADEMY</div>
                    <div style="font-size: 14px; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 6px; margin-top: 5px;">Official Student Profile Document</div>
                </div>

                <!-- Main Identity Area -->
                <div style="display: flex; gap: 30px; margin-bottom: 25px; align-items: start;">
                    <!-- Photo Box -->
                    <div style="width: 120px; height: 150px; border: 2px solid #e5e7eb; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f9fafb; flex-shrink: 0; position: relative; overflow: hidden;">
                        <i data-lucide="user" style="width: 60px; height: 60px; color: #d1d5db;"></i>
                        <span style="font-size: 9px; color: #9ca3af; font-weight: 800; text-transform: uppercase; margin-top: 8px;">Photo 3x4</span>
                        <div style="position: absolute; bottom: 0; width: 100%; background: #4f46e5; color: white; font-size: 9px; font-weight: 900; padding: 3px 0; text-align: center; text-transform: uppercase;">ID: ${s.id}</div>
                    </div>

                    <!-- Name and Primary Details -->
                    <div style="flex: 1; padding-top: 5px;">
                        <div style="font-size: 11px; color: #4f46e5; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Student Full Name / Magaca Ardayga</div>
                        <div style="font-size: 32px; font-weight: 900; color: #111827; line-height: 1.1; margin-bottom: 15px; border-bottom: 2px solid #f3f4f6; padding-bottom: 5px;">${s.name}</div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <div style="font-size: 9px; color: #9ca3af; text-transform: uppercase; font-weight: 800; margin-bottom: 1px;">Gender / Jinsiga</div>
                                <div style="font-size: 18px; font-weight: 800; color: #374151;">${s.gender || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Extended Details Grid (3 Columns) -->
                <div style="display: grid; grid-template-columns: repeat(${isLandscape ? 4 : 3}, 1fr); gap: 20px; padding: 20px; background: #f8fafc; border-radius: 15px; border: 1px solid #e2e8f0; margin-bottom: 25px;">
                    <div>
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Age / Da'da</p>
                        <p style="font-size: 16px; font-weight: 700; color: #1e293b;">${s.age || '-'} Sano</p>
                    </div>
                    <div>
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Birth Place / Goobta Dhalashada</p>
                        <p style="font-size: 16px; font-weight: 700; color: #1e293b;">${s.birthplace || '-'}</p>
                    </div>
                    <div>
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Reg. Date / Diiwaangalinta</p>
                        <p style="font-size: 16px; font-weight: 700; color: #1e293b;">${s.registeredAt ? s.registeredAt.split('T')[0] : '-'}</p>
                    </div>
                    
                    ${!isLandscape ? '<div style="grid-column: span 3; border-top: 1px dashed #cbd5e1; padding-top: 5px; margin-top: 2px;"></div>' : ''}

                    <div>
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Parent Name / Waalidka</p>
                        <p style="font-size: 16px; font-weight: 700; color: #1e293b;">${s.parent}</p>
                    </div>
                    <div>
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Parent Phone / Telefoonka</p>
                        <p style="font-size: 16px; font-weight: 700; color: #1e293b; font-family: monospace;">${s.phone}</p>
                    </div>
                    <div>
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Address / Degmada</p>
                        <p style="font-size: 16px; font-weight: 700; color: #1e293b;">${s.address || '-'}</p>
                    </div>

                    ${s.guardian ? `
                    <div style="grid-column: span ${isLandscape ? 4 : 3}; background: #fff; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; margin-top: 2px;">
                        <p style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">General Guardian / Masuulka Guud</p>
                        <p style="font-size: 14px; font-weight: 700; color: #1e293b;">${s.guardian} 
                            <span style="font-weight: normal; color: #64748b; margin-left: 10px; font-family: monospace;">(${s.guardianPhone || '-'})</span>
                        </p>
                    </div>` : ''}
                </div>

                <!-- Academy Footer -->
                <div style="border-top: 2px solid #f3f4f6; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px;">
                    <div style="max-width: 250px;">
                        <div style="font-size: 9px; color: #9ca3af; font-weight: 800; text-transform: uppercase; margin-bottom: 3px;">Document Authenticated By</div>
                        <div style="font-size: 11px; color: #6b7280; font-weight: 600; font-style: italic;">
                            ${new Date().toLocaleString()} - Generated automatically via Al-Wafaaa Management System.
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 40px;">
                        <div style="text-align: center;">
                            <div style="width: 150px; border-bottom: 2px solid #111827; margin-bottom: 8px; height: 35px;"></div>
                            <div style="font-size: 10px; font-weight: 800; color: #374151; text-transform: uppercase;">Class Teacher / Macalinka</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="width: 150px; border-bottom: 2px solid #111827; margin-bottom: 8px; height: 35px;"></div>
                            <div style="font-size: 10px; font-weight: 800; color: #374151; text-transform: uppercase;">Principal / Maamulaha</div>
                        </div>
                    </div>
                </div>

                <!-- Watermark -->
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; font-weight: 900; color: rgba(79, 70, 229, 0.03); pointer-events: none; z-index: 0; white-space: nowrap; text-transform: uppercase;">
                    AL-WAFAAA ACADEMY
                </div>
            </div>
        `;

        lucide.createIcons();
        window.print();
    },

    printAttendance(id) {
        const s = store.students.find(s => s.id === id);
        if (!s) return;

        // Get Attendance Records descending by date
        const records = store.attendance
            .filter(a => a.studentId === id)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        let present = 0, absent = 0, late = 0;
        records.forEach(r => {
            if (r.status === 'present') present++;
            else if (r.status === 'absent') absent++;
            else late++;
        });

        const rowsHtml = records.map(r => {
            let statusLabel = 'JOOGA';
            let color = 'green';
            if (r.status === 'absent') { statusLabel = 'MAQAN'; color = 'red'; }
            if (r.status === 'late') { statusLabel = 'FASAX'; color = '#ca8a04'; }

            return `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px; color: #374151;">${r.date}</td>
                    <td style="padding: 10px; text-align: right; font-weight: bold; font-family: monospace; color: ${color};">
                        ${statusLabel}
                    </td>
                </tr>
             `;
        }).join('');

        const printFrame = document.getElementById('print-frame');
        printFrame.innerHTML = `
            <div class="print-card">
                 <div class="print-header">
                     <div class="print-logo-text">AL-WAFAAA</div>
                     <div class="print-subtitle">Student Attendance Report / Xaadirinta Ardayga</div>
                     <div style="margin-top: 10px; font-size: 16px; font-weight: bold; color: #1f2937;">${s.name} (ID: ${s.id})</div>
                </div>

                <div class="print-content-box">
                     <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <div style="flex: 1; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; border-left: 4px solid #22c55e;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Present (Jooga)</div>
                            <div style="font-size: 20px; font-weight: 900; color: #16a34a;">${present}</div>
                        </div>
                        <div style="flex: 1; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; border-left: 4px solid #ef4444;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Absent (Maqan)</div>
                            <div style="font-size: 20px; font-weight: 900; color: #dc2626;">${absent}</div>
                        </div>
                        <div style="flex: 1; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; border-left: 4px solid #eab308;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Permission (Fasax)</div>
                            <div style="font-size: 20px; font-weight: 900; color: #ca8a04;">${late}</div>
                        </div>
                    </div>

                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #374151;">
                                <th style="padding: 10px; color: #374151; text-transform: uppercase; font-size: 11px;">Date</th>
                                <th style="padding: 10px; color: #374151; text-transform: uppercase; font-size: 11px; text-align: right;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || '<tr><td colspan="2" style="padding:20px; text-align:center; color:#9ca3af;">No attendance records found / Ardaygan weli lama xaadirin.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="print-footer">
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Class Teacher / Macalinka Fasalka</div>
                    </div>
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Maamulaha / Principal</div>
                    </div>
                </div>
            </div>
        `;
        window.print();
    },

    printList() {
        const printFrame = document.getElementById('print-frame');
        const headerRow = `
            <th style="padding: 10px; color: #374151; font-size: 11px;">#</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Ardayga / Student Name</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Fasalka / Class</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Waalidka / Parent Name</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Tel Waalidka / Parent Phone</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Diiwaangelinta / Registered</th>
        `;
        const bodyRows = store.students.map((s, i) => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">${i + 1}</td>
                <td style="padding: 10px; font-weight: bold;">${s.name}</td>
                <td style="padding: 10px; color: #7c3aed; font-size: 10px; font-weight: bold;">${s.classLevel || '-'}</td>
                <td style="padding: 10px;">${s.parent}</td>
                <td style="padding: 10px; font-family: monospace;">${s.phone}</td>
                <td style="padding: 10px;">${s.registeredAt ? s.registeredAt.split('T')[0] : new Date().toISOString().split('T')[0]}</td>
            </tr>
        `).join('');

        printFrame.innerHTML = `
            <div class="print-card">
                 <div class="print-header">
                     <div class="print-logo-text">AL-WAFAAA</div>
                     <div class="print-subtitle">Student Registration Report / Warbixinta Diiwaangelinta</div>
                     <div style="margin-top: 10px; font-size: 14px; color: #6b7280;">Printed on: ${new Date().toLocaleString()}</div>
                </div>
                <div class="print-content-box">
                    <div style="padding: 15px; background: #f9fafb; border-radius: 8px; margin-bottom: 20px; font-weight: bold;">Total Students: ${store.students.length}</div>
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #374151;">${headerRow}</tr>
                        </thead>
                        <tbody>${bodyRows}</tbody>
                    </table>
                </div>
                 <div class="print-footer">
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Diyaariyay / Prepared By</div>
                    </div>
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Maamulaha / Principal</div>
                    </div>
                </div>
            </div>
        `;
        window.print();
    },

    delete(id) {
        if (confirm('Ma hubtaa inaad tirtirto ardaygan?')) {
            store.students = store.students.filter(s => s.id !== id);
            store.save('students');
            this.list();
        }
    }
};

// --- Teachers Logic ---
const renderTeachers = {
    list() {
        const tbody = document.querySelector('#teachers-table tbody');
        const searchInput = document.getElementById('teacher-search');

        // Add search event listener
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filteredTeachers = store.teachers.filter(t =>
                    t.name.toLowerCase().includes(query) ||
                    t.id.toLowerCase().includes(query) ||
                    (t.subject && t.subject.toLowerCase().includes(query)) ||
                    (t.phone && t.phone.includes(query))
                );
                this.renderTable(filteredTeachers);
            });
            searchInput.dataset.listenerAdded = 'true';
        }

        this.renderTable(store.teachers);
    },

    renderTable(teachers) {
        const tbody = document.querySelector('#teachers-table tbody');
        tbody.innerHTML = teachers.map(t => `
            <tr class="hover:bg-green-50/50 transition-colors">
                <td class="p-4">${t.id}</td>
                <td class="p-4 font-bold text-gray-800">${t.name}</td>
                <td class="p-4 text-gray-500">${t.phone}</td>
                <td class="p-4 text-gray-500 text-xs">${t.email || '-'}</td>
                <td class="p-4">
                    <button onclick="renderTeachers.delete('${t.id}')" class="text-red-500 hover:text-red-700 p-2"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    },

    printList() {
        const printFrame = document.getElementById('print-frame');
        const headerRow = `
            <th style="padding: 10px; color: #374151; font-size: 11px;">#</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Teacher Name</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">ID</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Phone</th>
            <th style="padding: 10px; color: #374151; font-size: 11px;">Email</th>
        `;
        const bodyRows = store.teachers.map((t, i) => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">${i + 1}</td>
                <td style="padding: 10px; font-weight: bold;">${t.name}</td>
                <td style="padding: 10px; color: #6b7280;">${t.id}</td>
                <td style="padding: 10px;">${t.phone}</td>
                <td style="padding: 10px;">${t.email || '-'}</td>
            </tr>
        `).join('');

        printFrame.innerHTML = `
            <div class="print-card">
                 <div class="print-header">
                     <div class="print-logo-text">AL-WAFAAA</div>
                     <div class="print-subtitle">Teachers List / Liiska Macalimiinta</div>
                     <div style="margin-top: 10px; font-size: 14px; color: #6b7280;">Printed on: ${new Date().toLocaleString()}</div>
                </div>
                <div class="print-content-box">
                    <div style="padding: 15px; background: #f9fafb; border-radius: 8px; margin-bottom: 20px; font-weight: bold;">Total Teachers: ${store.teachers.length}</div>
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #374151;">${headerRow}</tr>
                        </thead>
                        <tbody>${bodyRows}</tbody>
                    </table>
                </div>
                <div class="print-footer">
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Diyaariyay / Prepared By</div>
                    </div>
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Maamulaha / Principal</div>
                    </div>
                </div>
            </div>
        `;
        window.print();
    },

    openModal() {
        modal.open(`
             <div class="p-6">
                <h2 class="text-xl font-bold mb-4">Diiwaangali Macalin Cusub</h2>
                <form onsubmit="renderTeachers.save(event)">
                    <div class="grid grid-cols-1 gap-4">
                        <input name="id" value="T${Date.now().toString().slice(-4)}" readonly class="w-full p-3 bg-gray-100 rounded-xl border border-gray-200 text-gray-500" />
                        <input name="name" placeholder="Magaca Macalinka" required class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200" />
                        <input name="phone" placeholder="Telefoonka" required class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200" />
                        <input name="email" type="email" placeholder="Email (Optional)" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200" />
                        <input name="address" placeholder="Goobta uu daganyahay" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200" />
                    </div>
                    <button type="submit" class="w-full mt-6 bg-green-600 text-white p-3 rounded-xl hover:bg-green-700 font-bold">Keydi</button>
                </form>
            </div>
        `);
    },

    save(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newTeacher = Object.fromEntries(formData.entries());

        store.teachers.push(newTeacher);
        store.save('teachers');
        modal.close();
        this.list();
    },

    delete(id) {
        if (confirm('Ma hubtaa inaad tirtirto macalinkan?')) {
            store.teachers = store.teachers.filter(t => t.id !== id);
            store.save('teachers');
            this.list();
        }
    }
};

// --- Attendance Logic ---
const renderAttendance = {
    init() {
        const monthSelect = document.getElementById('attendance-month');
        const yearSelect = document.getElementById('attendance-year');

        const now = new Date();
        if (!monthSelect.value) monthSelect.value = now.getMonth();
        if (!yearSelect.value) yearSelect.value = now.getFullYear();

        // One-time cleanup of non-Thu/Fri records to fix previous date-shift bug
        const originalLength = store.attendance.length;
        store.attendance = store.attendance.filter(rec => {
            const d = new Date(rec.date);
            return (d.getDay() === 4 || d.getDay() === 5);
        });
        if (store.attendance.length !== originalLength) store.save('attendance');

        this.renderMonth();

        monthSelect.onchange = () => this.renderMonth();
        yearSelect.onchange = () => this.renderMonth();
    },

    getWorkingDays(year, month) {
        const days = [];
        const date = new Date(year, month, 1);
        while (date.getMonth() === Number(month)) {
            const dayOfWeek = date.getDay(); // 4 = Thu, 5 = Fri
            if (dayOfWeek === 4 || dayOfWeek === 5) {
                // Use local date parts instead of ISO to avoid timezone shifts
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                days.push(`${y}-${m}-${d}`);
            }
            date.setDate(date.getDate() + 1);
        }
        return days;
    },

    renderMonth() {
        const month = document.getElementById('attendance-month').value;
        const year = document.getElementById('attendance-year').value;
        const searchTerm = document.getElementById('attendance-search').value.toLowerCase();
        const workingDays = this.getWorkingDays(year, month);

        // Update Summary Text
        const thursdays = workingDays.filter(d => new Date(d).getDay() === 4).length;
        const fridays = workingDays.filter(d => new Date(d).getDay() === 5).length;
        document.getElementById('attendance-summary').innerText = `Maalmaha: ${workingDays.length} (${thursdays} Khamiis, ${fridays} Jimco)`;

        const headerRow = document.getElementById('attendance-header-row');
        const tbody = document.querySelector('#attendance-table tbody');

        // Filter students based on search term
        const filteredStudents = store.students.filter(s =>
            s.name.toLowerCase().includes(searchTerm) ||
            s.id.toLowerCase().includes(searchTerm)
        );

        // Render Header
        headerRow.innerHTML = `
            <th class="p-4 text-sm font-semibold text-gray-600 min-w-[250px] sticky left-0 bg-gray-50/90 z-20 backdrop-blur-sm shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Magaca Ardayga</th>
            <th class="p-4 text-sm font-semibold text-gray-600 text-center border-l border-gray-100">Daqsan</th>
        ` +
            workingDays.map(date => {
                const day = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
                const num = date.split('-')[2];
                return `<th class="p-4 text-xs font-bold text-gray-400 text-center border-l border-gray-100 min-w-[60px]">
                    <div class="uppercase tracking-tighter">${day}</div>
                    <div class="text-lg text-gray-800">${num}</div>
                </th>`;
            }).join('');

        // Render Rows
        tbody.innerHTML = filteredStudents.map(s => {
            const rowRecords = store.attendance.filter(a => a.studentId === s.id && workingDays.includes(a.date));
            const recordsMap = new Map(rowRecords.map(r => [r.date, r.status]));

            return `
            <tr class="hover:bg-blue-50/50 transition-colors group">
                <td class="p-4 sticky left-0 bg-white group-hover:bg-blue-50/50 z-10 border-r border-gray-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                    <div class="font-bold text-gray-800 text-sm whitespace-nowrap">${s.name}</div>
                    <div class="text-[10px] text-gray-400 font-mono text-id-strip">ID: ${s.id}</div>
                </td>
                <td class="p-4 text-center border-l border-gray-50">
                    <button onclick="renderAttendance.printIndividual('${s.id}')" 
                        class="text-purple-600 hover:bg-purple-50 p-2 rounded-lg transition-colors" title="Daabac">
                        <i data-lucide="printer" class="w-4 h-4"></i>
                    </button>
                </td>
                ${workingDays.map(date => {
                const status = recordsMap.get(date) || 'none';
                return `
                    <td class="p-1 border-l border-gray-50 text-center">
                        <button onclick="renderAttendance.toggleStatus('${s.id}', '${date}', this)" 
                            data-status="${status}"
                            class="w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all transform active:scale-90 ${this.getStatusClass(status)}">
                            ${this.getStatusIcon(status)}
                        </button>
                    </td>`;
            }).join('')}
            </tr>`;
        }).join('');

        lucide.createIcons();
        this.updateStats();
    },

    getStatusClass(status) {
        switch (status) {
            case 'present': return 'bg-green-500 text-white shadow-lg shadow-green-100';
            case 'absent': return 'bg-red-500 text-white shadow-lg shadow-red-100';
            case 'late': return 'bg-yellow-500 text-white shadow-lg shadow-yellow-100';
            default: return 'bg-gray-100 text-gray-300 hover:bg-gray-200';
        }
    },

    getStatusIcon(status) {
        switch (status) {
            case 'present': return '<i data-lucide="check" class="w-5 h-5"></i>';
            case 'absent': return '<i data-lucide="x" class="w-5 h-5"></i>';
            case 'late': return '<i data-lucide="clock" class="w-5 h-5"></i>';
            default: return '<i data-lucide="minus" class="w-4 h-4"></i>';
        }
    },

    toggleStatus(studentId, date, btn) {
        const statuses = ['none', 'present', 'absent', 'late'];
        let currentStatus = btn.dataset.status || 'none';
        let nextIndex = (statuses.indexOf(currentStatus) + 1) % statuses.length;
        if (nextIndex === 0) nextIndex = 1;

        const nextStatus = statuses[nextIndex];
        btn.dataset.status = nextStatus;
        btn.className = `w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all transform active:scale-90 ${this.getStatusClass(nextStatus)}`;
        btn.innerHTML = this.getStatusIcon(nextStatus);
        lucide.createIcons();
        this.updateStats();
    },

    updateStats() {
        const buttons = document.querySelectorAll('#attendance-table button[data-status]');
        let p = 0, a = 0, l = 0;
        buttons.forEach(btn => {
            const s = btn.dataset.status;
            if (s === 'present') p++;
            else if (s === 'absent') a++;
            else if (s === 'late') l++;
        });

        document.getElementById('att-count-present').innerText = p;
        document.getElementById('att-count-absent').innerText = a;
        document.getElementById('att-count-late').innerText = l;
    },

    async save() {
        const btn = document.querySelector('button[onclick="renderAttendance.save()"]');
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
            btn.disabled = true;
        }

        const month = document.getElementById('attendance-month').value;
        const year = document.getElementById('attendance-year').value;
        const workingDays = this.getWorkingDays(year, month);

        // Remove ALL records for THIS MONTH first
        store.attendance = store.attendance.filter(rec => {
            const d = new Date(rec.date);
            return !(d.getMonth() === Number(month) && d.getFullYear() === Number(year));
        });

        const rows = document.querySelectorAll('#attendance-table tbody tr');
        rows.forEach(row => {
            const idDiv = row.querySelector('.text-id-strip');
            if (!idDiv) return;
            const studentId = idDiv.innerText.split('ID: ')[1].trim();
            const buttons = row.querySelectorAll('button[data-status]');

            buttons.forEach((btn, index) => {
                const date = workingDays[index];
                const status = btn.dataset.status;

                if (status !== 'none') {
                    store.attendance.push({
                        id: Math.random().toString(36).substr(2, 9),
                        date: date,
                        studentId: studentId,
                        status: status
                    });
                }
            });
        });

        await store.save('attendance');

        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
        lucide.createIcons();
        alert('Xaadirintii waa la keydiyay!');
        renderDashboard.render();
    },

    print() {
        const monthSelect = document.getElementById('attendance-month');
        const monthName = monthSelect.options[monthSelect.selectedIndex].text;
        const year = document.getElementById('attendance-year').value;
        const workingDays = this.getWorkingDays(year, monthSelect.value);

        const printFrame = document.getElementById('print-frame');

        const headerDaysHtml = workingDays.map(date => {
            const num = date.split('-')[2];
            const day = new Date(date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
            return `<th style="padding: 5px; border: 1px solid #e5e7eb; font-size: 10px; text-align: center; background: #f9fafb;">${day}<br>${num}</th>`;
        }).join('');

        const rowsHtml = store.students.map((s, idx) => {
            const rowRecords = store.attendance.filter(a => a.studentId === s.id && workingDays.includes(a.date));
            const recordsMap = new Map(rowRecords.map(r => [r.date, r.status]));

            const cellsHtml = workingDays.map(date => {
                const status = recordsMap.get(date) || '';
                let mark = '';
                let color = '#ccc';
                if (status === 'present') { mark = 'P'; color = '#22c55e'; }
                else if (status === 'absent') { mark = 'A'; color = '#ef4444'; }
                else if (status === 'late') { mark = 'L'; color = '#f59e0b'; }

                return `<td style="padding: 5px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${color}; font-size: 12px;">${mark}</td>`;
            }).join('');

            return `
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 11px;">${idx + 1}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 11px; font-weight: bold;">${s.name}</td>
                    ${cellsHtml}
                </tr>
            `;
        }).join('');

        printFrame.innerHTML = `
            <div class="print-card" style="padding: 20px; border-width: 4px;">
                <div class="print-header" style="margin: 10px 0;">
                     <div class="print-logo-text" style="font-size: 30px;">AL-WAFAAA</div>
                     <div class="print-subtitle" style="font-size: 16px; padding: 5px 20px;">Monthly Attendance: ${monthName} ${year}</div>
                </div>
                
                <div class="print-content-box" style="margin: 0; padding: 10px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="padding: 5px; border: 1px solid #e5e7eb; font-size: 10px; text-align: left; background: #f3f4f6;">#</th>
                                <th style="padding: 5px; border: 1px solid #e5e7eb; font-size: 10px; text-align: left; background: #f3f4f6;">Ardayga (Student)</th>
                                ${headerDaysHtml}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>

                <div style="margin-top: 20px; display: flex; justify-content: space-around; font-size: 10px; color: #666;">
                    <div>P: Present (Jooga)</div>
                    <div>A: Absent (Maqan)</div>
                    <div>L: Leave (Fasax)</div>
                </div>
                
                <div class="print-footer" style="padding: 30px 20px;">
                     <div class="signature-box" style="width: 200px;">
                         <div class="signature-line" style="width: 100%;"></div>
                         <div class="signature-title">Class Teacher</div>
                     </div>
                      <div class="signature-box" style="width: 200px;">
                         <div class="signature-line" style="width: 100%;"></div>
                         <div class="signature-title">Principal</div>
                     </div>
                </div>
            </div>
        `;

        window.print();
    },

    printIndividual(studentId) {
        const s = store.students.find(s => s.id === studentId);
        if (!s) return;

        const monthSelect = document.getElementById('attendance-month');
        const monthValue = monthSelect.value;
        const monthName = monthSelect.options[monthSelect.selectedIndex].text;
        const year = document.getElementById('attendance-year').value;
        const workingDays = this.getWorkingDays(year, monthValue);

        const records = store.attendance.filter(a => a.studentId === studentId && workingDays.includes(a.date));
        const recordsMap = new Map(records.map(r => [r.date, r.status]));

        let p = 0, a = 0, l = 0;
        const rowsHtml = workingDays.map(date => {
            const status = recordsMap.get(date) || 'none';
            let label = '-', color = '#9ca3af';
            if (status === 'present') { label = 'JOOGA'; color = '#16a34a'; p++; }
            else if (status === 'absent') { label = 'MAQAN'; color = '#dc2626'; a++; }
            else if (status === 'late') { label = 'FASAX'; color = '#ca8a04'; l++; }

            const d = new Date(date).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' });
            return `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 12px; font-size: 14px; color: #374151;">${d}</td>
                    <td style="padding: 12px; font-size: 14px; font-weight: bold; color: ${color}; text-align: right;">${label}</td>
                </tr>
            `;
        }).join('');

        const printFrame = document.getElementById('print-frame');
        printFrame.innerHTML = `
            <div class="print-card" style="padding: 40px; border-width: 8px;">
                <div class="print-header">
                     <div class="print-logo-text">AL-WAFAAA</div>
                     <div class="print-subtitle">Monthly Report / Warbixinta Bisha</div>
                     <div style="margin-top: 20px; font-size: 20px; font-weight: bold; color: #111827;">${s.name}</div>
                     <div style="font-size: 14px; color: #6b7280; font-family: monospace;">ID: ${s.id} | ${s.classLevel || '-'}</div>
                     <div style="margin-top: 10px; font-size: 16px; color: #4f46e5; font-weight: bold;">${monthName} ${year}</div>
                </div>
                
                <div class="print-content-box" style="margin-top: 20px;">
                    <div style="display: flex; gap: 15px; margin-bottom: 30px;">
                         <div style="flex: 1; text-align: center; padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; border-bottom: 4px solid #16a34a;">
                            <div style="font-size: 12px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Jooga</div>
                            <div style="font-size: 28px; font-weight: 900; color: #16a34a;">${p}</div>
                         </div>
                         <div style="flex: 1; text-align: center; padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; border-bottom: 4px solid #dc2626;">
                            <div style="font-size: 12px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Maqan</div>
                            <div style="font-size: 28px; font-weight: 900; color: #dc2626;">${a}</div>
                         </div>
                         <div style="flex: 1; text-align: center; padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; border-bottom: 4px solid #ca8a04;">
                            <div style="font-size: 12px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Fasax</div>
                            <div style="font-size: 28px; font-weight: 900; color: #ca8a04;">${l}</div>
                         </div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #4f46e5;">
                                <th style="padding: 10px; text-align: left; font-size: 12px; color: #4f46e5; text-transform: uppercase;">Maalinta</th>
                                <th style="padding: 10px; text-align: right; font-size: 12px; color: #4f46e5; text-transform: uppercase;">Xaaladda</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>

                <div class="print-footer" style="padding-top: 60px;">
                     <div class="signature-box">
                         <div class="signature-line" style="width: 250px;"></div>
                         <div class="signature-title">Class Teacher</div>
                     </div>
                      <div class="signature-box">
                         <div class="signature-line" style="width: 250px;"></div>
                         <div class="signature-title">Principal</div>
                     </div>
                </div>
            </div>
        `;

        window.print();
    }
};

// --- Exam Logic ---
const renderExams = {
    currentType: null,

    init() {
        this.showMenu();
    },

    showMenu() {
        document.getElementById('exam-menu-view').classList.remove('hidden');
        document.getElementById('exam-marksheet-view').classList.add('hidden');
        this.currentType = null;
    },

    openExam(type) {
        this.currentType = type;
        const menuView = document.getElementById('exam-menu-view');
        const marksheetView = document.getElementById('exam-marksheet-view');
        const titleEl = document.getElementById('marksheet-title');

        menuView.classList.add('hidden');
        marksheetView.classList.remove('hidden');

        // Reset styling
        marksheetView.classList.remove('quiz-theme');
        const headerRow = document.querySelector('#marksheet-table thead');
        headerRow.classList.remove('bg-orange-50/80', 'bg-gray-50/80');

        const titles = {
            'bille1': 'Exam Bille 1',
            'term': 'Exam Term (Teeramka)',
            'bille2': 'Exam Bille 2',
            'final': 'Exam Final',
            'quiz': 'Quiz (Imtixaan Gaaban)'
        };

        titleEl.innerText = titles[type] || 'Exam';

        // Styling for Quiz
        if (type === 'quiz') {
            marksheetView.classList.add('quiz-theme');
            headerRow.classList.add('bg-orange-50/80'); // Orange header for quiz
            headerRow.classList.remove('bg-gray-50/80');
            titleEl.classList.add('text-orange-600');
            titleEl.classList.remove('text-gray-800');
        } else {
            headerRow.classList.add('bg-gray-50/80');
            titleEl.classList.remove('text-orange-600');
            titleEl.classList.add('text-gray-800');
        }

        this.renderMarksheet();
        this.updateStats();
        lucide.createIcons();
    },

    renderMarksheet() {
        // Dashboard Stats Element Injection (if not exists)
        const view = document.getElementById('exam-marksheet-view');
        let statsContainer = view.querySelector('.exam-stats-dashboard');

        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.className = 'grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 exam-stats-dashboard';
            statsContainer.innerHTML = `
                <div class="glass-card p-6 rounded-3xl border border-white/20">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-bold text-blue-500 uppercase tracking-wider">Wadarta Imtixaanadka</p>
                            <h3 class="text-3xl font-black text-gray-800 mt-1" id="stat-total-score">0</h3>
                        </div>
                        <div class="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                            <i data-lucide="file-text" class="w-6 h-6"></i>
                        </div>
                    </div>
                </div>
                <div class="glass-card p-6 rounded-3xl border border-white/20">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-bold text-green-500 uppercase tracking-wider">Celceliska (Avg)</p>
                            <h3 class="text-3xl font-black text-gray-800 mt-1" id="stat-avg-score">0%</h3>
                        </div>
                        <div class="p-3 bg-green-50 text-green-600 rounded-2xl">
                            <i data-lucide="trending-up" class="w-6 h-6"></i>
                        </div>
                    </div>
                </div>
                <div class="glass-card p-6 rounded-3xl border border-white/20">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-bold text-purple-500 uppercase tracking-wider">Heerka Grade</p>
                            <h3 class="text-3xl font-black text-gray-800 mt-1" id="stat-top-score">-</h3>
                        </div>
                        <div class="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                            <i data-lucide="award" class="w-6 h-6"></i>
                        </div>
                    </div>
                </div>
            `;
            // Insert after title
            const header = view.querySelector('.flex.flex-col.md\\:flex-row');
            if (header) header.parentNode.insertBefore(statsContainer, header.nextSibling);
            lucide.createIcons();
        }

        // Render Table Headers (Dynamic)
        const thead = document.querySelector('#marksheet-table thead');
        const isQuiz = this.currentType === 'quiz';
        const headerClass = isQuiz ? 'text-orange-900' : 'text-gray-500';
        const focusClass = isQuiz ? 'focus:border-orange-500 focus:ring-orange-500' : 'focus:border-indigo-500 focus:ring-indigo-500';

        thead.innerHTML = `
            <tr>
                <th class="p-4 text-xs font-bold ${headerClass} uppercase tracking-wider w-16">ID</th>
                <th class="p-4 text-xs font-bold ${headerClass} uppercase tracking-wider w-64">Magaca Ardayga</th>
                ${Array(8).fill(0).map((_, i) => `
                    <th class="p-2 text-center text-xs font-bold ${headerClass} uppercase tracking-wider">
                        <div class="flex flex-col items-center gap-1">
                            <input type="checkbox" id="subject-checkbox-${i}" class="subject-print-checkbox w-4 h-4 text-indigo-600 rounded" checked>
                            <input type="text" placeholder="M${i + 1}" class="w-full bg-transparent border-b border-transparent hover:border-gray-300 ${focusClass} outline-none text-center font-bold placeholder-gray-400 text-xs transition-colors" id="header-subject-${i}">
                        </div>
                    </th>
                `).join('')}
                <th class="p-4 text-center text-xs font-black ${isQuiz ? 'text-orange-600 bg-orange-50' : 'text-indigo-600 bg-indigo-50'} uppercase tracking-wider">Total</th>
                <th class="p-4 text-center text-xs font-bold ${headerClass} uppercase tracking-wider">Avg</th>
                <th class="p-4 text-center text-xs font-bold ${headerClass} uppercase tracking-wider">Grade</th>
                <th class="p-4 text-center text-xs font-bold ${headerClass} uppercase tracking-wider">Actions</th>
            </tr>
        `;

        const tbody = document.querySelector('#marksheet-table tbody');
        const students = store.students;

        if (!students.length) {
            tbody.innerHTML = `<tr><td colspan="14" class="p-8 text-center text-gray-400">Ma jiraan arday diiwaangashan.</td></tr>`;
            return;
        }

        tbody.innerHTML = students.map(s => {
            const existing = store.exams.find(e => e.studentId === s.id && e.type === this.currentType) || { scores: Array(8).fill('') };
            const scores = existing.scores || Array(8).fill('');
            const total = scores.reduce((a, b) => a + (Number(b) || 0), 0);

            // Calc Avg and Grade
            const filledScores = scores.filter(sc => sc !== '').length;
            const avg = filledScores > 0 ? (total / 8).toFixed(1) : 0; // Avg over 8 always

            let grade = '-';
            if (filledScores > 0) {
                if (avg >= 90) grade = 'A+';
                else if (avg >= 85) grade = 'A';
                else if (avg >= 75) grade = 'B';
                else if (avg >= 65) grade = 'C';
                else if (avg >= 50) grade = 'D';
                else grade = 'F';
            }

            return `
                <tr class="hover:${isQuiz ? 'bg-orange-50/20' : 'bg-indigo-50/20'} transition-colors border-b border-gray-100 group" data-student-id="${s.id}">
                    <td class="p-4 font-mono text-xs text-gray-400 student-id">${s.id}</td>
                    <td class="p-4 font-bold text-gray-800 student-name">${s.name} <span class="text-xs ${isQuiz ? 'text-orange-500' : 'text-indigo-500'} block font-normal">${s.classLevel || ''}</span></td>
                    ${scores.map((score, i) => `
                        <td class="p-2">
                            <input type="number" 
                                class="score-input w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-center font-bold focus:ring-2 ${isQuiz ? 'focus:ring-orange-500' : 'focus:ring-indigo-500'} focus:bg-white outline-none transition-all" 
                                data-index="${i}"
                                value="${score}" 
                                placeholder="-" 
                                min="0" 
                                oninput="renderExams.calculateRow('${s.id}')">
                        </td>
                    `).join('')}
                    <td class="p-4 text-center font-black ${isQuiz ? 'text-orange-600 bg-orange-50/50' : 'text-indigo-600 bg-indigo-50/50'} total-cell text-lg">${total || 0}</td>
                    <td class="p-4 text-center font-bold text-gray-600 avg-cell">${avg}%</td>
                    <td class="p-4 text-center font-bold text-gray-600 grade-cell">${grade}</td>
                    <td class="p-4 text-center">
                        <button onclick="renderExams.printStudentReport('${s.id}')" class="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-indigo-600 transition-colors shadow-sm" title="Daabac Warbixinta">
                            <i data-lucide="printer" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    calculateRow(studentId) {
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        if (!row) return;

        const inputs = row.querySelectorAll('.score-input');
        let sum = 0;
        let filledCount = 0;

        inputs.forEach(input => {
            if (input.value !== '') {
                sum += Number(input.value) || 0;
                filledCount++;
            }
        });

        const avg = (sum / 8).toFixed(1);

        let grade = '-';
        if (filledCount > 0) {
            if (avg >= 90) grade = 'A+';
            else if (avg >= 85) grade = 'A';
            else if (avg >= 75) grade = 'B';
            else if (avg >= 65) grade = 'C';
            else if (avg >= 50) grade = 'D';
            else grade = 'F';
        }

        row.querySelector('.total-cell').innerText = sum;
        row.querySelector('.avg-cell').innerText = avg + '%';
        row.querySelector('.grade-cell').innerText = grade;
    },

    async saveMarks() {
        const btn = document.querySelector('button[onclick="renderExams.saveMarks()"]');
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = 'Saving...';
            btn.disabled = true;
        }

        if (!this.currentType) return;

        const rows = document.querySelectorAll('#marksheet-table tbody tr');
        let count = 0;

        // Filter out old records for this exact exam type to avoid duplicates?
        // Or better: update existing or push new. 
        // simpler strategy: Remove ALL marks for this type first? No, risky.
        // Better: Update/Upsert by studentId + type.

        rows.forEach(row => {
            const studentId = row.dataset.studentId;
            const inputs = row.querySelectorAll('.score-input');
            const scores = Array.from(inputs).map(inp => inp.value === '' ? '' : Number(inp.value));

            // Only save if at least one score is entered? Or save all even empty to preserve "0"s?
            // If all empty, maybe skip?
            const hasData = scores.some(s => s !== '');

            if (hasData) {
                const total = scores.reduce((a, b) => a + (Number(b) || 0), 0);

                // Find index
                const index = store.exams.findIndex(e => e.studentId === studentId && e.type === this.currentType);

                const record = {
                    id: index > -1 ? store.exams[index].id : 'ex-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                    studentId,
                    type: this.currentType,
                    scores, // Array of 8 values
                    total,
                    date: new Date().toISOString()
                };

                if (index > -1) {
                    store.exams[index] = record;
                } else {
                    store.exams.push(record);
                }
                count++;
            }
        });

        await store.save('exams');

        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
        alert('Dhibcaha imtixaanka waa la keydiyay!');
        this.updateStats();
    },

    updateStats() {
        const currentExams = store.exams.filter(e => e.type === this.currentType);
        const totals = currentExams.map(e => e.total || 0);

        const sum = totals.reduce((a, b) => a + b, 0);
        const count = totals.length || 0;

        // Calculate average
        const avg = count ? (sum / count).toFixed(1) : 0;

        // Calculate Grade based on Average
        let grade = '-';
        if (avg >= 90) grade = 'A+';
        else if (avg >= 85) grade = 'A';
        else if (avg >= 75) grade = 'B';
        else if (avg >= 65) grade = 'C';
        else if (avg >= 50) grade = 'D';
        else if (count > 0) grade = 'F';

        const totalEl = document.getElementById('stat-total-score');
        const avgEl = document.getElementById('stat-avg-score');
        const topEl = document.getElementById('stat-top-score');

        if (totalEl) totalEl.innerText = count;
        if (avgEl) avgEl.innerText = avg;
        if (topEl) topEl.innerText = grade;
    },

    printMarksheet() {
        const title = document.getElementById('marksheet-title').innerText;
        const rows = document.querySelectorAll('#marksheet-table tbody tr');

        // Get selected subjects only
        const selectedSubjects = [];
        const selectedIndices = [];
        for (let i = 0; i < 8; i++) {
            const checkbox = document.getElementById(`subject-checkbox-${i}`);
            const input = document.getElementById(`header-subject-${i}`);
            if (checkbox && checkbox.checked) {
                selectedSubjects.push(input && input.value ? input.value : `M${i + 1}`);
                selectedIndices.push(i);
            }
        }

        let printRows = '';

        rows.forEach(row => {
            if (row.classList.contains('hidden')) return; // Skip filtered rows

            const name = row.querySelector('td:nth-child(2)').innerText.split('\n')[0];
            const allScores = Array.from(row.querySelectorAll('.score-input')).map(i => i.value || '-');

            // Only get scores for selected subjects
            const selectedScores = selectedIndices.map(idx => allScores[idx] || '-');

            const total = row.querySelector('.total-cell').innerText;
            const avgCell = row.querySelector('.avg-cell');
            const gradeCell = row.querySelector('.grade-cell');
            const avg = avgCell ? avgCell.innerText : '-';
            const grade = gradeCell ? gradeCell.innerText : '-';

            printRows += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 8px; border-right: 1px solid #eee;">${name}</td>
                    ${selectedScores.map(s => `<td style="padding: 8px; text-align: center; border-right: 1px solid #eee;">${s}</td>`).join('')}
                    <td style="padding: 8px; text-align: center; font-weight: bold; border-right: 1px solid #eee;">${total}</td>
                    <td style="padding: 8px; text-align: center; border-right: 1px solid #eee;">${avg}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold;">${grade}</td>
                </tr>
            `;
        });

        const printContent = `
            <div style="font-family: sans-serif; padding: 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="margin: 0;">AL-WAFAAA ACADEMY</h1>
                    <h3 style="margin: 5px 0; color: #666;">${title} Report</h3>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #ddd;">
                    <thead style="background: #f3f4f6;">
                        <tr>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ccc;">Student Name</th>
                            ${selectedSubjects.map(s => `<th style="padding: 8px; border-bottom: 2px solid #ccc; text-align: center;">${s}</th>`).join('')}
                            <th style="padding: 8px; border-bottom: 2px solid #ccc;">Total</th>
                            <th style="padding: 8px; border-bottom: 2px solid #ccc;">Avg</th>
                            <th style="padding: 8px; border-bottom: 2px solid #ccc;">Grade</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${printRows}
                    </tbody>
                </table>
                 <div style="margin-top: 30px; display: flex; justify-content: space-between;">
                    <div>Class Teacher: _________________</div>
                    <div>Principal: _________________</div>
                </div>
            </div>
        `;

        const printFrame = document.getElementById('print-frame');
        printFrame.innerHTML = printContent;
        window.print();
    },

    filterMarksheet() {
        const query = document.getElementById('exam-search').value.toLowerCase();
        const rows = document.querySelectorAll('#marksheet-table tbody tr');

        rows.forEach(row => {
            const name = row.querySelector('.student-name').innerText.toLowerCase();
            const id = row.querySelector('.student-id').innerText.toLowerCase();

            if (name.includes(query) || id.includes(query)) {
                row.classList.remove('hidden');
            } else {
                row.classList.add('hidden');
            }
        });
    },

    printStudentReport(studentId) {
        const student = store.students.find(s => s.id === studentId);
        if (!student) return;

        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        if (!row) return;

        const inputs = row.querySelectorAll('.score-input');
        const scores = Array.from(inputs).map(i => i.value);
        const total = row.querySelector('.total-cell').innerText;
        const avg = row.querySelector('.avg-cell').innerText;
        const grade = row.querySelector('.grade-cell').innerText;

        // Get selected subjects only
        const selectedSubjects = [];
        for (let i = 0; i < 8; i++) {
            const checkbox = document.getElementById(`subject-checkbox-${i}`);
            const input = document.getElementById(`header-subject-${i}`);
            if (checkbox && checkbox.checked) {
                selectedSubjects.push({
                    name: input && input.value ? input.value : `Subject ${i + 1}`,
                    score: scores[i] || '-'
                });
            }
        }

        const printFrame = document.getElementById('print-frame');
        printFrame.innerHTML = `
            <style>
                @page { size: A4; margin: 10mm; }
            </style>
            <div class="print-card" style="padding: 30px; border: 2px solid #374151;">
                <!-- Header -->
                <div style="text-align: center; border-bottom: 2px solid #374151; padding-bottom: 15px; margin-bottom: 20px;">
                    <div style="font-size: 28px; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: 1px;">AL-WAFAAA ACADEMY</div>
                    <div style="font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin-top: 3px;">Student Exam Report / Warbixinta Imtixaanka</div>
                </div>

                <!-- Student Info -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; background: #f9fafb; padding: 15px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
                    <div>
                        <div style="font-size: 9px; color: #9ca3af; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Student Name</div>
                        <div style="font-size: 16px; font-weight: 800; color: #111827;">${student.name}</div>
                    </div>
                    <div>
                        <div style="font-size: 9px; color: #9ca3af; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Student ID</div>
                        <div style="font-size: 16px; font-weight: 800; color: #111827; font-family: monospace;">${student.id}</div>
                    </div>
                    <div>
                        <div style="font-size: 9px; color: #9ca3af; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Class Level</div>
                        <div style="font-size: 16px; font-weight: 800; color: #111827;">${student.classLevel || '-'}</div>
                    </div>
                </div>

                <!-- Exam Type -->
                <div style="font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 15px; padding-left: 10px; border-left: 4px solid #f59e0b;">
                    Exam Type: ${this.currentType ? this.currentType.toUpperCase() : 'N/A'}
                </div>

                <!-- Scores Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f3f4f6; border-bottom: 2px solid #374151;">
                            <th style="padding: 10px; text-align: left; font-size: 11px; color: #374151; text-transform: uppercase; font-weight: 700;">Subject</th>
                            <th style="padding: 10px; text-align: center; font-size: 11px; color: #374151; text-transform: uppercase; font-weight: 700;">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${selectedSubjects.map(sub => `
                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                <td style="padding: 10px; font-size: 13px; font-weight: 500; color: #111827;">${sub.name}</td>
                                <td style="padding: 10px; text-align: center; font-size: 14px; font-weight: 700; color: #111827;">${sub.score}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <!-- Summary -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
                    <div style="background: #fff; border: 2px solid #e5e7eb; padding: 15px; text-align: center;">
                        <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 5px;">Total Score</div>
                        <div style="font-size: 24px; font-weight: 900; color: #111827;">${total}</div>
                    </div>
                    <div style="background: #fff; border: 2px solid #e5e7eb; padding: 15px; text-align: center;">
                        <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 5px;">Average</div>
                        <div style="font-size: 24px; font-weight: 900; color: #111827;">${avg}%</div>
                    </div>
                    <div style="background: #fff; border: 2px solid #e5e7eb; padding: 15px; text-align: center;">
                        <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 5px;">Grade</div>
                        <div style="font-size: 24px; font-weight: 900; color: #111827;">${grade}</div>
                    </div>
                </div>

                <!-- Signatures -->
                <div style="display: flex; justify-content: space-between; margin-top: auto; padding-top: 30px;">
                    <div style="text-align: center; width: 200px;">
                        <div style="border-bottom: 2px solid #111827; height: 40px;"></div>
                        <div style="font-size: 11px; font-weight: 800; color: #111827; margin-top: 8px; text-transform: uppercase;">Class Teacher</div>
                    </div>
                    <div style="text-align: center; width: 200px;">
                        <div style="border-bottom: 2px solid #111827; height: 40px;"></div>
                        <div style="font-size: 11px; font-weight: 800; color: #111827; margin-top: 8px; text-transform: uppercase;">Principal</div>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 30px; font-size: 10px; color: #6b7280; font-weight: 600; font-style: italic; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                    Generated on ${new Date().toLocaleDateString()} - Al-Wafaaa Academy Management System
                </div>
            </div>
        `;

        window.print();
    }

};

// --- Classes Logic ---
const renderClasses = {
    levels: [
        "المستوى الأول والثاني",
        "المستوى الثالث والرابع",
        "المستوى الخامس والسادس",
        "المستوى السابع والثامن",
        "المستوى التاسع والعاشر",
        "المستوى الحادي عشر والثاني عشر"
    ],

    init() {
        const grid = document.getElementById('classes-grid');
        const container = document.getElementById('level-students-container');

        // Ensure student list is hidden when showing level cards
        container.classList.add('hidden');
        grid.classList.remove('hidden');

        grid.innerHTML = this.levels.map(level => {
            const count = store.students.filter(s => s.classLevel === level).length;
            return `
                <div onclick="renderClasses.viewLevel('${level}')" 
                     class="glass-card p-8 rounded-3xl border-2 border-white/20 hover:border-indigo-400 hover:shadow-2xl hover:shadow-indigo-200/50 transition-all duration-300 cursor-pointer group relative overflow-hidden">
                    <!-- Background decoration -->
                    <div class="absolute -right-8 -top-8 text-indigo-500/5 group-hover:text-indigo-500/10 transition-all duration-300 transform group-hover:scale-110">
                        <i data-lucide="layout-grid" class="w-48 h-48"></i>
                    </div>
                    <div class="relative z-10 flex flex-col items-center">
                        <div class="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white group-hover:scale-110 transition-all shadow-sm">
                             <i data-lucide="blocks" class="w-10 h-10"></i>
                        </div>
                        <h3 class="text-3xl font-black text-gray-800 mb-2 leading-tight">${level}</h3>
                        <div class="px-4 py-1.5 bg-gray-100/50 rounded-full text-gray-500 font-bold text-sm">
                            ${count} Arday
                        </div>
                    </div>
                </div>
    `;
        }).join('');
        lucide.createIcons();
    },

    viewLevel(levelName) {
        const grid = document.getElementById('classes-grid');
        const container = document.getElementById('level-students-container');
        const tbody = document.querySelector('#level-students-table tbody');
        const title = document.getElementById('current-level-title');

        grid.classList.add('hidden');
        container.classList.remove('hidden');
        title.innerText = `Ardayda Fasalka: ${levelName} `;

        const printBtn = document.getElementById('print-level-btn');
        if (printBtn) printBtn.onclick = () => renderClasses.printLevel(levelName);

        const students = store.students.filter(s => s.classLevel === levelName);

        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-gray-400 font-bold">Ma jiraan arday dhigta heerkan.</td></tr>`;
        } else {
            tbody.innerHTML = students.map(s => `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="p-5 font-bold text-gray-800">${s.name}</td>
                    <td class="p-5 font-mono text-xs text-gray-500">${s.id}</td>
                    <td class="p-5">
                        <span class="px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-[10px] font-bold uppercase">${s.classLevel || '-'}</span>
                    </td>
                    <td class="p-5 text-right">
                        <div class="flex justify-end gap-2">
                            <button onclick="renderStudents.view('${s.id}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                            </button>
                            <button onclick="renderClasses.openAssignModal('${s.id}')" class="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Wareejiso Fasal">
                                <i data-lucide="arrow-right-left" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
    `).join('');
        }
        lucide.createIcons();
    },

    closeLevel() {
        this.init();
    },

    openAssignModal(studentId = null) {
        const student = studentId ? store.students.find(s => s.id === studentId) : null;
        const studentOptions = store.students.map(s =>
            `<option value="${s.id}" ${student && s.id === student.id ? 'selected' : ''}>${s.name} (${s.id})</option>`
        ).join('');

        modal.open(`
                <div class="p-6">
                <h2 class="text-xl font-bold mb-4 text-gray-800">Wareejinta Fasalka</h2>
                <form onsubmit="renderClasses.assignStudent(event)">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Dooro Ardayga</label>
                            <select name="studentId" required class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Dooro Arday</option>
                                ${studentOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Dooro Fasalka Cusub</label>
                            <select name="classLevel" required class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Dooro Fasal</option>
                                ${this.levels.map(level => `<option value="${level}" ${student && student.classLevel === level ? 'selected' : ''}>${level}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <button type="submit" class="w-full mt-6 bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 font-bold shadow-lg transition-all">
                        Wareejiso
                    </button>
                </form>
            </div>
    `);
    },

    assignStudent(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const studentId = formData.get('studentId');
        const classLevel = formData.get('classLevel');

        const student = store.students.find(s => s.id === studentId);
        if (student) {
            student.classLevel = classLevel;
            store.save('students');
            modal.close();
            alert(`${student.name} waxaa loo wareejiyay: ${classLevel} `);
            // Refresh the current view
            this.init();
        }
    },

    printLevel(levelName) {
        const students = store.students.filter(s => s.classLevel === levelName);
        const printFrame = document.getElementById('print-frame');

        const rowsHtml = students.map((s, index) => `
    <tr style = "border-bottom: 1px solid #e5e7eb;" >
                <td style="padding: 12px; font-weight: bold; color: #374151;">${index + 1}</td>
                <td style="padding: 12px; font-weight: bold; color: #111827;">${s.name}</td>
                <td style="padding: 12px; color: #6b7280; font-family: monospace;">${s.id}</td>
                <td style="padding: 12px; color: #7c3aed; font-weight: bold;">${s.classLevel || '-'}</td>
                <td style="padding: 12px; color: #6b7280;">${s.parent}</td>
                <td style="padding: 12px; color: #6b7280; font-family: monospace;">${s.phone}</td>
            </tr>
    `).join('');

        printFrame.innerHTML = `
    <div class="print-card">
                <div class="print-header">
                     <div class="print-logo-text">AL-WAFAAA</div>
                     <div class="print-subtitle">Class Level Report / Warbixinta Fasalka</div>
                     <div style="margin-top: 20px; font-size: 18px; font-weight: bold; color: #4f46e5;">
                        ${levelName}
                     </div>
                     <div style="margin-top: 10px; font-size: 14px; color: #6b7280;">Total Students: ${students.length}</div>
                </div>
                
                <div class="print-content-box">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #4f46e5;">
                                <th style="padding: 10px; color: #4f46e5; text-transform: uppercase; font-size: 12px;">#</th>
                                <th style="padding: 10px; color: #4f46e5; text-transform: uppercase; font-size: 12px;">Name</th>
                                <th style="padding: 10px; color: #4f46e5; text-transform: uppercase; font-size: 12px;">ID</th>
                                <th style="padding: 10px; color: #4f46e5; text-transform: uppercase; font-size: 12px;">Class</th>
                                <th style="padding: 10px; color: #4f46e5; text-transform: uppercase; font-size: 12px;">Parent</th>
                                <th style="padding: 10px; color: #4f46e5; text-transform: uppercase; font-size: 12px;">Phone</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                
                <div class="print-footer">
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Class Teacher / Macalinka Fasalka</div>
                    </div>
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Principal / Maamule</div>
                    </div>
                </div>
            </div>
    `;

        window.print();
    }
};

// --- Finance Logic ---
const renderFinance = {
    list() {
        const tbody = document.querySelector('#finance-table tbody');
        const searchInput = document.getElementById('finance-search');

        // Add search event listener
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filteredFinance = store.finance.filter(f => {
                    const student = f.studentId ? store.students.find(s => s.id === f.studentId) : null;
                    return f.desc.toLowerCase().includes(query) ||
                        f.date.includes(query) ||
                        f.amount.toString().includes(query) ||
                        (student && student.name.toLowerCase().includes(query));
                });
                this.renderTable(filteredFinance);
            });
            searchInput.dataset.listenerAdded = 'true';
        }

        this.renderTable(store.finance);
        this.updateStats();
    },

    renderTable(financeRecords) {
        const tbody = document.querySelector('#finance-table tbody');
        if (!financeRecords.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-400">Weli wax dhaqaale ah ma diiwaangashan</td></tr>`;
        } else {
            // Migration: Ensure all records have IDs
            let hasUpdates = false;
            store.finance.forEach(f => {
                if (!f.id) {
                    f.id = Math.random().toString(36).substr(2, 9);
                    hasUpdates = true;
                }
            });
            if (hasUpdates) store.save('finance');

            tbody.innerHTML = financeRecords.map(f => {
                const isIncome = f.type === 'income';
                const student = f.studentId ? store.students.find(s => s.id === f.studentId) : null;
                return `
                <tr class="hover:bg-gray-50/50 transition-colors border-b border-gray-100 last:border-0 group">
                        <td class="p-4">
                            <div class="font-bold text-gray-700 text-sm">${f.date}</div>
                        </td>
                        <td class="p-4 flex flex-col">
                            <span class="font-medium text-gray-800">${f.desc}</span>
                            <div class="flex gap-2">
                               ${student ? `<span class="text-[9px] text-purple-600 font-bold uppercase">${student.classLevel}</span>` : ''}
                            </div>
                        </td>
                        <td class="p-4 text-center">
                            <span class="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                ${isIncome ? '<i data-lucide="arrow-up-circle" class="w-3 h-3"></i>' : '<i data-lucide="arrow-down-circle" class="w-3 h-3"></i>'}
                                ${isIncome ? 'Dakhli' : 'Kharash'}
                            </span>
                        </td>
                        <td class="p-4 text-right font-bold font-mono text-base ${isIncome ? 'text-green-600' : 'text-red-600'}">
                            ${isIncome ? '+' : '-'}$${Number(f.amount).toLocaleString()}
                        </td>
                        <td class="p-4 text-center flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="renderFinance.printReceipt('${f.id}')" class="p-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-600 hover:text-white transition-all shadow-sm" title="Daabac Receipt">
                                <i data-lucide="printer" class="w-4 h-4"></i>
                            </button>
                            <button onclick="renderFinance.edit('${f.id}')" class="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Badal">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="renderFinance.delete('${f.id}')" class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Tirtir">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </td>
                    </tr>
    `}).join('');
        }
        lucide.createIcons();
        this.updateStats();
    },

    updateStats() {
        const income = store.finance.filter(f => f.type === 'income').reduce((acc, curr) => acc + Number(curr.amount), 0);
        const expense = store.finance.filter(f => f.type === 'expense').reduce((acc, curr) => acc + Number(curr.amount), 0);
        const balance = income - expense;

        document.getElementById('total-income').innerText = `+ $${income.toLocaleString()}`;
        document.getElementById('total-expense').innerText = `- $${expense.toLocaleString()}`;

        const balanceEl = document.getElementById('net-balance');
        balanceEl.innerText = `$${balance.toLocaleString()}`;
        balanceEl.className = `text-3xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`;
    },

    openModal(data = null) {
        const isEdit = !!data;
        modal.open(`
                <div class="p-6">
                <h2 class="text-xl font-bold mb-4 text-gray-800">${isEdit ? 'Badal Xogta Dhaqaalaha' : 'Diiwaangali Dhaqaale'}</h2>
                <form onsubmit="renderFinance.save(event, '${data?.id || ''}')">
                    <div class="grid grid-cols-1 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Nooca</label>
                            <select name="type" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="income" ${data?.type === 'income' ? 'selected' : ''}>Dakhli (Income)</option>
                                <option value="expense" ${data?.type === 'expense' ? 'selected' : ''}>Kharash (Expense)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Lacagta ($)</label>
                            <input name="amount" type="number" step="0.01" value="${data?.amount || ''}" placeholder="0.00" required class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Dhaqaalaha u xiran (Student - Optional)</label>
                            <select name="studentId" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Ma jiro (General)</option>
                                ${store.students.map(s => `<option value="${s.id}" ${data?.studentId === s.id ? 'selected' : ''}>${s.name} (${s.id})</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Faahfaahin</label>
                            <input name="desc" value="${data?.desc || ''}" placeholder="Tusaale: Lacagta Ardayda" required class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-1">Taariikhda</label>
                            <input name="date" type="date" required value="${data?.date || new Date().toISOString().split('T')[0]}" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                    </div>
                    <button type="submit" class="w-full mt-6 bg-orange-500 text-white p-3 rounded-xl hover:bg-orange-600 font-bold shadow-lg shadow-orange-200 transition-all">
                        ${isEdit ? 'Save Changes' : 'Keydi'}
                    </button>
                </form>
            </div>
    `);
    },

    async save(e, id = '') {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        btn.disabled = true;

        const formData = new FormData(e.target);
        const entry = Object.fromEntries(formData.entries());

        if (id) {
            // Edit existing
            const index = store.finance.findIndex(f => f.id === id);
            if (index !== -1) {
                store.finance[index] = { ...entry, id }; // Persist ID
            }
        } else {
            // New entry
            entry.id = Math.random().toString(36).substr(2, 9);
            store.finance.push(entry);
        }

        await store.save('finance');
        modal.close();
        this.list();
    },

    edit(id) {
        const item = store.finance.find(f => f.id === id);
        if (item) this.openModal(item);
    },

    delete(id) {
        if (confirm('Ma hubtaa inaad tirtirto xogtan?')) {
            store.finance = store.finance.filter(f => f.id !== id);
            store.save('finance');
            this.list();
        }
    },

    print() {
        const printFrame = document.getElementById('print-frame');

        let income = 0, expense = 0;
        const rowsHtml = store.finance.map((f, index) => {
            const amt = Number(f.amount);
            if (f.type === 'income') income += amt; else expense += amt;

            const isIncome = f.type === 'income';
            return `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px; color: #374151;">${f.date}</td>
                    <td style="padding: 10px; font-weight: bold; color: #111827;">
                        ${f.desc}
                        ${f.studentId ? `<br><span style="font-size: 9px; color: #7c3aed;">[Fasalka: ${store.students.find(s => s.id === f.studentId)?.classLevel || '-'}]</span>` : ''}
                    </td>
                    <td style="padding: 10px; text-align: center;">
                        <span style="background: ${isIncome ? '#dcfce7' : '#fee2e2'}; color: ${isIncome ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase;">
                            ${isIncome ? 'Dakhli' : 'Kharash'}
                        </span>
                    </td>
                    <td style="padding: 10px; text-align: right; font-weight: bold; font-family: monospace; color: ${isIncome ? '#16a34a' : '#dc2626'};">
                        ${isIncome ? '+' : '-'}$${amt.toLocaleString()}
                    </td>
                </tr>
    `;
        }).join('');

        const balance = income - expense;

        printFrame.innerHTML = `
                <div class="print-card">
                <div class="print-header">
                     <div class="print-logo-text">AL-WAFAAA</div>
                     <div class="print-subtitle">Financial Report / Warbixinta Dhaqaalaha</div>
                     <div style="margin-top: 10px; font-size: 14px; color: #6b7280;">Printed on: ${new Date().toLocaleDateString()}</div>
                </div>
                
                <div class="print-content-box">
                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <div style="flex: 1; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; border-left: 4px solid #22c55e;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Total Income</div>
                            <div style="font-size: 20px; font-weight: 900; color: #16a34a;">+$${income.toLocaleString()}</div>
                        </div>
                        <div style="flex: 1; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; border-left: 4px solid #ef4444;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Total Expense</div>
                            <div style="font-size: 20px; font-weight: 900; color: #dc2626;">-$${expense.toLocaleString()}</div>
                        </div>
                        <div style="flex: 1; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; border-left: 4px solid #3b82f6;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Net Balance</div>
                            <div style="font-size: 20px; font-weight: 900; color: ${balance >= 0 ? '#2563eb' : '#dc2626'};">$${balance.toLocaleString()}</div>
                        </div>
                    </div>

                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #374151;">
                                <th style="padding: 10px; color: #374151; text-transform: uppercase; font-size: 11px;">Date</th>
                                <th style="padding: 10px; color: #374151; text-transform: uppercase; font-size: 11px;">Description</th>
                                <th style="padding: 10px; color: #374151; text-transform: uppercase; font-size: 11px; text-align: center;">Type</th>
                                <th style="padding: 10px; color: #374151; text-transform: uppercase; font-size: 11px; text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                
                <div class="print-footer">
                     <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Financial Officer / Xisaabiye</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-title">Principal / Maamule</div>
                    </div>
                </div>
            </div>
    `;

        window.print();
    },

    printReceipt(id) {
        const item = store.finance.find(f => f.id === id);
        if (!item) return;

        const student = item.studentId ? store.students.find(s => s.id === item.studentId) : null;
        const isIncome = item.type === 'income';
        const printFrame = document.getElementById('print-frame');

        printFrame.innerHTML = `
                <div class="print-card" style="padding: 40px; border: 2px solid #374151;">
                <!--Header -->
                <div style="text-align: center; border-bottom: 2px solid #374151; padding-bottom: 20px; margin-bottom: 30px;">
                    <div style="font-size: 32px; font-weight: 900; color: #111827; letter-spacing: 2px; margin-bottom: 5px;">AL-WAFAAA ACADEMY</div>
                    <div style="font-size: 16px; color: #4b5563; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Official Receipt / Cadeynta Lacag Bixinta</div>
                </div>

                <!--Info Grid-->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
                    <div>
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 800; margin-bottom: 4px;">Receipt No / Lambarka</div>
                        <div style="font-size: 18px; font-weight: 700; color: #111827; font-family: monospace;">#${item.id}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 800; margin-bottom: 4px;">Date / Taariikh</div>
                        <div style="font-size: 18px; font-weight: 700; color: #111827;">${item.date}</div>
                    </div>
                    <div style="grid-column: span 2; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 800; margin-bottom: 4px;">Name / Magaca</div>
                        <div style="font-size: 24px; font-weight: 800; color: #111827;">${student ? student.name : 'General (Maamulka)'}</div>
                    </div>
                    <div style="grid-column: span 2; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 800; margin-bottom: 4px;">Description / Faahfaahin</div>
                        <div style="font-size: 18px; font-weight: 600; color: #374151;">${item.desc}</div>
                    </div>
                </div>

                <!--Amount Box-->
                <div style="border: 2px solid #374151; padding: 30px; text-align: center; margin-bottom: 50px; background: #f9fafb;">
                    <div style="font-size: 14px; color: #374151; text-transform: uppercase; font-weight: 800; margin-bottom: 10px;">Amount Paid / Lacagta</div>
                    <div style="font-size: 48px; font-weight: 900; color: #111827;">
                        ${isIncome ? '+' : '-'}$${Number(item.amount).toLocaleString()}
                    </div>
                    <div style="font-size: 16px; color: #4b5563; font-weight: bold; margin-top: 5px;">
                        Status: ${isIncome ? 'Dakhli (Income)' : 'Kharash (Expense)'}
                    </div>
                </div>

                <!--Signatures -->
                <div style="display: flex; justify-content: space-between; margin-top: auto; padding-top: 40px;">
                    <div style="text-align: center; width: 250px;">
                        <div style="border-bottom: 2px solid #111827; height: 50px;"></div>
                        <div style="font-size: 12px; font-weight: 800; color: #111827; margin-top: 10px; text-transform: uppercase;">Financial Officer / Xisaabiye</div>
                    </div>
                    <div style="text-align: center; width: 250px;">
                        <div style="border-bottom: 2px solid #111827; height: 50px;"></div>
                        <div style="font-size: 12px; font-weight: 800; color: #111827; margin-top: 10px; text-transform: uppercase;">Principal / Maamule</div>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 60px; font-size: 11px; color: #6b7280; font-weight: bold; font-style: italic; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                    Mahadsanid! Thank you for choosing Al-Wafaaa Academy.
                </div>
            </div>
    `;

        window.print();
    }
};

// --- Reports Logic ---
const renderReports = {
    init() {
        // Just ensures icons are rendered when view loads
        lucide.createIcons();
    },

    preview(type) {
        let title = '';
        let content = '';

        if (type === 'students') {
            title = 'Hor-u-dhaca Warbixinta Ardayda';
            const rows = store.students.map((s, i) => `
                <tr class="border-b border-gray-100">
                    <td class="p-3">${i + 1}</td>
                    <td class="p-3 font-bold">${s.name}</td>
                    <td class="p-3 text-[10px] text-purple-600 font-bold">${s.classLevel || '-'}</td>
                    <td class="p-3 text-xs text-gray-500">${s.id}</td>
                    <td class="p-3 text-xs">${s.phone}</td>
                </tr>
    `).join('');
            content = `
                <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600"><tr><th class="p-3">#</th><th class="p-3">Magaca</th><th class="p-3">Fasalka</th><th class="p-3">ID</th><th class="p-3">Tel</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        } else if (type === 'teachers') {
            title = 'Hor-u-dhaca Warbixinta Macalimiinta';
            const rows = store.teachers.map((t, i) => `
                <tr class="border-b border-gray-100">
                    <td class="p-3">${i + 1}</td>
                    <td class="p-3 font-bold">${t.name}</td>
                    <td class="p-3 text-xs text-gray-500">${t.id}</td>
                    <td class="p-3 text-xs">${t.phone}</td>
                </tr>
            `).join('');
            content = `
                <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600"><tr><th class="p-3">#</th><th class="p-3">Magaca</th><th class="p-3">ID</th><th class="p-3">Tel</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        } else if (type === 'finance') {
            title = 'Hor-u-dhaca Warbixinta Dhaqaalaha';
            const rows = store.finance.map(f => {
                const student = f.studentId ? store.students.find(s => s.id === f.studentId) : null;
                return `
                    <tr class="border-b border-gray-100">
                        <td class="p-3 text-xs">${f.date}</td>
                        <td class="p-3 flex flex-col">
                            <span class="font-bold">${f.desc}</span>
                            <div class="flex gap-1">
                                ${student ? `<span class="text-[9px] text-purple-600 font-bold lowercase">${student.classLevel}</span>` : ''}
                            </div>
                        </td>
                        <td class="p-3 text-xs ${f.type === 'income' ? 'text-green-600' : 'text-red-600'} font-bold uppercase">${f.type === 'income' ? 'Dakhli' : 'Kharash'}</td>
                        <td class="p-3 text-right font-mono">${f.type === 'income' ? '+' : '-'}$${Number(f.amount).toLocaleString()}</td>
                    </tr>`;
            }).join('');
            content = `
                <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600"><tr><th class="p-3">Taariikh</th><th class="p-3">Faahfaahin</th><th class="p-3">Nooca</th><th class="p-3 text-right">Lacagta</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        } else if (type === 'attendance') {
            title = 'Hor-u-dhaca Xaadirinta (Maanta)';
            const today = new Date().toISOString().split('T')[0];
            const records = store.attendance.filter(a => a.date === today);
            const map = new Map(records.map(r => [r.studentId, r.status]));

            const rows = store.students.map((s, i) => {
                const status = map.get(s.id) || 'present';
                let color = 'text-green-600';
                if (status === 'absent') color = 'text-red-600';
                if (status === 'late') color = 'text-yellow-600';
                return `
                    <tr class="border-b border-gray-100">
                        <td class="p-3">${i + 1}</td>
                        <td class="p-3 font-bold">${s.name}</td>
                        <td class="p-3 text-[10px] text-purple-600 font-bold">${s.classLevel || '-'}</td>
                        <td class="p-3 text-xs font-bold uppercase ${color}">${status}</td>
                    </tr>`;
            }).join('');
            content = `
                <div class="mb-3 text-xs font-bold text-gray-500">Taariikh: ${today}</div>
                <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600"><tr><th class="p-3">#</th><th class="p-3">Magaca</th><th class="p-3">Fasalka</th><th class="p-3">Xaalada</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        } else if (type === 'exams') {
            title = 'Hor-u-dhaca Warbixinta Imtixaanaadka';
            const rows = store.exams.map((e, i) => {
                const student = store.students.find(s => s.id === e.studentId);
                const percentage = (e.score / e.total) * 100;
                return `
                    <tr class="border-b border-gray-100">
                        <td class="p-3">${i + 1}</td>
                        <td class="p-3 font-bold">${student ? student.name : 'Unknown'}</td>
                        <td class="p-3 text-xs">${e.subject}</td>
                        <td class="p-3 text-right font-mono font-bold">${e.score}/${e.total} (${percentage.toFixed(0)}%)</td>
                    </tr>`;
            }).join('');
            content = `
                <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600"><tr><th class="p-3">#</th><th class="p-3">Ardayga</th><th class="p-3">Maaddada</th><th class="p-3 text-right">Natiijada</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        }

        modal.open(`
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-800">${title}</h2>
                    <button onclick="modal.close()" class="p-1 hover:bg-gray-100 rounded-lg"><i data-lucide="x" class="w-5 h-5 text-gray-500"></i></button>
                </div>
                <div class="max-h-[60vh] overflow-y-auto border rounded-xl mb-6">
                    ${content || '<div class="p-4 text-center text-gray-400">Wax xog ah ma jiraan.</div>'}
                </div>
                <div class="flex gap-3">
                    <button onclick="renderReports.print('${type}')" class="flex-1 bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 font-bold flex items-center justify-center gap-2">
                        <i data-lucide="printer" class="w-4 h-4"></i> Daabac Hadda
                    </button>
                    <button onclick="modal.close()" class="flex-1 bg-gray-100 text-gray-700 p-3 rounded-xl hover:bg-gray-200 font-bold">Xir</button>
                </div>
            </div>
    `);
        lucide.createIcons();
    },

    print(type) {
        if (type === 'students') {
            renderStudents.printList();
        } else if (type === 'teachers') {
            renderTeachers.printList();
        } else if (type === 'finance') {
            renderFinance.print();
        } else if (type === 'attendance') {
            renderAttendance.print();
        } else if (type === 'exams') {
            renderExams.print();
        }
    }
};

// --- Reporting (PDF) ---
const generatePDF = {
    students() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont("helvetica", "bold");
        doc.text("Al-wafaaa Academy - Liiska Ardayda", 105, 20, null, null, "center");

        const head = [['ID', 'Magaca', 'Fasalka', 'Waalidka', 'Tel']];
        const body = store.students.map(s => [s.id, s.name, s.classLevel, s.parent, s.phone]);

        doc.autoTable({
            startY: 30,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] } // Blue
        });

        doc.save("Al-wafaaa_Students.pdf");
    },

    teachers() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont("helvetica", "bold");
        doc.text("Al-wafaaa Academy - Macalimiinta", 105, 20, null, null, "center");

        const head = [['ID', 'Magaca', 'Tel', 'Email']];
        const body = store.teachers.map(t => [t.id, t.name, t.phone, t.email]);

        doc.autoTable({
            startY: 30,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] } // Green
        });

        doc.save("Al-wafaaa_Teachers.pdf");
    },

    finance() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont("helvetica", "bold");
        doc.text("Al-wafaaa Academy - Warbixinta Dhaqaalaha", 105, 20, null, null, "center");

        const head = [['Taariikh', 'Faahfaahin', 'Nooca', 'Lacagta']];
        const body = store.finance.map(f => [f.date, f.desc, f.type, `$${f.amount} `]);

        doc.autoTable({
            startY: 30,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [249, 115, 22] } // Orange
        });

        doc.save("Al-wafaaa_Finance.pdf");
    }
};

// --- Init ---
// --- Authentication & Permissions ---
const auth = {
    // Role Definitions
    PASSWORDS: {
        admin: '1234',
        teacher: '1234',
        accountant: '1234'
    },

    perms: {
        admin: ['*'], // Access All
        teacher: ['students', 'attendance', 'reports', 'exams', 'classes'], // REMOVED dashboard
        accountant: ['finance', 'reports'] // REMOVED dashboard
    },

    login(e) {
        e.preventDefault();
        const role = document.getElementById('login-role').value;
        const pass = document.getElementById('login-pass').value.trim().toLowerCase(); // Trim whitespace and convert to lowercase
        const errorEl = document.getElementById('login-error');

        // Case insensitive check
        if (auth.PASSWORDS[role] === pass) {
            // Success
            store.currentUser = { role, name: role.charAt(0).toUpperCase() + role.slice(1) };
            store.save('currentUser');

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');

            errorEl.classList.add('hidden');

            // Adjust UI for Role
            this.applyPermissions(role);

            // Redirect based on role
            if (role === 'teacher') {
                router.navigate('students');
            } else if (role === 'accountant') {
                router.navigate('finance');
            } else {
                router.navigate('dashboard');
            }
            ['report-card-students', 'report-card-teachers', 'report-card-finance', 'report-card-attendance', 'report-card-exams'].forEach(show);
            ['btn-quick-student', 'btn-quick-finance', 'btn-quick-attendance', 'btn-quick-exams'].forEach(show);

            if (role === 'teacher') {
                // Hide Dashboard Link
                hide('nav-dashboard');
                hide('nav-finance');
                hide('nav-teachers');

                // Hide specific Report Cards
                hide('report-card-teachers');
                hide('report-card-finance');
            } else if (role === 'accountant') {
                hide('nav-dashboard'); // Hide Dashboard for Accountant too
                hide('nav-students');
                hide('nav-teachers');
                hide('nav-attendance');
                hide('nav-exams');
                hide('nav-classes');

                // Hide specific Report Cards for Accountant
                hide('report-card-students');
                hide('report-card-teachers');
                hide('report-card-attendance');
                hide('report-card-exams');

                // Hide Dashboard Quick Actions
                hide('btn-quick-student');
                hide('btn-quick-attendance');
                hide('btn-quick-exams');
            }
        },

        checkAccess(pageId) {
            const user = store.currentUser;
            if (!user) return false;
            if (user.role === 'admin') return true;

            const allowed = this.perms[user.role];
            return allowed.includes(pageId);
        }
    };

    // Check for existing session (Optional, but good for refresh)
    // For now, we force login on reload as per typical simple app request, but we can uncomment this if needed.
    /*
    if (localStorage.getItem('wa_currentUser')) {
        store.currentUser = JSON.parse(localStorage.getItem('wa_currentUser'));
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        auth.applyPermissions(store.currentUser.role);
    }
    */
    // Make auth global explicitly to ensure HTML onclick/onsubmit can find it
    window.auth = auth;
    window.renderDashboard = renderDashboard;
    window.renderStudents = renderStudents;
    window.renderTeachers = renderTeachers;
    window.renderFinance = renderFinance;
    window.renderAttendance = renderAttendance;
    window.renderReports = renderReports;
    window.renderClasses = renderClasses;
    window.router = router;

    // --- Init ---
    // Attach Login Listener safely
    const loginForm = document.getElementById('login-form');
    if(loginForm) {
        loginForm.addEventListener('submit', (e) => auth.login(e));
    }

        router.navigate('dashboard');
    lucide.createIcons();
