let authToken = localStorage.getItem('authToken') || '';
let currentUser = null;
let currentTab = 'agents';

// Super Admin Pagination & Search States
let orgsPage = 1, orgsTotalPages = 1, orgsSearchQuery = '', orgsSearchTimeout = null;
let superUsersPage = 1, superUsersTotalPages = 1, superUsersSearchQuery = '', superUsersSearchTimeout = null;
let auditPage = 1, auditTotalPages = 1, auditSearchQuery = '', auditSearchTimeout = null;

// Org Users Pagination
let orgUsersPage = 1, orgUsersTotalPages = 1;

// --- UI Loading & Double-Click Protection Helpers ---
function setButtonLoading(btn, isLoading, customText = null) {
    if (!btn) return;
    if (typeof btn === 'string') btn = document.getElementById(btn);
    if (!btn) return;

    if (isLoading) {
        if (!btn.dataset.originalHtml) {
            btn.dataset.originalHtml = btn.innerHTML;
        }
        btn.disabled = true;
        btn.classList.add('btn-loading');
        const text = customText || 'Processing...';
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" style="margin-right:6px;"></i> ${text}`;
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
    }
}

function showTableLoading(tbodyId, colSpan = 7, message = 'Loading data...') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="${colSpan}">
                <div class="table-loading-box">
                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                    <div>${escapeHtml(message)}</div>
                </div>
            </td>
        </tr>
    `;
}

function showGridLoading(gridId, message = 'Loading records...') {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = `
        <div class="grid-loading-box">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <div>${escapeHtml(message)}</div>
        </div>
    `;
}

// Global double-click guard for action/submit buttons (skips utility toggles)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .btn');
    if (btn && !btn.classList.contains('no-debounce') && btn.id !== 'hamburger-btn') {
        if (btn.disabled || btn.dataset.clicking === 'true') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        btn.dataset.clicking = 'true';
        setTimeout(() => {
            delete btn.dataset.clicking;
        }, 800);
    }
}, true);

function updateAuthUI() {
    const authBar = document.getElementById('user-auth-bar');
    const navLinks = document.getElementById('main-nav-links');
    if (!authBar || !navLinks) return;

    if (currentUser) {
        const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
        const isAdmin = currentUser.role === 'ADMIN';

        // Build Role-Based Navigation
        if (isSuperAdmin) {
            navLinks.innerHTML = `
                        <button class="nav-btn" onclick="switchTab('platform-overview', this)"><i class="fa-solid fa-chart-line"></i> Overview</button>
                        <button class="nav-btn" onclick="switchTab('organizations', this)"><i class="fa-solid fa-sitemap"></i> Organizations</button>
                        <button class="nav-btn" onclick="switchTab('super-users', this)"><i class="fa-solid fa-users-gear"></i> Users</button>
                        <button class="nav-btn" onclick="switchTab('audit-logs', this)"><i class="fa-solid fa-shield-halved"></i> Audit Logs</button>
                    `;
        } else {
            let userTab = isAdmin ? `<button class="nav-btn" onclick="switchTab('org-users', this)"><i class="fa-solid fa-users"></i> Users</button>` : '';
            navLinks.innerHTML = `
                        <button class="nav-btn" onclick="switchTab('agents', this)"><i class="fa-solid fa-robot"></i> AI Agents</button>
                        <button class="nav-btn" onclick="switchTab('leads', this)"><i class="fa-solid fa-file-excel"></i> Leads & Upload</button>
                        <button class="nav-btn" onclick="switchTab('campaigns', this)"><i class="fa-solid fa-phone-volume"></i> Campaigns</button>
                        <button class="nav-btn" onclick="switchTab('logs', this)"><i class="fa-solid fa-list-check"></i> Transcripts & Logs</button>
                        ${userTab}
                    `;
        }

        const roleBadgeClass = isSuperAdmin ? 'background:#ef4444; color:white;' : 'background:rgba(99,102,241,0.2); color:#a5b4fc;';
        authBar.innerHTML = `
                    <span class="badge" style="font-size:0.8rem; padding:0.4rem 0.8rem; ${roleBadgeClass}">
                        <i class="fa-solid ${isSuperAdmin ? 'fa-crown' : 'fa-user-shield'}"></i> ${escapeHtml(currentUser.name)} (${currentUser.role})
                    </span>
                    <button class="btn btn-danger" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
                `;
        closeModal('login-modal');
    } else {
        navLinks.innerHTML = '';
        authBar.innerHTML = `
                    <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="openLoginModal()"><i class="fa-solid fa-lock"></i> Sign In</button>
                `;
        openLoginModal();
    }
}

function clearDataUI() {
    const grid = document.getElementById('agents-grid');
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2.5rem; color:var(--text-sub);"><i class="fa-solid fa-lock" style="font-size:2rem; margin-bottom:0.75rem; display:block;"></i> Please sign in to view AI Sales Agents.</div>';
    const leadsBody = document.getElementById('leads-table-body');
    if (leadsBody) leadsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-sub);"><i class="fa-solid fa-lock" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i> Please sign in to view Leads.</td></tr>';
    const logsBody = document.getElementById('logs-table-body');
    if (logsBody) logsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-sub);"><i class="fa-solid fa-lock" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i> Please sign in to view Call Logs.</td></tr>';
}

async function fetchCurrentUser() {
    if (!authToken) return false;
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.data.user;
            updateAuthUI();
            return true;
        }
    } catch (e) { }
    authToken = '';
    currentUser = null;
    localStorage.removeItem('authToken');
    updateAuthUI();
    return false;
}
async function loginUser(email, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            // Fully clear any previous session before applying new one
            authToken = '';
            currentUser = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('activeTab');

            authToken = data.data.token;
            localStorage.setItem('authToken', authToken);
            currentUser = data.data.user;
            updateAuthUI();
            showToast(`Welcome back, ${currentUser.name}!`, 'success');

            // Always go to the correct default tab for the logged-in role
            const defaultTab = currentUser.role === 'SUPER_ADMIN' ? 'platform-overview' : 'agents';
            switchTab(defaultTab);
            return true;
        } else {
            const msg = data.error?.message || data.error || 'Login failed';
            showToast(msg, 'error');
        }
    } catch (err) {
        showToast('Login network error', 'error');
    }
    return false;
}


document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    await loginUser(email, password);
};

async function quickLoginSuperAdmin() {
    await loginUser('superadmin@voiceai.com', 'SuperAdmin@123');
}

async function quickLoginAdmin() {
    await loginUser('admin@voiceai.com', 'Admin@123456');
}

function logout() {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('authToken');
    clearDataUI();
    updateAuthUI();
    showToast('Logged out successfully', 'info');
    openLoginModal();
}

function openLoginModal() {
    openModal('login-modal');
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function authFetch(url, options = {}) {
    if (!authToken) {
        clearDataUI();
        openLoginModal();
        showToast('Authentication required. Please sign in.', 'warning');
        return { json: async () => ({ success: false, error: 'Unauthenticated' }) };
    }
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        const errCode = data.error?.code || '';
        const errMsg = data.error?.message || data.error || 'Session unauthorized';

        if (errCode === 'ORGANIZATION_SUSPENDED' || errCode === 'USER_SUSPENDED') {
            showToast(errMsg, 'error');
        } else {
            authToken = '';
            currentUser = null;
            localStorage.removeItem('authToken');
            clearDataUI();
            updateAuthUI();
            openLoginModal();
            showToast(errMsg, 'warning');
        }
    }
    return res;
}

function switchTab(tabId, targetEl = null) {
    currentTab = tabId;
    localStorage.setItem('activeTab', tabId);
    if (history.pushState) {
        history.pushState(null, null, '#' + tabId);
    } else {
        location.hash = tabId;
    }

    // Auto-close mobile navigation menu drawer when selecting a tab
    const navLinksEl = document.getElementById('main-nav-links');
    const authBarEl = document.getElementById('user-auth-bar');
    const hamburgerBtnEl = document.getElementById('hamburger-btn');
    if (navLinksEl && navLinksEl.classList.contains('mobile-active')) {
        navLinksEl.classList.remove('mobile-active');
        if (authBarEl) authBarEl.classList.remove('mobile-active');
        if (hamburgerBtnEl) hamburgerBtnEl.classList.remove('active');
    }

    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    const activeTabContent = document.getElementById(`tab-${tabId}`);
    if (activeTabContent) activeTabContent.classList.add('active');

    const btn = targetEl || document.querySelector(`.nav-btn[onclick*="'${tabId}'"]`);
    if (btn) btn.classList.add('active');

    // Hide/Show Org Metrics bar on Super Admin views
    const orgMetricsBar = document.getElementById('org-metrics-bar');
    if (orgMetricsBar) {
        orgMetricsBar.style.display = (tabId.startsWith('platform') || tabId === 'organizations' || tabId === 'super-users' || tabId === 'audit-logs') ? 'none' : 'grid';
    }

    if (!currentUser || !authToken) {
        clearDataUI();
        openLoginModal();
        return;
    }

    // Route tab actions
    if (tabId === 'platform-overview') loadPlatformStats();
    if (tabId === 'organizations') loadOrganizations();
    if (tabId === 'super-users') loadSuperUsers();
    if (tabId === 'audit-logs') loadAuditLogs();
    if (tabId === 'org-users') loadOrgUsers();
    if (tabId === 'agents') loadAgents();
    if (tabId === 'leads') { loadAgents(); loadLeads(); }
    if (tabId === 'campaigns') { loadAgents(); loadCampaigns(); }
    if (tabId === 'logs') loadLogs();
}

// ---------------------------------------------------------------------
// SUPER ADMIN API CALLS & FRONTEND RENDERERS
// ---------------------------------------------------------------------

async function loadPlatformStats() {
    const res = await authFetch('/api/super-admin/stats');
    const result = await res.json();
    if (!result.success) return;

    const s = result.data;
    document.getElementById('sa-total-orgs').textContent = s.totalOrgs;
    document.getElementById('sa-orgs-breakdown').textContent = `Active: ${s.activeOrgs} | Suspended: ${s.suspendedOrgs}`;
    document.getElementById('sa-total-users').textContent = s.totalUsers;
    document.getElementById('sa-total-agents').textContent = s.totalAgents;
    document.getElementById('sa-total-leads').textContent = s.totalLeads;
    document.getElementById('sa-calls-today').textContent = s.callsToday;
    document.getElementById('sa-calls-month').textContent = `This Month: ${s.callsThisMonth}`;
    document.getElementById('sa-total-cost').textContent = `$${s.totalPlatformCost.toFixed(2)}`;

    document.getElementById('sa-interested-leads').textContent = s.interestedLeads;
    document.getElementById('sa-followup-leads').textContent = s.followUpLeads;
    document.getElementById('sa-dnc-leads').textContent = s.dncLeads;
}

async function loadOrganizations() {
    const status = document.getElementById('filter-orgs-status').value;
    const plan = document.getElementById('filter-orgs-plan').value;

    let url = `/api/super-admin/organizations?page=${orgsPage}&limit=15`;
    if (orgsSearchQuery) url += `&search=${encodeURIComponent(orgsSearchQuery)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (plan) url += `&plan=${encodeURIComponent(plan)}`;

    const res = await authFetch(url);
    const result = await res.json();
    if (!result.success) return;

    const orgs = result.data || [];
    const pagination = result.pagination || { page: 1, pages: 1, total: orgs.length };
    orgsPage = pagination.page;
    orgsTotalPages = pagination.pages || 1;

    document.getElementById('orgs-pagination-info').textContent = `Showing page ${orgsPage} of ${orgsTotalPages} (${pagination.total} total orgs)`;
    document.getElementById('orgs-prev-btn').disabled = orgsPage <= 1;
    document.getElementById('orgs-next-btn').disabled = orgsPage >= orgsTotalPages;

    const tbody = document.getElementById('orgs-table-body');
    tbody.innerHTML = '';

    orgs.forEach(o => {
        const statusBadge = o.status === 'active'
            ? `<span class="badge badge-completed">Active</span>`
            : `<span class="badge badge-not-interested">Suspended</span>`;

        tbody.innerHTML += `
                    <tr>
                        <td><b>${escapeHtml(o.name)}</b><br><span style="font-size:0.75rem; color:var(--text-sub);">${escapeHtml(o.companyName || '')}</span></td>
                        <td>${escapeHtml(o.adminEmail || o.email || 'Unassigned')}</td>
                        <td><b>${o.usersCount}</b> / ${o.limits?.maxUsers || 50}</td>
                        <td>${o.agentsCount}</td>
                        <td><b>${o.leadsCount}</b> / ${o.limits?.maxLeads || 100000}</td>
                        <td><span class="badge badge-pending">${escapeHtml(o.plan || 'enterprise')}</span></td>
                        <td>${statusBadge}</td>
                        <td>
                            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                                <button class="btn btn-primary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="viewOrgDetails('${o.id}')"><i class="fa-solid fa-eye"></i> View</button>
                                ${o.status === 'active'
                ? `<button class="btn btn-warning" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="suspendOrg('${o.id}')"><i class="fa-solid fa-ban"></i> Suspend</button>`
                : `<button class="btn btn-success" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="activateOrg('${o.id}')"><i class="fa-solid fa-check"></i> Activate</button>`
            }
                                <button class="btn btn-danger" style="padding:0.3rem 0.5rem; font-size:0.75rem;" onclick="deleteOrg('${o.id}')"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>
                `;
    });
}

