// ======================================================================================
// --- CORE UTILITY FUNCTIONS (Universal) ---
// ======================================================================================

/**
 * Memformat angka menjadi string mata uang Rupiah (IDR).
 * @param {number} number - Angka yang akan diformat.
 */
function formatCurrency(number) {
    if (isNaN(number) || number === 0) {
        return null;
    }
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(number);
}

/**
 * Toggles visibility of password fields and updates the eye icon.
 * @param {string} id - The ID of the password input field.
 */
function togglePassword(id) {
    var pwd = document.getElementById(id);
    var eye = document.getElementById('eye-' + id);
    if (!pwd) return;
    if (pwd.type === 'password') {
        pwd.type = 'text';
        if (eye) { 
            eye.classList.remove('fa-eye');
            eye.classList.add('fa-eye-slash');
        }
    } else {
        pwd.type = 'password';
        if (eye) { 
            eye.classList.add('fa-eye');
            eye.classList.remove('fa-eye-slash');
        }
    }
}

/**
 * Placeholder function from original script.js.
 */
function enableSignUp() {
    const signUpBtn = document.getElementById("signup_btn");
    if (signUpBtn) {
        signUpBtn.disabled = false;
    }
}

// ======================================================================================
// --- NOTIFICATION SYSTEM FUNCTIONS (Universal) ---
// ======================================================================================

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

/**
 * Mengambil Job ID dari Application ID (API baru)
 * @param {number} applicationId
 * @returns {Promise<number|null>} Job ID atau null
 */
async function fetchJobIdFromApplication(applicationId) {
    try {
        const response = await fetch(`/api/get_job_id/${applicationId}`);
        // Jika API mengembalikan 404/403 (Job tidak ditemukan/Unauthorized), kita anggap Job ID tidak ada.
        if (!response.ok) return null;
        const data = await response.json();
        return data.job_id;
    } catch (error) {
        console.error('Error fetching job ID:', error);
        return null;
    }
}

/**
 * Handles navigation based on notification type and global user role.
 * @param {object} notification - The notification object.
 */
async function handleNotificationClick(notification) {
    const currentUserRole = window.currentUserRole || ''; 
    const relatedId = notification.related_id;

    // KASUS 1: Job Posting Dihapus (related_id = null atau 0) - FIX: Tidak ada navigasi dan tidak ada alert error.
    if (relatedId === null || relatedId === 0 || isNaN(relatedId)) {
        console.log("Notifikasi tanpa ID terkait/Job dihapus, tidak ada navigasi.");
        return; 
    }
    
    switch(notification.type) {
        case 'job_posted':
            // Pelamar: Job Posting Baru. relatedId = Job ID
            // Solusi: Tampilkan modal detail pekerjaan.
            if (currentUserRole === 'applicant') {
                window.showJobDetail(relatedId);
            } else {
                window.location.href = '/dashboard';
            }
            break;
        
        case 'application_received':
            // Perusahaan: Pelamar baru. relatedId = Application ID
            // Logika: Langsung ke halaman View Application spesifik.
            if (currentUserRole === 'company') {
                window.location.href = `/company/application/${relatedId}`;
            } else {
                window.location.href = '/dashboard';
            }
            break;
        
        case 'application_status':
            // Pelamar: Status lamaran diterima/ditolak. relatedId = Application ID
            // Logika: Fetch Job ID, lalu tampilkan detail job (modal).
            if (currentUserRole === 'applicant') {
                const jobId = await fetchJobIdFromApplication(relatedId);
                if (jobId) {
                    window.showJobDetail(jobId);
                } else {
                    // Job sudah dihapus setelah status diupdate.
                    alert('Job terkait sudah dihapus oleh perusahaan.');
                }
            } else {
                window.location.href = '/dashboard'; // Fallback
            }
            break;
            
        default:
            window.location.href = '/dashboard';
    }
}

/**
 * Marks a notification as read and reloads the UI.
 * @param {number} notificationId 
 * @param {string} scope - '' for desktop, 'Mobile' for mobile.
 */
function markNotificationRead(notificationId, scope = '') {
    fetch(`/notifications/read/${notificationId}`, { 
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadNotifications('');
            loadNotifications('Mobile'); 
        }
    })
    .catch(error => console.error('Error marking notification read:', error));
}

/**
 * Clears all notifications for the current user and reloads UI.
 * @param {string} scope - '' for desktop, 'Mobile' for mobile.
 */
function clearAllNotifications(scope = '') {
    if (!confirm('Are you sure you want to delete ALL notifications? This cannot be undone.')) {
        return;
    }
    fetch('/notifications/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadNotifications('');
            loadNotifications('Mobile');
            alert('All notifications have been cleared.'); 
        } else {
            alert('Error clearing notifications.');
        }
    })
    .catch(error => console.error('Error clearing all notifications:', error));
}