function onOrgsSearchChange() {
    clearTimeout(orgsSearchTimeout);
    orgsSearchTimeout = setTimeout(() => {
        orgsSearchQuery = document.getElementById('search-orgs-input').value.trim();
        orgsPage = 1;
        loadOrganizations();
    }, 300);
}

function changeOrgsPage(delta) {
    orgsPage = Math.max(1, Math.min(orgsTotalPages, orgsPage + delta));
    loadOrganizations();
}

function openCreateOrgModal() {
    document.getElementById('create-org-form').reset();
    openModal('create-org-modal');
}

document.getElementById('create-org-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('create-org-name').value.trim();
    const companyName = document.getElementById('create-org-company').value.trim();
    const email = document.getElementById('create-org-email').value.trim();
    const phone = document.getElementById('create-org-phone').value.trim();
    const plan = document.getElementById('create-org-plan').value;
    const maxUsers = parseInt(document.getElementById('create-org-max-users').value, 10) || 50;
    const maxLeads = parseInt(document.getElementById('create-org-max-leads').value, 10) || 100000;
    const maxConcurrentCalls = parseInt(document.getElementById('create-org-max-concurrent').value, 10) || 10;

    const adminName = document.getElementById('create-org-admin-name').value.trim();
    const adminEmail = document.getElementById('create-org-admin-email').value.trim();
    const adminPassword = document.getElementById('create-org-admin-password').value.trim();

    let initialAdmin = null;
    if (adminEmail && adminPassword) {
        initialAdmin = { name: adminName || 'Organization Admin', email: adminEmail, password: adminPassword };
    }

    showToast('Creating Organization...', 'info');
    const res = await authFetch('/api/super-admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name, companyName, email, phone, plan,
            limits: { maxUsers, maxLeads, maxConcurrentCalls },
            initialAdmin
        })
    });
    const data = await res.json();
    if (data.success) {
        showToast(`Organization '${name}' created successfully!`, 'success');
        closeModal('create-org-modal');
        loadOrganizations();
    } else {
        showToast(data.error?.message || data.error || 'Failed to create organization', 'error');
    }
};

async function viewOrgDetails(orgId) {
    const res = await authFetch(`/api/super-admin/organizations/${orgId}`);
    const data = await res.json();
    if (!data.success) return;

    const o = data.data.organization;
    const s = data.data.stats;
    const users = data.data.users || [];
    const agents = data.data.agents || [];

    document.getElementById('org-details-title').textContent = `${o.name} (${o.plan.toUpperCase()})`;

    const body = document.getElementById('org-details-body');
    body.innerHTML = `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:0.75rem; margin-bottom:1.25rem;">
                    <div style="background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:10px; border:1px solid var(--card-border);">Users: <b>${s.usersCount}</b> / ${o.limits?.maxUsers}</div>
                    <div style="background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:10px; border:1px solid var(--card-border);">Agents: <b>${s.agentsCount}</b></div>
                    <div style="background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:10px; border:1px solid var(--card-border);">Leads: <b>${s.leadsCount}</b></div>
                    <div style="background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:10px; border:1px solid var(--card-border);">Calls: <b>${s.callsCount}</b></div>
                    <div style="background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:10px; border:1px solid var(--card-border);">Cost: <b style="color:var(--accent);">$${s.totalCost.toFixed(2)}</b></div>
                </div>

                <h4><i class="fa-solid fa-users"></i> Organization Users</h4>
                <ul style="color:var(--text-sub); font-size:0.85rem; margin:0.5rem 0 1rem 1.2rem;">
                    ${users.map(u => `<li><b>${escapeHtml(u.name)}</b> (${escapeHtml(u.email)}) — <span class="badge badge-completed">${u.role}</span></li>`).join('') || 'No users yet.'}
                </ul>

                <h4><i class="fa-solid fa-robot"></i> AI Sales Agents</h4>
                <ul style="color:var(--text-sub); font-size:0.85rem; margin:0.5rem 0 1rem 1.2rem;">
                    ${agents.map(a => `<li><b>${escapeHtml(a.name)}</b> (${escapeHtml(a.company)}) — Goal: ${escapeHtml(a.call_goal)}</li>`).join('') || 'No agents created yet.'}
                </ul>
            `;
    openModal('org-details-modal');
}

async function suspendOrg(orgId) {
    showToast('Suspending Organization...', 'warning');
    const res = await authFetch(`/api/super-admin/organizations/${orgId}/suspend`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast('Organization suspended', 'success');
        loadOrganizations();
    } else {
        showToast(data.error?.message || data.error || 'Failed to suspend', 'error');
    }
}

async function activateOrg(orgId) {
    showToast('Activating Organization...', 'info');
    const res = await authFetch(`/api/super-admin/organizations/${orgId}/activate`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast('Organization activated!', 'success');
        loadOrganizations();
    } else {
        showToast(data.error?.message || data.error || 'Failed to activate', 'error');
    }
}

async function deleteOrg(orgId) {
    if (!confirm('Are you sure you want to soft delete this organization?')) return;
    showToast('Deleting Organization...', 'warning');
    const res = await authFetch(`/api/super-admin/organizations/${orgId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
        showToast('Organization soft deleted', 'success');
        loadOrganizations();
    } else {
        showToast(data.error?.message || data.error || 'Failed to delete', 'error');
    }
}

async function loadSuperUsers() {
    const orgId = document.getElementById('filter-users-org').value;
    const role = document.getElementById('filter-users-role').value;
    const status = document.getElementById('filter-users-status').value;

    let url = `/api/super-admin/users?page=${superUsersPage}&limit=15`;
    if (superUsersSearchQuery) url += `&search=${encodeURIComponent(superUsersSearchQuery)}`;
    if (orgId) url += `&organizationId=${encodeURIComponent(orgId)}`;
    if (role) url += `&role=${encodeURIComponent(role)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    const res = await authFetch(url);
    const result = await res.json();
    if (!result.success) return;

    const users = result.data || [];
    const pagination = result.pagination || { page: 1, pages: 1, total: users.length };
    superUsersPage = pagination.page;
    superUsersTotalPages = pagination.pages || 1;

    document.getElementById('users-pagination-info').textContent = `Showing page ${superUsersPage} of ${superUsersTotalPages} (${pagination.total} total users)`;
    document.getElementById('users-prev-btn').disabled = superUsersPage <= 1;
    document.getElementById('users-next-btn').disabled = superUsersPage >= superUsersTotalPages;

    const tbody = document.getElementById('super-users-table-body');
    tbody.innerHTML = '';

    users.forEach(u => {
        const statusBadge = u.status === 'active'
            ? `<span class="badge badge-completed">Active</span>`
            : `<span class="badge badge-not-interested">Suspended</span>`;
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never';

        tbody.innerHTML += `
                    <tr>
                        <td><b>${escapeHtml(u.name)}</b></td>
                        <td>${escapeHtml(u.email)}</td>
                        <td>${escapeHtml(u.organizationName || u.organizationId || 'Platform')}</td>
                        <td><span class="badge badge-pending">${u.role}</span></td>
                        <td>${statusBadge}</td>
                        <td><span style="font-size:0.75rem; color:var(--text-sub);">${lastLogin}</span></td>
                        <td>
                            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                                ${u.status === 'active'
                ? `<button class="btn btn-warning" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="suspendUserPlatform('${u.id}')"><i class="fa-solid fa-ban"></i> Suspend</button>`
                : `<button class="btn btn-success" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="activateUserPlatform('${u.id}')"><i class="fa-solid fa-check"></i> Activate</button>`
            }
                                <button class="btn btn-primary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="openResetPasswordModal('${u.id}', '${u.email}')"><i class="fa-solid fa-key"></i> Password</button>
                            </div>
                        </td>
                    </tr>
                `;
    });

    // Populate Org Filter dropdown if empty — limit=200 prevents unbounded fetch
    const orgSelect = document.getElementById('filter-users-org');
    if (orgSelect && orgSelect.options.length <= 1) {
        const orgsRes = await authFetch('/api/super-admin/organizations?limit=200');
        const orgsData = await orgsRes.json();
        if (orgsData.success) {
            orgSelect.innerHTML = '<option value="">All Organizations</option>';
            (orgsData.data || []).forEach(o => {
                orgSelect.innerHTML += `<option value="${o.id}">${escapeHtml(o.name)}</option>`;
            });
        }
    }
}

function onUsersSearchChange() {
    clearTimeout(superUsersSearchTimeout);
    superUsersSearchTimeout = setTimeout(() => {
        superUsersSearchQuery = document.getElementById('search-users-input').value.trim();
        superUsersPage = 1;
        loadSuperUsers();
    }, 300);
}

function changeSuperUsersPage(delta) {
    superUsersPage = Math.max(1, Math.min(superUsersTotalPages, superUsersPage + delta));
    loadSuperUsers();
}

async function openCreateUserModal() {
    document.getElementById('create-user-form').reset();
    const roleSelect = document.getElementById('create-user-role-select');
    const superAdminOpt = document.getElementById('role-option-super-admin');
    const orgGroup = document.getElementById('create-user-org-group');

    if (currentUser && currentUser.role === 'SUPER_ADMIN') {
        superAdminOpt.style.display = 'block';
        orgGroup.style.display = 'block';

        const orgSelect = document.getElementById('create-user-org-select');
        const res = await authFetch('/api/super-admin/organizations');
        const data = await res.json();
        if (data.success) {
            orgSelect.innerHTML = '<option value="">None (Platform Super Admin)</option>';
            (data.data || []).forEach(o => {
                orgSelect.innerHTML += `<option value="${o.id}">${escapeHtml(o.name)}</option>`;
            });
        }
    } else {
        superAdminOpt.style.display = 'none';
        orgGroup.style.display = 'none';
    }

    openModal('create-user-modal');
}

document.getElementById('create-user-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('create-user-name').value.trim();
    const email = document.getElementById('create-user-email').value.trim();
    const password = document.getElementById('create-user-password').value.trim();
    const role = document.getElementById('create-user-role-select').value;
    const organizationId = document.getElementById('create-user-org-select').value;

    if (role === 'SUPER_ADMIN') {
        if (!confirm('SECURITY CONFIRMATION: Are you sure you want to create a new PLATFORM SUPER ADMIN account?')) return;
    }

    showToast('Creating User Account...', 'info');
    const endpoint = (currentUser && currentUser.role === 'SUPER_ADMIN') ? '/api/super-admin/users' : '/api/users';
    const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, organizationId })
    });
    const data = await res.json();
    if (data.success) {
        showToast(`User '${name}' created successfully!`, 'success');
        closeModal('create-user-modal');
        if (currentUser.role === 'SUPER_ADMIN') loadSuperUsers();
        else loadOrgUsers();
    } else {
        showToast(data.error?.message || data.error || 'Failed to create user', 'error');
    }
};