/**
 * Fetches notifications and updates the UI for a specific scope.
 * @param {string} scope - '' for desktop, 'Mobile' for mobile.
 */
function loadNotifications(scope = '') {
    fetch('/notifications')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(notifications => {
            updateNotificationUI(notifications, scope);
        })
        .catch(error => console.error('Error loading notifications:', error));
}

function updateNotificationUI(notifications, scope = '') {
    const listId = `notificationList${scope}`;
    const badgeId = `notificationBadge${scope}`;
    const notificationList = document.getElementById(listId);
    const notificationBadge = document.getElementById(badgeId);
    
    if (!notificationList || !notificationBadge) return;
    
    const unreadCount = notifications.filter(n => !n.is_read).length;
    
    // Update badge
    if (unreadCount > 0) {
        notificationBadge.textContent = unreadCount;
        notificationBadge.style.display = 'block';
    } else {
        notificationBadge.style.display = 'none';
    }

    // --- FUNGSI BARU UNTUK MENERJEMAHKAN KONTEN ---
    // --- FUNGSI BARU UNTUK MENERJEMAHKAN KONTEN ---
    function getTranslatedNotificationHtml(notification) {
        let title_en = notification.title;
        let title_id = notification.title;
        let message_en = notification.message;
        let message_id = notification.message;
        
        // 1. Terjemahkan Judul (Title)
        if (notification.title === 'Application Status Updated') {
            title_id = 'Status Lamaran Diperbarui';
        } else if (notification.title === 'New Job Posted') {
            title_id = 'Pekerjaan Baru Diposting';
        } else if (notification.title === 'Job Posting Removed') {
            title_id = 'Lowongan Pekerjaan Dihapus';
        } else if (notification.title === 'New Application Received') {
            title_id = 'Lamaran Baru Diterima';
        }
        
        // 2. Terjemahkan Pesan (Message) menggunakan Regex
        let match;
        
        // --- PERBAIKAN DI SINI ---
        // Pola: "Your application for ... has been accepted/rejected" (TANPA KUTIP)
        // Regex diubah untuk tidak mencari tanda kutip di sekitar nama pekerjaan
        match = notification.message.match(/Your application for (.*) has been (.*)/);
        if (match) {
            const jobTitle = match[1];
            const status = match[2].toLowerCase(); // 'accepted' atau 'rejected'
            const status_id = (status === 'accepted' ? 'diterima' : 'ditolak');
            
            // Pastikan tidak ada kutip di string fallback/terjemahan
            message_en = `Your application for ${jobTitle} has been ${status}`;
            message_id = `Lamaran Anda untuk ${jobTitle} telah ${status_id}`;
        }
        
        // Pola: "A new job '...' has been posted by ..." (DENGAN KUTIP - Ini sudah benar)
        // Biarkan seperti ini karena notifikasi ini memang pakai kutip
        match = notification.message.match(/A new job '(.*)' has been posted by (.*)/);
        if (match) {
            const jobTitle = match[1];
            const companyName = match[2].replace(/\.$/, ''); // Hapus titik di akhir jika ada
            message_en = `A new job '${jobTitle}' has been posted by ${companyName}`;
            message_id = `Pekerjaan baru '${jobTitle}' telah diposting oleh ${companyName}`;
        }
        
        // Pola: "The job '...' you applied for has been removed..." (DENGAN KUTIP - Ini sudah benar)
        match = notification.message.match(/The job '(.*)' you applied for has been removed by the company./);
        if (match) {
            const jobTitle = match[1];
            message_en = `The job '${jobTitle}' you applied for has been removed by the company.`;
            message_id = `Pekerjaan '${jobTitle}' yang Anda lamar telah dihapus oleh perusahaan.`;
        }
        
        // Pola: "... applied for ..." (TANPA KUTIP - Ini sudah benar)
        match = notification.message.match(/(.*) applied for (.*)/);
        // Pastikan ini adalah notifikasi 'New Application Received' agar tidak salah
        if (match && notification.title === 'New Application Received') {
            const applicantName = match[1];
            const jobTitle = match[2].replace(/\.$/, ''); // Hapus titik di akhir jika ada
            message_en = `${applicantName} applied for ${jobTitle}`;
            message_id = `${applicantName} melamar untuk ${jobTitle}`;
        }
        
        // 3. Kembalikan sebagai HTML
        return {
            titleHtml: `<span data-i18n="notif_title_en">${title_en}</span><span data-i18n="notif_title_id" class="d-none">${title_id}</span>`,
            messageHtml: `<span data-i18n="notif_msg_en">${message_en}</span><span data-i18n="notif_msg_id" class="d-none">${message_id}</span>`
        };
    }
    // --- AKHIR FUNGSI BARU ---

    if (!notifications || notifications.length === 0) {
        notificationList.innerHTML = `
            <li class="text-center py-3 text-muted">
                <span data-i18n="no_notifications_en">No notifications</span>
                <span data-i18n="no_notifications_id" class="d-none">Tidak ada notifikasi</span>
            </li>
        `;
    } else {
        // Build notification list
        let html = '';
        notifications.forEach(notification => {
            const isReadClass = notification.is_read ? '' : 'bg-light';
            const timeAgo = getTimeAgo(notification.created_at);
            
            // --- GUNAKAN FUNGSI HELPER BARU ---
            const translated = getTranslatedNotificationHtml(notification);
            
            html += `
                <li>
                    <div class="dropdown-item ${isReadClass} notification-item p-3" 
                         data-notification-id="${notification.id}" 
                         data-related-id="${notification.related_id}"
                         data-notification-type="${notification.type}"
                         style="cursor: pointer; border-bottom: 1px solid #f0f0f0;">
                        <div class="d-flex w-100 justify-content-between align-items-start">
                            <h6 class="mb-1" style="font-size: 0.9rem;">
                                ${translated.titleHtml}  </h6>
                            <small class="text-muted">${timeAgo}</small>
                        </div>
                        <p class="mb-1 small text-muted">
                            ${translated.messageHtml} </p>
                        ${!notification.is_read ? '<span class="badge bg-primary btn-sm">New</span>' : ''}
                    </div>
                </li>
            `;
        });
        notificationList.innerHTML = html;
    }
    
    // --- LANGKAH PENTING: Terapkan ulang terjemahan ---
    // Panggil fungsi toggleLang global untuk memproses span yang baru ditambahkan
    const currentLang = localStorage.getItem('nk_lang') || 'en';
    if (window.toggleLang) {
        window.toggleLang(currentLang);
    }
    // --- AKHIR LANGKAH PENTING ---
}

// ======================================================================================
// --- JOB/APPLICATION DETAIL MODAL (Universal) ---
// ======================================================================================

/**
 * Helper to apply language translation to modal content
 * @param {HTMLElement} modalElement - The modal's main element.
 * @param {string} lang - The target language ('en' or 'id').
 */
function translateModalContent(modalElement, lang) {
    if (!modalElement) return;

    modalElement.querySelectorAll('[data-i18n]').forEach(el => {
        const id = el.getAttribute('data-i18n');
        
        if (id.endsWith('_en') || id.endsWith('_id')) {
            if (lang === 'en') {
                if (id.endsWith('_en')) {
                    el.classList.remove('d-none', 'hidden');
                } else if (id.endsWith('_id')) {
                    el.classList.add('d-none', 'hidden');
                }
            } else if (lang === 'id') {
                if (id.endsWith('_id')) {
                    el.classList.remove('d-none', 'hidden');
                } else if (id.endsWith('_en')) {
                    el.classList.add('d-none', 'hidden');
                }
            }
        }
    });
}

/**
 * Universal function to fetch job details and populate a modal.
 * @param {number} jobId - The ID of the job listing.
 */
window.showJobDetail = function(jobId) {
    fetch(`/job/${jobId}`)
        .then(response => {
            if (response.status === 404) {
                throw new Error('JobNotFound');
            }
            if (!response.ok) {
                throw new Error('NetworkError');
            }
            return response.json();
        })
        .then(job => {
            const modalTitleElement = document.getElementById('jobDetailTitle');
            const modalBodyElement = document.getElementById('jobDetailBody');
            const applyContainerElement = document.getElementById('applyButtonContainer');
            const currentLang = localStorage.getItem('nk_lang') || 'en';

            if (modalTitleElement) {
                // Hapus konten lama dan buat yang baru
                modalTitleElement.innerHTML = `
                    <i class="fas fa-briefcase me-3"></i>
                    <span id="modalJobTitleText">${job.title}</span>
                `;
            }

            // --- Logika Gaji (Bootstrap) ---
            let salaryHtml = '';
            const minSalary = formatCurrency(job.salary_min);
            const maxSalary = formatCurrency(job.salary_max);
            let salaryTextEn = 'Salary not disclosed';
            let salaryTextId = 'Gaji tidak ditampilkan';

            if (minSalary && maxSalary) {
                salaryTextEn = `${minSalary} - ${maxSalary}`;
                salaryTextId = `${minSalary} - ${maxSalary}`;
            } else if (minSalary) {
                salaryTextEn = `From ${minSalary}`;
                salaryTextId = `Mulai dari ${minSalary}`;
            } else if (maxSalary) {
                salaryTextEn = `Up to ${maxSalary}`;
                salaryTextId = `Hingga ${maxSalary}`;
            }

            salaryHtml = `
                <div class="d-flex align-items-center mb-3">
                    <i class="fas fa-money-bill-wave text-success me-3" style="width: 20px;"></i>
                    <strong class="me-2">
                        <span data-i18n="modal_salary_en">Salary:</span>
                        <span data-i18n="modal_salary_id" class="hidden">Gaji:</span>
                    </strong>
                    <span>
                        <span data-i18n="modal_salary_value_en">${salaryTextEn}</span>
                        <span data-i18n="modal_salary_value_id" class="hidden">${salaryTextId}</span>
                    </span>
                </div>
            `;
            // --- Akhir Logika Gaji ---


            if (modalBodyElement) {
                // --- KODE BOOTSTRAP BARU UNTUK MODAL BODY ---
                modalBodyElement.innerHTML = `
                    <div class="vstack gap-3">
                        <div class="d-flex align-items-center mb-3">
                            <i class="fas fa-building text-primary me-3" style="width: 20px;"></i>
                            <strong class="me-2">
                                <span data-i18n="modal_company_en">Company:</span>
                                <span data-i18n="modal_company_id" class="hidden">Perusahaan:</span>
                            </strong>
                            <span>${job.company}</span>
                        </div>

                        <div class="d-flex align-items-center mb-3">
                            <i class="fas fa-building text-primary me-3" style="width: 20px;"></i>
                            <strong class="me-2">
                                <span data-i18n="modal_company_en">Company:</span>
                                <span data-i18n="modal_company_id" class="hidden">Perusahaan:</span>
                            </strong>
                            <span>
                                <a href="/company/${job.company_id}" class="text-decoration-none">
                                    ${job.company}
                                </a>
                            </span>
                        </div>
                        
                        ${salaryHtml}

                        <div class="d-flex align-items-center mb-3">
                            <i class="fas fa-users text-info me-3" style="width: 20px;"></i>
                            <strong class="me-2">
                                <span data-i18n="modal_available_slots_en">Available Slots:</span>
                                <span data-i18n="modal_available_slots_id" class="hidden">Kuota Tersedia:</span>
                            </strong>
                            <span>${job.slots}</span>
                        </div>
                        <div class="d-flex align-items-center mb-3">
                            <i class="fas fa-user-check text-warning me-3" style="width: 20px;"></i>
                            <strong class="me-2">
                                <span data-i18n="modal_current_applicants_en">Current Applicants:</span>
                                <span data-i18n="modal_current_applicants_id" class="hidden">Pelamar Saat Ini:</span>
                            </strong>
                            <span>${job.applied_count}</span>
                        </div>
                    </div>
                    
                    <hr class="my-4">
                    
                    <div>
                        <h5 class="fw-bold text-dark mb-3 d-flex align-items-center">
                            <i class="fas fa-graduation-cap text-dark me-2"></i>
                            <span data-i18n="modal_qualifications_en">Qualifications</span>
                            <span data-i18n="modal_qualifications_id" class="hidden">Kualifikasi</span>
                        </h5>
                        <div class="card bg-light border-0">
                            <div class="card-body p-3">
                                <p class="mb-0" style="white-space: pre-wrap;">${job.qualifications}</p>
                            </div>
                        </div>
                    </div>
                    
                    <hr class="my-4">
                    
                    <div>
                        <h5 class="fw-bold text-dark mb-3 d-flex align-items-center">
                            <i class="fas fa-tasks text-dark me-2"></i>
                            <span data-i18n="modal_job_description_en">Job Description</span>
                            <span data-i18n="modal_job_description_id" class="hidden">Deskripsi Pekerjaan</span>
                        </h5>
                        <div class="card bg-light border-0">
                            <div class="card-body p-3">
                                <p class="mb-0" style="white-space: pre-wrap;">${job.description}</p>
                            </div>
                        </div>
                    </div>
                `;
            }

            // --- Handle Tombol Apply (Menggunakan Bootstrap) ---
            if (applyContainerElement) {
                const isAuthenticated = window.isAuthenticated === true;
                const userRole = window.currentUserRole; 

                let applyButton = '';
                
                const isFull = job.applied_count >= job.slots;
                const isClosed = !job.is_open;
                
                if (isClosed) {
                     applyButton = `<button disabled class="btn btn-secondary">
                        <i class="fas fa-times-circle me-1"></i> Job Closed
                    </button>`;
                } else if (isFull) {
                     applyButton = `<button disabled class="btn btn-warning">
                        <i class="fas fa-exclamation-triangle me-1"></i> Slots Full
                    </button>`;
                } else if (isAuthenticated && userRole === 'applicant') {
                    applyButton = `<a href="/apply/${job.id}" class="btn btn-primary">
                        <i class="fas fa-paper-plane me-1"></i>
                        <span data-i18n="modal_apply_now_en">Apply Now</span>
                        <span data-i18n="modal_apply_now_id" class="hidden">Lamar Sekarang</span>
                    </a>`;
                } else if (!isAuthenticated) {
                    applyButton = `<a href="/login" class="btn btn-primary">
                        <i class="fas fa-sign-in-alt me-1"></i>
                        <span data-i18n="modal_login_to_apply_en">Login to Apply</span>
                        <span data-i18n="modal_login_to_apply_id" class="hidden">Masuk untuk Lamar</span>
                    </a>`;
                } else {
                    applyButton = ''; 
                }
                applyContainerElement.innerHTML = applyButton;
            }

            const modalElement = document.getElementById('jobDetailModal');
            if (modalElement) {
                translateModalContent(modalElement, currentLang);
                const modal = new bootstrap.Modal(modalElement);
                modal.show();
            }
        })
        .catch(error => {
            if (error.message === 'JobNotFound') {
                alert('Pekerjaan terkait telah dihapus oleh perusahaan.');
            } else {
                console.error('Error loading job details:', error);
                alert('Error loading job details'); 
            }
        });
}