async function suspendUserPlatform(userId) {
    showToast('Suspending User...', 'warning');
    const endpoint = (currentUser && currentUser.role === 'SUPER_ADMIN') ? `/api/super-admin/users/${userId}/suspend` : `/api/users/${userId}/suspend`;
    const res = await authFetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast('User account suspended', 'success');
        if (currentUser.role === 'SUPER_ADMIN') loadSuperUsers();
        else loadOrgUsers();
    } else {
        showToast(data.error?.message || data.error || 'Failed to suspend user', 'error');
    }
}

async function activateUserPlatform(userId) {
    showToast('Activating User...', 'info');
    const endpoint = (currentUser && currentUser.role === 'SUPER_ADMIN') ? `/api/super-admin/users/${userId}/activate` : `/api/users/${userId}/activate`;
    const res = await authFetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast('User account activated!', 'success');
        if (currentUser.role === 'SUPER_ADMIN') loadSuperUsers();
        else loadOrgUsers();
    } else {
        showToast(data.error?.message || data.error || 'Failed to activate user', 'error');
    }
}

function openResetPasswordModal(userId, email) {
    document.getElementById('reset-password-form').reset();
    document.getElementById('reset-password-user-id').value = userId;
    document.getElementById('reset-password-email').value = email;
    openModal('reset-password-modal');
}

document.getElementById('reset-password-form').onsubmit = async (e) => {
    e.preventDefault();
    const userId = document.getElementById('reset-password-user-id').value;
    const newPassword = document.getElementById('reset-password-input').value.trim();

    showToast('Resetting Password...', 'info');
    const endpoint = (currentUser && currentUser.role === 'SUPER_ADMIN') ? `/api/super-admin/users/${userId}/reset-password` : `/api/users/${userId}/reset-password`;
    const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (data.success) {
        showToast('User password reset successfully!', 'success');
        closeModal('reset-password-modal');
    } else {
        showToast(data.error?.message || data.error || 'Failed to reset password', 'error');
    }
};

async function loadAuditLogs() {
    let url = `/api/super-admin/audit-logs?page=${auditPage}&limit=20`;
    if (auditSearchQuery) url += `&search=${encodeURIComponent(auditSearchQuery)}`;

    const res = await authFetch(url);
    const result = await res.json();
    if (!result.success) return;

    const logs = result.data || [];
    const pagination = result.pagination || { page: 1, pages: 1, total: logs.length };
    auditPage = pagination.page;
    auditTotalPages = pagination.pages || 1;

    document.getElementById('audit-pagination-info').textContent = `Showing page ${auditPage} of ${auditTotalPages} (${pagination.total} audit logs)`;
    document.getElementById('audit-prev-btn').disabled = auditPage <= 1;
    document.getElementById('audit-next-btn').disabled = auditPage >= auditTotalPages;

    const tbody = document.getElementById('audit-table-body');
    tbody.innerHTML = '';

    logs.forEach(l => {
        const ts = new Date(l.timestamp || l.createdAt).toLocaleString();
        tbody.innerHTML += `
                    <tr>
                        <td><span style="font-size:0.75rem; color:var(--text-sub);">${ts}</span></td>
                        <td><b>${escapeHtml(l.userEmail || 'System')}</b></td>
                        <td><span class="badge badge-completed">${escapeHtml(l.action)}</span></td>
                        <td>${escapeHtml(l.resource)}</td>
                        <td><code>${escapeHtml(l.resourceId || '-')}</code></td>
                        <td>${escapeHtml(l.ip || '-')}</td>
                    </tr>
                `;
    });
}

function onAuditSearchChange() {
    clearTimeout(auditSearchTimeout);
    auditSearchTimeout = setTimeout(() => {
        auditSearchQuery = document.getElementById('search-audit-input').value.trim();
        auditPage = 1;
        loadAuditLogs();
    }, 300);
}

function changeAuditPage(delta) {
    auditPage = Math.max(1, Math.min(auditTotalPages, auditPage + delta));
    loadAuditLogs();
}