/**
 * Function specific to my_applications.html to show a job's details in a different modal.
 * @param {number} jobId - The ID of the job listing.
 */
function showApplicationDetail(jobId) {
    fetch(`/job/${jobId}`)
        .then(response => response.json())
        .then(job => {
            const modalTitleElement = document.getElementById('applicationDetailTitle');
            const modalBodyElement = document.getElementById('applicationDetailBody');

            if (modalTitleElement) {
                 modalTitleElement.textContent = job.title;
            }
            if (modalBodyElement) {
                // This UI is specific to the "My Applications" page
                modalBodyElement.innerHTML = `
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Company:</strong> ${job.company}</p>
                            <p><strong>Location:</strong> ${job.location}</p>
                            <p><strong>Available Slots:</strong> ${job.slots}</p>
                            <p><strong>Current Applicants:</strong> ${job.applied_count}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Status:</strong> 
                                <span class="badge bg-warning text-dark">
                                    <span data-i18n="my_applications_applied_en">Applied</span>
                                    <span data-i18n="my_applications_applied_id" class="d-none">Telah Dilamar</span>
                                </span>
                            </p>
                        </div>
                    </div>
                    <hr>
                    <h6>Qualifications:</h6>
                    <p>${job.qualifications.replace(/\n/g, '<br>')}</p>
                    <hr>
                    <h6>Job Description:</h6>
                    <p>${job.description.replace(/\n/g, '<br>')}</p>
                `;
            }

            const modal = new bootstrap.Modal(document.getElementById('applicationDetailModal'));
            modal.show();
            
            // Apply language to modal content
            const currentLang = localStorage.getItem('nk_lang') || 'en';
            translateModalContent(document.getElementById('applicationDetailModal'), currentLang);

        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error loading job details');
        });
}