async function loadOrgUsers() {
    const res = await authFetch(`/api/users?page=${orgUsersPage}&limit=20`);
    const result = await res.json();
    if (!result.success) return;

    const users = result.data || [];
    const pagination = result.pagination || { page: 1, pages: 1, total: users.length };
    orgUsersPage = pagination.page;
    orgUsersTotalPages = pagination.pages || 1;

    // Render pagination info (inject if elements exist)
    const paginationEl = document.getElementById('org-users-pagination-info');
    if (paginationEl) paginationEl.textContent = `Page ${orgUsersPage} of ${orgUsersTotalPages} (${pagination.total} total)`;
    const prevBtn = document.getElementById('org-users-prev-btn');
    const nextBtn = document.getElementById('org-users-next-btn');
    if (prevBtn) prevBtn.disabled = orgUsersPage <= 1;
    if (nextBtn) nextBtn.disabled = orgUsersPage >= orgUsersTotalPages;

    const tbody = document.getElementById('org-users-table-body');
    tbody.innerHTML = '';

    users.forEach(u => {
        const statusBadge = u.status === 'active'
            ? `<span class="badge badge-completed">Active</span>`
            : `<span class="badge badge-not-interested">Suspended</span>`;
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never';

        tbody.innerHTML += `
                    <tr>
                        <td><b>${escapeHtml(u.name)}</b></td>
                        <td>${escapeHtml(u.email)}</td>
                        <td><span class="badge badge-pending">${u.role}</span></td>
                        <td>${statusBadge}</td>
                        <td><span style="font-size:0.75rem; color:var(--text-sub);">${lastLogin}</span></td>
                        <td>
                            <div style="display:flex; gap:0.35rem;">
                                ${u.status === 'active'
                ? `<button class="btn btn-warning" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="suspendUserPlatform('${u.id}')"><i class="fa-solid fa-ban"></i> Suspend</button>`
                : `<button class="btn btn-success" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="activateUserPlatform('${u.id}')"><i class="fa-solid fa-check"></i> Activate</button>`
            }
                                <button class="btn btn-primary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="openResetPasswordModal('${u.id}', '${u.email}')"><i class="fa-solid fa-key"></i> Password</button>
                            </div>
                        </td>
                    </tr>
                `;
    });
}

function changeOrgUsersPage(delta) {
    orgUsersPage = Math.max(1, Math.min(orgUsersTotalPages, orgUsersPage + delta));
    loadOrgUsers();
}

// Toast Notification Helper
function showToast(message, type = 'success') {
    const bgColors = {
        success: 'linear-gradient(to right, #10b981, #059669)',
        error: 'linear-gradient(to right, #ef4444, #dc2626)',
        warning: 'linear-gradient(to right, #f59e0b, #d97706)',
        info: 'linear-gradient(to right, #6366f1, #4f46e5)'
    };
    Toastify({
        text: message,
        duration: 3500,
        gravity: 'top',
        position: 'right',
        stopOnFocus: true,
        style: {
            background: bgColors[type] || bgColors.info,
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            fontWeight: '500',
            fontSize: '0.9rem'
        }
    }).showToast();
}

// Phone number validator
function validatePhone(phone) {
    if (!phone) return false;
    const clean = String(phone).replace(/[\s\-\(\)]/g, '');
    return /^\+?[1-9]\d{7,14}$/.test(clean);
}