// ======================================================================================
// --- MAIN INITIALIZATION & EVENT LISTENERS (Runs on DOMContentLoaded) ---
// ======================================================================================

document.addEventListener('DOMContentLoaded', function() {
    const LANG_KEY = 'nk_lang';
    const savedLang = localStorage.getItem(LANG_KEY) || 'en';

    function updateFormPlaceholders(lang) {
        const en_attr = 'data-i18n-placeholder-en';
        const id_attr = 'data-i18n-placeholder-id';

        const query = `[${en_attr}], [${id_attr}]`;

        document.querySelectorAll(query).forEach(el => {
            const en_text = el.getAttribute(en_attr);
            const id_text = el.getAttribute(id_attr);

            if (lang === 'en') {
                // Utamakan teks EN. Jika tidak ada, pakai teks ID sebagai fallback.
                el.placeholder = en_text || id_text || '';
            } else if (lang === 'id') {
                // Utamakan teks ID. Jika tidak ada, pakai teks EN sebagai fallback.
                el.placeholder = id_text || en_text || '';
            }
        });
    }

    // --- Core Language Toggle (Made global in window scope) ---
    window.toggleLang = function(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const id = el.getAttribute('data-i18n');
            
            if (id.endsWith('_en') || id.endsWith('_id')) {
                if (lang === 'en') {
                    if (id.endsWith('_en')) {
                        el.classList.remove('d-none', 'hidden');
                    } else if (id.endsWith('_id')) {
                        el.classList.add('d-none', 'hidden');
                    }
                } else if (lang === 'id') {
                    if (id.endsWith('_id')) {
                        el.classList.remove('d-none', 'hidden');
                    } else if (id.endsWith('_en')) {
                        el.classList.add('d-none', 'hidden');
                    }
                }
            }
        });

        document.querySelectorAll('[data-i18n-value-en]').forEach(el => {
            const valEn = el.getAttribute('data-i18n-value-en');
            const valId = el.getAttribute('data-i18n-value-id');
            
            if (lang === 'en') {
                el.value = valEn;
            } else if (lang === 'id') {
                el.value = valId || valEn; // Fallback ke EN jika ID tidak ada
            }
        });

        // Logika khusus untuk menerjemahkan <select> role
        const roleSelect = document.getElementById('role_select');
        if (roleSelect) {
            const applicantOption = roleSelect.querySelector('option[value="applicant"]');
            const companyOption = roleSelect.querySelector('option[value="company"]');
            
            if (applicantOption && companyOption) {
                if (lang === 'en') {
                    applicantOption.textContent = 'Job Seeker';
                    companyOption.textContent = 'Company';
                } else if (lang === 'id') {
                    applicantOption.textContent = 'Pencari Kerja';
                    companyOption.textContent = 'Perusahaan';
                }
            }
        }

        const subjectSelect = document.getElementById('subject');
        if (subjectSelect) {
            // Definisikan terjemahan
            const translations = {
                'en': {
                    '': 'Select subject',
                    'general': 'General Inquiry',
                    'technical': 'Technical Support',
                    'partnership': 'Partnership Opportunities',
                    'career': 'Career Questions',
                    'feedback': 'Feedback & Suggestions',
                    'other': 'Other'
                },
                'id': {
                    '': 'Pilih subjek',
                    'general': 'Pertanyaan Umum',
                    'technical': 'Dukungan Teknis',
                    'partnership': 'Kesempatan Kerjasama',
                    'career': 'Pertanyaan Karir',
                    'feedback': 'Masukan & Saran',
                    'other': 'Lainnya'
                }
            };

            // Terapkan terjemahan berdasarkan bahasa yang dipilih
            const targetTranslations = translations[lang] || translations['en'];
            subjectSelect.querySelectorAll('option').forEach(option => {
                const value = option.value;
                if (targetTranslations[value] !== undefined) {
                    option.textContent = targetTranslations[value];
                }
            });
        }
        
        const currentLabel = document.getElementById('current-lang');
        if (currentLabel) {
            currentLabel.textContent = (lang === 'id') ? 'Bahasa Indonesia' : 'English';
        }
        const currentLabelMobile = document.getElementById('current-lang-mobile');
        if (currentLabelMobile) {
            currentLabelMobile.textContent = (lang === 'id') ? 'Bahasa Indonesia' : 'English';
        }
        
        document.documentElement.lang = lang;
        updateFormPlaceholders(lang);
        
        document.querySelectorAll('.lang-option').forEach(option => {
            option.classList.remove('active');
        });
        const activeOption = document.querySelector(`.lang-option[data-lang="${lang}"]`);
        if (activeOption) {
            activeOption.classList.add('active');
        }

        // --- CUSTOM EVENT FOR MODAL/COMPONENT RE-TRANSLATION ---
        document.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { lang: lang } 
        }));
    };
    
    // Initialize with saved language
    window.toggleLang(savedLang);
    
    // Add click event listeners to language options
    document.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', function(e) {
            e.preventDefault();
            const lang = this.getAttribute('data-lang');
            localStorage.setItem(LANG_KEY, lang);
            window.toggleLang(lang);
        });
    });

    // --- Flash Message Logic ---
    const flashContainer = document.getElementById('flash-messages-container');
    if (flashContainer) {
        requestAnimationFrame(() => flashContainer.classList.add('show'));

        const msgs = flashContainer.querySelectorAll('.flash-message');
        msgs.forEach(msg => {
            const txt = (msg.textContent || '').trim().toLowerCase();
            if (txt.includes('please log in to access this page')) {
                msg.classList.add('persistent-login-alert');
                const closeBtn = msg.querySelector('.btn-close');
                if (closeBtn) {
                    closeBtn.remove();
                }
            }
        });

        const AUTO_HIDE_MS = 3000;
        setTimeout(() => {
            flashContainer.style.transition = 'opacity 350ms ease, transform 300ms cubic-bezier(.2,.9,.2,1)';
            flashContainer.style.opacity = '0';
            flashContainer.style.transform = 'translateX(-50%) translateY(-10px)';
            setTimeout(() => {
                if (flashContainer && flashContainer.parentNode) flashContainer.remove();
            }, 400);
        }, AUTO_HIDE_MS);
    }

    window.clearPersistentLoginAlert = function() {
        const container = document.getElementById('flash-messages-container');
        if (!container) return;
        const persistent = container.querySelector('.persistent-login-alert');
        if (persistent) {
            persistent.remove();
        }
        if (container.children.length === 0 && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    };
    
    // --- NOTIFICATION LISTENERS (Desktop & Mobile) ---
    let notificationCheckInterval;

    if (document.getElementById('notificationDropdown') || document.getElementById('notificationDropdownMobile')) {
        // Initial load for both UIs
        loadNotifications(''); 
        loadNotifications('Mobile');

        // Setup polling
        notificationCheckInterval = setInterval(() => {
            loadNotifications('');
            loadNotifications('Mobile');
        }, 30000);

        // Event delegation for clicks on list items (Desktop)
        document.getElementById('notificationList')?.addEventListener('click', function(e) {
            let target = e.target;
            while (target && !target.classList.contains('notification-item')) {
                target = target.parentNode;
            }

            if (target && target.classList.contains('notification-item')) {
                const notificationId = target.getAttribute('data-notification-id');
                const relatedId = target.getAttribute('data-related-id');
                const notificationType = target.getAttribute('data-notification-type');
                
                markNotificationRead(notificationId, ''); 
                
                handleNotificationClick({
                    id: notificationId,
                    related_id: relatedId ? parseInt(relatedId) : null,
                    type: notificationType
                });
            }
        });
        
        // Event delegation for clicks on list items (Mobile)
        document.getElementById('notificationListMobile')?.addEventListener('click', function(e) {
            let target = e.target;
            while (target && !target.classList.contains('notification-item')) {
                target = target.parentNode;
            }

            if (target && target.classList.contains('notification-item')) {
                const notificationId = target.getAttribute('data-notification-id');
                const relatedId = target.getAttribute('data-related-id');
                const notificationType = target.getAttribute('data-notification-type');
                
                markNotificationRead(notificationId, 'Mobile'); 
                
                handleNotificationClick({
                    id: notificationId,
                    related_id: relatedId ? parseInt(relatedId) : null,
                    type: notificationType
                });
            }
        });
        
        // Mark all as read (Desktop)
        document.getElementById('markAllReadBtn')?.addEventListener('click', function(e) {
            e.stopPropagation();
            fetch('/notifications/read-all', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json', }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    loadNotifications('');
                    loadNotifications('Mobile');
                }
            })
            .catch(error => console.error('Error marking all notifications read:', error));
        });
        
        // Clear all (Desktop)
        document.getElementById('clearAllBtn')?.addEventListener('click', function(e) {
            e.stopPropagation();
            clearAllNotifications('');
        });

        // Mark all as read (Mobile)
        document.getElementById('markAllReadBtnMobile')?.addEventListener('click', function(e) {
            e.stopPropagation();
            fetch('/notifications/read-all', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json', }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    loadNotifications('');
                    loadNotifications('Mobile');
                }
            })
            .catch(error => console.error('Error marking all notifications read:', error));
        });
        
        // Clear all (Mobile)
        document.getElementById('clearAllBtnMobile')?.addEventListener('click', function(e) {
            e.stopPropagation();
            clearAllNotifications('Mobile');
        });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        if (notificationCheckInterval) {
            clearInterval(notificationCheckInterval);
        }
    });

    // --- Register Form Role Toggle ---
    const roleSelect = document.getElementById('role_select');
    if (roleSelect) {
        roleSelect.addEventListener('change', function() {
            var companyFields = document.getElementById('company_fields');
            if (this.value === 'company') {
                companyFields.style.display = 'block';
            } else {
                companyFields.style.display = 'none';
            }
        });
    }
    
    // --- Register/Login Placeholder Rerun (For safety/initial state of eye icons) ---
    function updateAuthPlaceholderAndEye(lang) {
        updateFormPlaceholders(lang); // Rerun Placeholder logic

        // Update eye icon state (password fields on register form)
        ['signup_password', 'confirm_password', 'login_password'].forEach(function(id){
            var el = document.getElementById(id);
            var eye = document.getElementById('eye-' + id);
            if (!el || !eye) return;
            
            // Toggle eye icon class based on initial input type (usually password)
            if (el.type === 'text') {
                eye.classList.remove('fa-eye');
                eye.classList.add('fa-eye-slash');
            } else {
                eye.classList.remove('fa-eye-slash');
                eye.classList.add('fa-eye');
            }
        });
    }

    updateAuthPlaceholderAndEye(savedLang);

    // Listen for global language change event to update placeholders/eye icons
    document.addEventListener('languageChanged', function(e) {
        updateAuthPlaceholderAndEye(e.detail.lang);
    });

    // --- ApplyForm Character Counter and Client-side Validation ---
    const coverLetterTextarea = document.getElementById('cover_letter');
    const charCountDiv = document.getElementById('charCount'); // Mengambil div pembungkus
    const charCountValue = document.getElementById('charCountValue'); // Mengambil span angka
    const cvFileInput = document.getElementById('cv_file');
    const applyForm = document.getElementById('apply-form'); 

    if (coverLetterTextarea && charCountDiv && charCountValue) { // Pastikan semua elemen ada
        coverLetterTextarea.addEventListener('input', function() {
            const count = this.value.length;
            charCountValue.textContent = count; // FIX: Hanya perbarui angkanya
            
            // FIX: Ubah batas validasi ke 50
            if (count < 50) {
                charCountDiv.className = 'text-danger small mt-1';
            } else if (count < 100) { // Batas peringatan
                charCountDiv.className = 'text-warning small mt-1';
            } else {
                charCountDiv.className = 'text-success small mt-1';
            }
        });
        // Memicu event saat halaman dimuat
        coverLetterTextarea.dispatchEvent(new Event('input')); 
    }
    
    // Client-side file validation (Pre-submit)
    if (cvFileInput) {
        cvFileInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const maxSize = 10 * 1024 * 1024;
                if (!file.type.includes('pdf')) {
                    alert('Only PDF files are allowed.');
                    this.value = '';
                    return;
                }
                
                if (file.size > maxSize) {
                    alert('File size must be less than 10MB. Your file is too large.');
                    this.value = '';
                    return;
                }
            }
        });
    }
    
    // Enhanced form validation (On submit)
    if (applyForm) {
        applyForm.addEventListener('submit', function(e) {
            let isValid = true;
            let errorMessage = '';
            
            const coverLetter = document.getElementById('cover_letter').value;
            // FIX: Ubah batas validasi ke 50
            if (coverLetter.trim().length < 50) {
                isValid = false;
                errorMessage = 'Please write a more detailed cover letter (at least 50 characters).';
            }
            
            const cvFile = document.getElementById('cv_file').files[0];
            const maxSize = 10 * 1024 * 1024;

            if (!cvFile) {
                isValid = false;
                errorMessage = 'Please upload your CV file.';
            } else if (cvFile.size > maxSize) {
                isValid = false;
                errorMessage = 'File size must be less than 10MB. Your file is too large.';
            } else if (!cvFile.type.includes('pdf')) {
                isValid = false;
                errorMessage = 'Only PDF files are allowed.';
            }
            
            if (!isValid) {
                e.preventDefault();
                alert(errorMessage);
                return;
            }
            
            if (!confirm('Are you sure you want to submit your application? You cannot edit it after submission.')) {
                e.preventDefault();
            }
        });
    }


    // --- AddJobForm Logic (Textarea autoresize & validation) ---
    const textareas = document.querySelectorAll('.wrap textarea, .card-body textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        textarea.dispatchEvent(new Event('input'));
    });

    const addJobForm = document.querySelector('form[action$="/company/add-job"]');
    if (addJobForm) {
        addJobForm.addEventListener('submit', function(e) {
            const title = document.getElementById('title').value;
            const location = document.getElementById('location').value;
            const description = document.getElementById('description').value;
            
            const currentLang = localStorage.getItem('nk_lang') || 'en';
            const messages = {
                en: {
                    fill_fields: 'Please fill in all required fields.',
                    description_short: 'Please provide a more detailed job description (at least 20 characters).',
                    confirm: 'Are you sure you want to post this job?'
                },
                id: {
                    fill_fields: 'Harap isi semua bidang yang wajib diisi.',
                    description_short: 'Harap berikan deskripsi pekerjaan yang lebih detail (minimal 20 karakter).',
                    confirm: 'Apakah Anda yakin ingin memposting pekerjaan ini?'
                }
            };
            
            if (!title.trim() || !location.trim() || !description.trim()) {
                e.preventDefault();
                alert(messages[currentLang].fill_fields);
                return;
            }
            
            if (description.trim().length < 20) {
                e.preventDefault();
                alert(messages[currentLang].description_short);
                return;
            }
            
            if (!confirm(messages[currentLang].confirm)) {
                e.preventDefault();
            }
        });
    }

});