// Download Excel/CSV Lead Template
async function downloadSampleTemplate(format = 'xlsx') {
    try {
        showToast(`Preparing sample ${format.toUpperCase()} template...`, 'info');
        const res = await authFetch(`/api/leads/template?format=${format}`);
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(data.error?.message || 'Failed to download template', 'error');
            return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `leads_sample_template.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Sample template downloaded successfully!', 'success');
    } catch (err) {
        showToast('Error downloading template: ' + err.message, 'error');
    }
}
window.downloadSampleTemplate = downloadSampleTemplate;

// Handle Excel File Select
function handleFileSelect(input) {
    if (input.files.length > 0) {
        document.getElementById('file-label').textContent = input.files[0].name;
        showToast(`Selected file: ${input.files[0].name}`, 'info');
    }
}
window.handleFileSelect = handleFileSelect;

// Upload Excel Form
document.getElementById('upload-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const fileInput = document.getElementById('file-input');
    const agentSelect = document.getElementById('upload-agent-select');

    if (!agentSelect.value) {
        showToast('Please select an assigned AI agent first', 'warning');
        return;
    }
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Please select an Excel (.xlsx) or CSV (.csv) file to upload', 'warning');
        return;
    }

    setButtonLoading(btn, true, 'Uploading...');
    try {
        const formData = new FormData();
        formData.append('agent_id', agentSelect.value);
        formData.append('file', fileInput.files[0]);

        showToast('Uploading and parsing leads...', 'info');

        const res = await authFetch('/api/leads/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            const msg = data.data?.message || data.message || 'Leads uploaded successfully!';
            showToast(msg, 'success');
            switchTab('leads');
        } else {
            const err = data.error?.message || data.error || 'Upload failed';
            showToast(err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
};

// Manual Lead Form
document.getElementById('manual-lead-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const agentId = document.getElementById('manual-agent-select').value;
    const name = document.getElementById('manual-name').value.trim();
    const phone = document.getElementById('manual-phone').value.trim();
    const interest = document.getElementById('manual-interest').value.trim();

    if (!name || name.length < 2) {
        showToast('Customer name must be at least 2 characters', 'warning');
        return;
    }
    if (!validatePhone(phone)) {
        showToast('Invalid phone number! Must include country code (e.g. +917780922090)', 'error');
        return;
    }

    setButtonLoading(btn, true, 'Adding Lead...');
    try {
        const payload = { agent_id: agentId, lead_name: name, lead_phone: phone, lead_interest: interest };

        const res = await authFetch('/api/leads/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Lead ${escapeHtml(name)} added successfully!`, 'success');
            document.getElementById('manual-lead-form').reset();
            loadLeads();
        } else {
            const err = data.error?.message || data.error || 'Failed to add lead';
            showToast(err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
};

function renderSentimentBadge(sentiment = 'Pending', doNotCall = false) {
    if (doNotCall) return `<span class="badge badge-not-interested"><i class="fa-solid fa-ban"></i> DNC / Opt-Out</span>`;
    if (sentiment === 'Interested') return `<span class="badge badge-interested"><i class="fa-solid fa-thumbs-up"></i> Interested</span>`;
    if (sentiment === 'Not Interested') return `<span class="badge badge-not-interested"><i class="fa-solid fa-thumbs-down"></i> Not Interested</span>`;
    if (sentiment === 'Follow Up Needed') return `<span class="badge badge-follow-up"><i class="fa-solid fa-clock"></i> Follow Up</span>`;
    return `<span class="badge badge-pending">Pending</span>`;
}

let leadsPage = 1, leadsTotalPages = 1, leadsSearchQuery = '', leadsDncOnly = false, leadsSearchTimeout = null;
let logsPage = 1, logsTotalPages = 1;

async function loadLeads() {
    showTableLoading('leads-table-body', 7, 'Loading leads database...');
    const agentId = document.getElementById('filter-agent-leads').value;
    let url = `/api/leads?page=${leadsPage}&limit=25`;
    if (agentId) url += `&agent_id=${encodeURIComponent(agentId)}`;
    if (leadsSearchQuery) url += `&search=${encodeURIComponent(leadsSearchQuery)}`;
    if (leadsDncOnly) url += `&dnc=true`;

    const res = await authFetch(url);
    const result = await res.json();
    if (!result.success) return;

    const leadsList = Array.isArray(result.data) ? result.data : (result.leads || []);
    const pagination = result.pagination || { page: 1, pages: 1, total: leadsList.length };
    leadsPage = pagination.page;
    leadsTotalPages = pagination.pages || 1;

    document.getElementById('leads-pagination-info').textContent = `Showing page ${leadsPage} of ${leadsTotalPages} (${pagination.total} total leads)`;
    document.getElementById('leads-prev-btn').disabled = leadsPage <= 1;
    document.getElementById('leads-next-btn').disabled = leadsPage >= leadsTotalPages;

    const tbody = document.getElementById('leads-table-body');
    tbody.innerHTML = '';

    if (leadsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-sub);">No leads found.</td></tr>';
        return;
    }

    leadsList.forEach(lead => {
        const date = new Date(lead.created_at || lead.createdAt).toLocaleDateString();
        const score = lead.leadScore || 0;
        tbody.innerHTML += `
                    <tr>
                        <td><b>${escapeHtml(lead.lead_name)}</b></td>
                        <td>${escapeHtml(lead.lead_phone)}</td>
                        <td>${escapeHtml(lead.lead_interest)}</td>
                        <td><span class="badge badge-${lead.status}">${escapeHtml(lead.status)}</span></td>
                        <td>${renderSentimentBadge(lead.qualification || lead.sentiment, lead.doNotCall)} <span style="font-size:0.75rem; color:var(--text-sub);">(${score}/100)</span></td>
                        <td>${date}</td>
                        <td>
                            <div style="display:flex; gap:0.4rem;">
                                <button class="btn btn-success" style="padding:0.35rem 0.7rem; font-size:0.75rem;" onclick="callSingleLead('${lead.id}', this)">
                                    <i class="fa-solid fa-phone"></i> Call
                                </button>
                                <button class="btn btn-outline" style="padding:0.35rem 0.6rem; font-size:0.75rem;" onclick="viewLeadLogs('${lead.id}', '${escapeHtml(lead.lead_name)}')">
                                    <i class="fa-solid fa-clock-rotate-left"></i> Logs
                                </button>
                                <button class="btn btn-warning" style="padding:0.35rem 0.6rem; font-size:0.75rem;" onclick="toggleLeadDnc('${lead.id}', ${lead.doNotCall}, this)">
                                    <i class="fa-solid ${lead.doNotCall ? 'fa-check' : 'fa-ban'}"></i> ${lead.doNotCall ? 'Allow' : 'DNC'}
                                </button>
                                <button class="btn btn-danger" style="padding:0.35rem 0.5rem; font-size:0.75rem;" onclick="deleteSingleLead('${lead.id}', this)">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
    });

    updateDashboardMetrics();
}

function onLeadsSearchChange() {
    clearTimeout(leadsSearchTimeout);
    leadsSearchTimeout = setTimeout(() => {
        leadsSearchQuery = document.getElementById('search-leads-input').value.trim();
        leadsPage = 1;
        loadLeads();
    }, 300);
}

function toggleDncFilter() {
    leadsDncOnly = !leadsDncOnly;
    const btn = document.getElementById('dnc-filter-btn');
    if (leadsDncOnly) {
        btn.innerHTML = '<i class="fa-solid fa-ban"></i> DNC Only';
        btn.classList.replace('btn-warning', 'btn-danger');
    } else {
        btn.innerHTML = '<i class="fa-solid fa-users"></i> All Leads';
        btn.classList.replace('btn-danger', 'btn-warning');
    }
    leadsPage = 1;
    loadLeads();
}

function changeLeadsPage(delta) {
    leadsPage = Math.max(1, Math.min(leadsTotalPages, leadsPage + delta));
    loadLeads();
}

async function toggleLeadDnc(leadId, currentDnc, btnEl = null) {
    const btn = btnEl || (event && event.currentTarget);
    setButtonLoading(btn, true, 'Updating...');
    try {
        const newDnc = !currentDnc;
        showToast(`Updating DNC status...`, 'info');
        const res = await authFetch(`/api/leads/${leadId}/dnc`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doNotCall: newDnc })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Lead DNC updated to ${newDnc ? 'TRUE' : 'FALSE'}`, 'success');
            loadLeads();
        } else {
            showToast(data.error?.message || data.error || 'Failed to update DNC', 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
}

async function deleteSingleLead(leadId, btnEl = null) {
    const btn = btnEl || (event && event.currentTarget);
    setButtonLoading(btn, true, 'Deleting...');
    try {
        showToast('Deleting lead...', 'warning');
        const res = await authFetch(`/api/leads/${leadId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Lead deleted', 'success');
            loadLeads();
        } else {
            const err = data.error?.message || data.error || 'Failed to delete lead';
            showToast(err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
}

async function clearAllLeads(btnEl = null) {
    const btn = btnEl || (event && event.currentTarget);
    setButtonLoading(btn, true, 'Clearing...');
    try {
        const agentId = document.getElementById('filter-agent-leads').value;
        showToast('Clearing leads...', 'warning');
        const url = agentId ? `/api/leads?agent_id=${agentId}` : '/api/leads';
        const res = await authFetch(url, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('All leads cleared!', 'success');
            loadLeads();
        } else {
            const err = data.error?.message || data.error || 'Failed to clear leads';
            showToast(err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
}

async function callSingleLead(leadId, btnEl = null) {
    const btn = btnEl || (event && event.currentTarget);
    setButtonLoading(btn, true, 'Calling...');
    try {
        showToast('Placing outbound call via Twilio...', 'info');
        const res = await authFetch('/api/campaigns/trigger-lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: leadId })
        });
        const data = await res.json();
        if (data.success) showToast('AI Voice Call Placed! Check transcripts & logs.', 'success');
        else {
            const err = data.error?.message || data.error || 'Call failed';
            showToast('Call Error: ' + err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
}

async function loadCampaigns() {
    showTableLoading('campaigns-table-body', 8, 'Loading campaigns...');
    const res = await authFetch('/api/campaigns');
    const result = await res.json();
    if (!result.success) return;

    const campaigns = Array.isArray(result.data) ? result.data : [];
    const tbody = document.getElementById('campaigns-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2.5rem; color:var(--text-sub);">No active or past campaigns found.</td></tr>';
        return;
    }

    campaigns.forEach(c => {
        const callingPending = `${c.calling || 0} / ${c.pending || 0}`;
        const completedFailed = `${c.completed || 0} / ${c.failed || 0}`;
        tbody.innerHTML += `
                    <tr>
                        <td><b>${escapeHtml(c.name || 'Outreach Campaign')}</b></td>
                        <td><span class="badge badge-${c.status === 'running' ? 'calling' : c.status}">${escapeHtml(c.status)}</span></td>
                        <td>${c.totalLeads || 0}</td>
                        <td>${callingPending}</td>
                        <td>${completedFailed}</td>
                        <td><span class="badge badge-interested">${c.interested || 0}</span></td>
                        <td><span class="badge badge-not-interested">${c.dnc || 0}</span></td>
                        <td><b>${c.concurrency || 5} calls</b></td>
                    </tr>
                `;
    });

    updateDashboardMetrics();
}

async function startCampaign(btnEl = null) {
    const btn = btnEl || (event && event.currentTarget) || document.querySelector('#campaigns-tab button[onclick="startCampaign()"]');
    const agentId = document.getElementById('campaign-agent-select').value;
    const name = document.getElementById('campaign-name-input').value.trim() || 'AI Outbound Sales Outreach';
    const concurrency = parseInt(document.getElementById('campaign-concurrency-input').value, 10) || 5;

    if (!agentId) {
        showToast('Please select an agent to start campaign', 'warning');
        return;
    }

    setButtonLoading(btn, true, 'Launching Campaign...');
    try {
        showToast('Launching AI Batch Campaign...', 'info');
        const res = await authFetch('/api/campaigns/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, agent_id: agentId, concurrency })
        });
        const data = await res.json();
        if (data.success) {
            const msg = data.data?.message || data.message || 'Campaign started!';
            showToast(msg, 'success');
            loadCampaigns();
        } else {
            const err = data.error?.message || data.error || 'Campaign error';
            showToast('Campaign Error: ' + err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
}

window.logsStore = new Map();

let logsLeadFilter = '';

function viewLeadLogs(leadId, leadName) {
    logsLeadFilter = leadId;
    logsPage = 1;
    switchTab('logs');
    showToast(`Filtering logs for lead: ${leadName}`, 'info');
}
window.viewLeadLogs = viewLeadLogs;

function clearLogsLeadFilter() {
    logsLeadFilter = '';
    logsPage = 1;
    loadLogs();
}
window.clearLogsLeadFilter = clearLogsLeadFilter;

async function loadLogs() {
    showTableLoading('logs-table-body', 7, 'Loading call logs & transcripts...');
    let url = `/api/logs?page=${logsPage}&limit=25`;
    if (logsLeadFilter) url += `&lead_id=${encodeURIComponent(logsLeadFilter)}`;

    const res = await authFetch(url);
    const result = await res.json();
    if (!result.success) return;

    const logsList = Array.isArray(result.data) ? result.data : (result.logs || []);
    const pagination = result.pagination || { page: 1, pages: 1, total: logsList.length };
    logsPage = pagination.page;
    logsTotalPages = pagination.pages || 1;

    document.getElementById('logs-pagination-info').textContent = `Showing page ${logsPage} of ${logsTotalPages} (${pagination.total} total transcripts)`;
    document.getElementById('logs-prev-btn').disabled = logsPage <= 1;
    document.getElementById('logs-next-btn').disabled = logsPage >= logsTotalPages;

    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '';
    window.logsStore.clear();

    if (logsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-sub);">No call logs recorded yet.</td></tr>';
        return;
    }

    logsList.forEach(log => {
        const sid = log.callSid || log.call_sid;
        window.logsStore.set(sid, log);
        const date = new Date(log.created_at || log.createdAt).toLocaleString();
        const cost = log.cost ? `$${(log.cost.total || 0).toFixed(3)}` : '$0.00';
        const score = log.leadScore || 0;
        tbody.innerHTML += `
                    <tr>
                        <td><code>${escapeHtml(sid)}</code></td>
                        <td><b>${escapeHtml(log.lead_name || 'Lead')}</b></td>
                        <td>${log.duration_seconds || log.duration || 0}s</td>
                        <td>${log.transcript ? log.transcript.length : 0} turns</td>
                        <td>${renderSentimentBadge(log.qualification || log.sentiment, log.doNotCall)} <span style="font-size:0.75rem; color:var(--text-sub);">(${score}/100)</span></td>
                        <td><b style="color:var(--accent);">${cost}</b></td>
                        <td>${date}</td>
                        <td>
                            <div style="display:flex; gap:0.4rem;">
                                <button class="btn btn-primary" style="padding:0.35rem 0.7rem; font-size:0.75rem;" onclick="viewTranscriptModal('${sid}')">
                                    <i class="fa-solid fa-eye"></i> View
                                </button>
                                <button class="btn btn-danger" style="padding:0.35rem 0.5rem; font-size:0.75rem;" onclick="deleteSingleLog('${sid}')">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
    });

    updateDashboardMetrics();
}

function changeLogsPage(delta) {
    logsPage = Math.max(1, Math.min(logsTotalPages, logsPage + delta));
    loadLogs();
}

async function deleteSingleLog(callSid) {
    showToast('Deleting transcript log...', 'warning');
    const res = await authFetch(`/api/logs/${callSid}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
        showToast('Transcript log deleted', 'success');
        loadLogs();
    } else {
        const err = data.error?.message || data.error || 'Failed to delete log';
        showToast(err, 'error');
    }
}

async function clearAllLogs() {
    showToast('Clearing all transcripts...', 'warning');
    const res = await authFetch('/api/logs', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
        showToast('All transcripts cleared!', 'success');
        loadLogs();
    } else {
        const err = data.error?.message || data.error || 'Failed to clear logs';
        showToast(err, 'error');
    }
}

function viewTranscriptModal(callSid) {
    const log = window.logsStore.get(callSid);
    const body = document.getElementById('transcript-body');
    body.innerHTML = '';
    if (!log || !log.transcript || log.transcript.length === 0) {
        body.innerHTML = '<p style="color:var(--text-sub);">No transcript recorded for this call.</p>';
    } else {
        const cost = log.cost ? `$${(log.cost.total || 0).toFixed(4)}` : '$0.00';
        const sttLat = log.latency?.stt || 0;
        const llmLat = log.latency?.llm || 0;
        const ttsLat = log.latency?.tts || 0;
        const totLat = log.latency?.total || (llmLat + ttsLat);

        const hotHandoff = log.humanHandoffRequested || log.callbackRequested;

        body.innerHTML = `
                    <div style="margin-bottom:1rem; padding:0.85rem 1.1rem; background:rgba(255,255,255,0.04); border-radius:12px; border:1px solid var(--card-border);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <div><b>Lead:</b> ${escapeHtml(log.lead_name || 'Customer')} | <b>Agent:</b> ${escapeHtml(log.agent_name || 'AI')}</div>
                            <div style="display:flex; gap:0.5rem; align-items:center;">
                                ${hotHandoff ? '<span class="badge badge-interested" style="background:#ef4444;"><i class="fa-solid fa-fire"></i> HOT LEAD - Callback Requested</span>' : ''}
                                ${renderSentimentBadge(log.qualification || log.sentiment, log.doNotCall)}
                            </div>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-sub); display:flex; gap:1.5rem; flex-wrap:wrap;">
                            <div><i class="fa-solid fa-bolt"></i> <b>Latency:</b> LLM ${llmLat}ms | TTS ${ttsLat}ms | Total ${totLat}ms</div>
                            <div><i class="fa-solid fa-dollar-sign"></i> <b>Cost:</b> Twilio $${(log.cost?.twilio || 0).toFixed(3)} | LLM $${(log.cost?.llm || 0).toFixed(4)} | TTS $${(log.cost?.tts || 0).toFixed(4)} | Total ${cost}</div>
                        </div>
                    </div>
                `;
        log.transcript.forEach(msg => {
            if (msg.role === 'system') return;
            const isUser = msg.role === 'user';
            body.innerHTML += `
                        <div class="bubble ${isUser ? 'bubble-user' : 'bubble-ai'}">
                            <b>${isUser ? escapeHtml(log.lead_name || 'Customer') : escapeHtml(log.agent_name || 'AI Agent')}:</b> ${escapeHtml(msg.content)}
                        </div>
                    `;
        });
    }
    openModal('transcript-modal');
}

async function updateDashboardMetrics() {
    try {
        // Single lightweight request — backend uses countDocuments + aggregate
        // instead of fetching full collections (replaces 3 x limit=1000 fetches)
        const statsRes = await authFetch('/api/stats');
        const statsData = await statsRes.json();
        if (!statsData.success) return;

        const s = statsData.data;

        const elLeads = document.getElementById('stat-total-leads');
        if (elLeads) elLeads.textContent = s.totalLeads;

        const elAgents = document.getElementById('stat-total-agents');
        if (elAgents) elAgents.textContent = s.totalAgents;

        const elInterested = document.getElementById('stat-interested-leads');
        if (elInterested) elInterested.textContent = s.interestedLeads;

        const elDnc = document.getElementById('stat-dnc-leads');
        if (elDnc) elDnc.textContent = s.dncLeads;

        const elCost = document.getElementById('stat-total-cost');
        if (elCost) elCost.textContent = `$${(s.totalCallCost || 0).toFixed(2)}`;
    } catch (e) { }
}

// Agent Modal Functions
function openAgentModal() {
    document.getElementById('agent-form').reset();
    document.getElementById('agent-id').value = '';
    document.getElementById('modal-title').textContent = 'Create New AI Sales Agent';
    openModal('agent-modal');
}

function closeAgentModal() {
    closeModal('agent-modal');
}

document.getElementById('agent-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('agent-name').value.trim();
    const company = document.getElementById('agent-company').value.trim();
    const firstMessage = document.getElementById('agent-first-message').value.trim();

    if (!name || name.length < 2) {
        showToast('Agent name must be at least 2 characters', 'warning');
        return;
    }
    if (!company || company.length < 2) {
        showToast('Company name must be at least 2 characters', 'warning');
        return;
    }
    if (!firstMessage || firstMessage.length < 10) {
        showToast('First message greeting must be at least 10 characters', 'warning');
        return;
    }

    setButtonLoading(btn, true, 'Saving Agent...');
    try {
        const payload = {
            id: document.getElementById('agent-id').value || null,
            name,
            company,
            role_title: document.getElementById('agent-role-title').value.trim() || 'Sales Specialist',
            first_message: firstMessage,
            tone_style: document.getElementById('agent-tone').value.trim(),
            call_goal: document.getElementById('agent-goal').value.trim(),
            knowledge_base_context: document.getElementById('agent-kb').value.trim(),
            voice_engine: document.getElementById('agent-voice-engine').value || 'elevenlabs',
            voice_id: document.getElementById('agent-voice-id').value.trim()
        };

        const res = await authFetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('AI Sales Agent saved successfully!', 'success');
            closeAgentModal();
            loadAgents();
        } else {
            const err = data.error?.message || data.error || 'Failed to save agent';
            showToast(err, 'error');
        }
    } finally {
        setButtonLoading(btn, false);
    }
};

async function editAgent(id) {
    const res = await authFetch('/api/agents');
    const result = await res.json();
    const agentsList = Array.isArray(result.data) ? result.data : (result.agents || []);
    const agent = agentsList.find(a => a.id === id);
    if (!agent) return;

    document.getElementById('agent-id').value = agent.id;
    document.getElementById('agent-name').value = agent.name;
    document.getElementById('agent-company').value = agent.company;
    document.getElementById('agent-role-title').value = agent.role_title || 'Sales Specialist';
    document.getElementById('agent-first-message').value = agent.first_message;
    document.getElementById('agent-tone').value = agent.tone_style || '';
    document.getElementById('agent-goal').value = agent.call_goal || '';
    document.getElementById('agent-kb').value = agent.knowledge_base_context || '';
    document.getElementById('agent-voice-engine').value = agent.voice_engine || 'elevenlabs';
    document.getElementById('agent-voice-id').value = agent.voice_id || 'JBFqnCBsd6RMkjVDRZzb';

    document.getElementById('modal-title').textContent = 'Edit AI Sales Agent';
    openModal('agent-modal');
}

async function deleteAgent(id) {
    showToast('Deleting AI Agent...', 'warning');
    const res = await authFetch(`/api/agents/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
        showToast('AI Agent deleted', 'success');
        loadAgents();
    } else {
        const err = data.error?.message || data.error || 'Failed to delete agent';
        showToast(err, 'error');
    }
}

async function loadAgents() {
    showGridLoading('agents-grid', 'Loading AI Sales Agents...');
    const res = await authFetch('/api/agents');
    const result = await res.json();
    if (!result.success) return;

    const agentsList = Array.isArray(result.data) ? result.data : (result.agents || []);
    const grid = document.getElementById('agents-grid');
    const selects = [
        { el: document.getElementById('upload-agent-select'), hasAll: false },
        { el: document.getElementById('manual-agent-select'), hasAll: false },
        { el: document.getElementById('filter-agent-leads'), hasAll: true },
        { el: document.getElementById('campaign-agent-select'), hasAll: false }
    ];

    selects.forEach(s => {
        if (!s.el) return;
        const currentVal = s.el.value;
        s.el.innerHTML = '';
        if (s.hasAll) {
            const allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = 'All AI Agents';
            s.el.appendChild(allOpt);
        }
        agentsList.forEach(agent => {
            const opt = document.createElement('option');
            opt.value = agent.id;
            opt.textContent = `${agent.name} (${agent.company})`;
            s.el.appendChild(opt);
        });
        if (currentVal) s.el.value = currentVal;
    });

    if (grid) {
        grid.innerHTML = '';
        agentsList.forEach(agent => {
            grid.innerHTML += `
                        <div class="glass-card" style="margin-bottom:0;">
                            <div class="card-header" style="margin-bottom:0.75rem;">
                                <div class="card-title" style="font-size:1.1rem;"><i class="fa-solid fa-robot"></i> ${escapeHtml(agent.name)}</div>
                                <span class="badge badge-completed">${escapeHtml(agent.company)}</span>
                            </div>
                            <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:1rem;">"${escapeHtml(agent.first_message)}"</p>
                            <div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:1.25rem;">
                                <div><b>Goal:</b> ${escapeHtml(agent.call_goal)}</div>
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="btn btn-primary" style="flex:1; justify-center;" onclick="editAgent('${agent.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
                                <button class="btn btn-danger" onclick="deleteAgent('${agent.id}')"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    `;
        });
    }
}

// Initial Load - Check Auth & Restore Active Tab on Refresh
window.addEventListener('DOMContentLoaded', async () => {
    // Setup Hamburger Navigation Toggle for Mobile Viewports
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navLinks = document.getElementById('main-nav-links');
    const authBar = document.getElementById('user-auth-bar');
    if (hamburgerBtn && navLinks) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = navLinks.classList.toggle('mobile-active');
            if (authBar) authBar.classList.toggle('mobile-active', isOpen);
            hamburgerBtn.classList.toggle('active', isOpen);
        });

        document.addEventListener('click', (e) => {
            const path = e.composedPath ? e.composedPath() : [];
            const clickedInsideBtn = path.includes(hamburgerBtn) || hamburgerBtn.contains(e.target);
            const clickedInsideNav = path.includes(navLinks) || navLinks.contains(e.target);
            const clickedInsideAuth = authBar && (path.includes(authBar) || authBar.contains(e.target));

            if (!clickedInsideBtn && !clickedInsideNav && !clickedInsideAuth) {
                if (navLinks.classList.contains('mobile-active')) {
                    navLinks.classList.remove('mobile-active');
                    if (authBar) authBar.classList.remove('mobile-active');
                    hamburgerBtn.classList.remove('active');
                }
            }
        });
    }

    const hasUser = await fetchCurrentUser();
    const defaultTab = currentUser && currentUser.role === 'SUPER_ADMIN' ? 'platform-overview' : 'agents';
    const savedTab = location.hash.replace('#', '') || localStorage.getItem('activeTab') || defaultTab;
    switchTab(savedTab);
    if (!hasUser) {
        clearDataUI();
        openLoginModal();
    }
});
