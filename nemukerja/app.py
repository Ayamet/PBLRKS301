import os
import uuid
import click
from flask import Flask, render_template, redirect, url_for, flash, request, jsonify, send_from_directory, current_app
from nemukerja.extensions import db, login_manager, bcrypt, mail
from flask_migrate import Migrate
from flask_login import login_user, login_required, logout_user, current_user
from nemukerja.models import User, Company, JobListing, Application, Applicant, Notification
from nemukerja.forms import (
    RegisterForm, 
    LoginForm, 
    CompanyProfileForm,
    AddJobForm, 
    ApplyForm, 
    ReactiveForm,
    ResetPasswordForm,
    ApplicantProfileForm
)
from werkzeug.utils import secure_filename
import json
from sqlalchemy import or_, desc
from sqlalchemy.orm import joinedload
from itsdangerous import URLSafeTimedSerializer as Serializer
from flask_mail import Message
from flask import current_app
from nemukerja.config import Config

PER_PAGE = 6
    
def get_reset_token(user, expires_sec=1800):
    """Membuat token reset password yang aman dan berbatas waktu."""
    s = Serializer(current_app.config['SECRET_KEY'], salt='password-reset-salt')
    return s.dumps(user.id)

def verify_reset_token(token, expires_sec=1800):
    """Memverifikasi token reset. Mengembalikan User jika valid, None jika tidak."""
    s = Serializer(current_app.config['SECRET_KEY'], salt='password-reset-salt')
    try:
        user_id = s.loads(token, max_age=expires_sec)
    except Exception:
        return None
    return User.query.get(user_id)

def send_reset_email(user):
    """Membuat dan mengirim email reset password."""
    token = get_reset_token(user)
    msg = Message('Permintaan Reset Password - NemuKerja',
                  sender=current_app.config['MAIL_USERNAME'],
                  recipients=[user.email])
    msg.body = f'''Untuk mereset password Anda, silakan kunjungi link berikut:
{url_for('reset_token', token=token, _external=True)}

Jika Anda tidak merasa meminta reset password ini, abaikan email ini.
Link ini akan kedaluwarsa dalam 30 menit.
'''
    mail.send(msg)

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    bcrypt.init_app(app)
    login_manager.init_app(app)
    mail.init_app(app)
    login_manager.login_view = 'login'
    migrate = Migrate(app, db)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Admin authorization decorator - INSIDE create_app
    def admin_required(f):
        @login_required
        def decorated_function(*args, **kwargs):
            if current_user.role != 'admin':
                flash('admin_required', 'danger') # DISESUAIKAN
                return redirect(url_for('dashboard'))
            return f(*args, **kwargs)
        decorated_function.__name__ = f.__name__
        return decorated_function

    # Admin Routes - INSIDE create_app
    @app.route('/admin/dashboard')
    @login_required
    @admin_required
    def admin_dashboard():
        total_users = User.query.count()
        total_companies = Company.query.count()
        total_jobs = JobListing.query.count()
        total_applications = Application.query.count()
        user_count = User.query.filter_by(role='applicant').count()
        company_user_count = User.query.filter_by(role='company').count()
        
        # PERBAIKAN: Kueri job stats yang lebih efisien
        open_jobs = JobListing.query.filter_by(is_open=True).count()
        closed_jobs = JobListing.query.filter_by(is_open=False).count()
        
        recent_users = User.query.order_by(desc(User.created_at)).limit(10).all()
        recent_jobs = JobListing.query.join(Company).order_by(desc(JobListing.posted_at)).limit(10).all()
        recent_applications = Application.query.join(Applicant).join(JobListing).order_by(desc(Application.applied_at)).limit(10).all()
        
        recent_activity = []
        
        # Peta status untuk terjemahan
        status_map = {
            'pending': {'en': 'Status Pending', 'id': 'Status Menunggu'},
            'accepted': {'en': 'Status Accepted', 'id': 'Status Diterima'},
            'rejected': {'en': 'Status Rejected', 'id': 'Status Ditolak'}
        }
        
        for user in recent_users:
            role_type = 'user' if user.role == 'applicant' else ('company' if user.role == 'company' else 'user')
            role_name_en = user.role.capitalize()
            role_name_id = 'Pencari Kerja' if user.role == 'applicant' else ('Perusahaan' if user.role == 'company' else user.role.capitalize())

            # PERBAIKAN: Buat string EN dan ID secara langsung
            recent_activity.append({
                'type': role_type,
                'desc_en': f"User '{user.name}' ({role_name_en}) registered.",
                'desc_id': f"Pengguna '{user.name}' ({role_name_id}) telah terdaftar.",
                'date': user.created_at
            })
            
        for job in recent_jobs:
            # PERBAIKAN: Buat string EN dan ID secara langsung
            recent_activity.append({
                'type': 'job',
                'desc_en': f"New job '{job.title}' posted by {job.company.company_name}.",
                'desc_id': f"Pekerjaan baru '{job.title}' diposting oleh {job.company.company_name}.",
                'date': job.posted_at
            })
            
        for app in recent_applications:
            # Dapatkan terjemahan status dari peta
            status_translation = status_map.get(app.status, {'en': f'Status {app.status}', 'id': f'Status {app.status}'})

            # PERBAIKAN: Buat string EN dan ID secara langsung
            recent_activity.append({
                'type': 'application',
                'desc_en': f"'{app.applicant.full_name}' applied for '{app.job.title}' ({status_translation['en']}).",
                'desc_id': f"'{app.applicant.full_name}' melamar untuk '{app.job.title}' ({status_translation['id']}).",
                'date': app.applied_at
            })
            
        recent_activity.sort(key=lambda x: x['date'], reverse=True)
        recent_activity = recent_activity[:20]
            
        recent_activity.sort(key=lambda x: x['date'], reverse=True)
        recent_activity = recent_activity[:20]
        for activity in recent_activity:
            activity['date'] = activity['date'].strftime('%Y-%m-%d %H:%M')
        
        return render_template('admin_dashboard.html',
                             total_users=total_users,
                             total_companies=total_companies,
                             total_jobs=total_jobs,
                             total_applications=total_applications,
                             user_count=user_count,
                             company_user_count=company_user_count,
                             open_jobs=open_jobs,
                             closed_jobs=closed_jobs,
                             recent_activity=recent_activity)

    @app.route('/admin/users')
    @login_required
    @admin_required
    def admin_users():
        # from sqlalchemy.orm import joinedload (Pindah ke atas)
        users = User.query.options(joinedload(User.applicant_profile), joinedload(User.company_profile)).all()
        return render_template('admin_users.html', users=users)

    @app.route('/admin/companies')
    @login_required
    @admin_required
    def admin_companies():
        companies = Company.query.all()
        return render_template('admin_companies.html', companies=companies)

    @app.route('/admin/jobs')
    @login_required
    @admin_required
    def admin_jobs():
        jobs = JobListing.query.all()
        return render_template('admin_jobs.html', jobs=jobs)

    @app.route('/')
    def index():
        # Ambil parameter filter dari URL (GET request)
        page = request.args.get('page', 1, type=int)
        q = request.args.get('q', '')
        location = request.args.get('location', '')
        company_name = request.args.get('company', '')
        min_salary_str = request.args.get('salary', '')

        # Mulai kueri dasar
        query = JobListing.query.filter_by(is_open=True)

        # 1. Filter Kata Kunci (q)
        if q:
            search_term = f"%{q}%"
            query = query.filter(or_(
                JobListing.title.ilike(search_term),
                JobListing.description.ilike(search_term),
                JobListing.qualifications.ilike(search_term)
            ))

        # 2. Filter Lokasi
        if location:
            query = query.filter(JobListing.location.ilike(f"%{location}%"))

        # 3. Filter Perusahaan (Membutuhkan JOIN)
        if company_name:
            query = query.join(Company).filter(Company.company_name.ilike(f"%{company_name}%"))

        # 4. Filter Gaji Minimal
        if min_salary_str:
            try:
                min_salary = int(min_salary_str)
                # Filter pekerjaan yang gaji minimalnya (salary_min) lebih besar
                # atau sama dengan yang diminta pengguna.
                query = query.filter(JobListing.salary_min >= min_salary)
            except ValueError:
                pass # Abaikan jika input gajinya tidak valid

        # Eksekusi kueri
        jobs_pagination = query.order_by(JobListing.posted_at.desc()).paginate(
            page=page, per_page=PER_PAGE, error_out=False
        )
        
        # Kirim 'request.args' ke template agar formulir tetap terisi
        return render_template('index.html', 
                               jobs_pagination=jobs_pagination, 
                               guest=True, 
                               request=request)

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        form = LoginForm()
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data.lower()).first()
            if user and bcrypt.check_password_hash(user.password, form.password.data):
                login_user(user, remember=form.remember.data)
                return redirect(url_for('dashboard'))
            flash('login_invalid', 'danger')
        return render_template('login.html', form=form)

    @app.route('/register', methods=['GET', 'POST'])
    def register():
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        form = RegisterForm()
        if form.validate_on_submit():
            if User.query.filter_by(email=form.email.data.lower()).first():
                flash('register_email_exists', 'danger')
                return redirect(url_for('register'))

            pw_hash = bcrypt.generate_password_hash(form.password.data).decode('utf-8')
            new_user = User(
                email=form.email.data.lower(),
                password=pw_hash,
                role=form.role.data
            )
            db.session.add(new_user)
            db.session.commit()

            if form.role.data == 'applicant':
                profile = Applicant(id_user=new_user.id, full_name=form.name.data, phone=form.phone.data)
                db.session.add(profile)
            elif form.role.data == 'company':
                profile = Company(
                    id_user=new_user.id,
                    company_name=form.company_name.data,
                    description=form.description.data,
                    contact_email=new_user.email,
                    phone=form.phone.data
                )
                db.session.add(profile)

            db.session.commit()
            flash('register_success', 'success')
            return redirect(url_for('login'))
        return render_template('register.html', form=form)

    @app.route('/reactivate', methods=['GET', 'POST'])
    def reactivate():
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        form = ReactiveForm()
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data.lower()).first()
            if user:
                send_reset_email(user)
            # Selalu tampilkan pesan ini, baik user ada atau tidak (demi keamanan)
            flash('reactivate_info', 'info') # DISESUAIKAN
            return redirect(url_for('login'))
        return render_template('reactive.html', form=form)
    
    @app.route('/reset_password/<token>', methods=['GET', 'POST'])
    def reset_token(token):
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        
        user = verify_reset_token(token)
        if user is None:
            flash('token_invalid', 'danger') # DISESUAIKAN
            return redirect(url_for('reactivate'))
        
        form = ResetPasswordForm()
        if form.validate_on_submit():
            pw_hash = bcrypt.generate_password_hash(form.password.data).decode('utf-8')
            user.password = pw_hash
            db.session.commit()
            flash('reset_success', 'success') # DISESUAIKAN
            return redirect(url_for('login'))
        
        return render_template('reset_token.html', form=form)

    @app.route('/my-applications')
    @login_required
    def my_applications():
        if current_user.role != 'applicant':
            flash('applicant_only', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        applicant = current_user.applicant_profile
        if not applicant:
            flash('applicant_profile_not_found', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        applications = Application.query.filter_by(id_applicant=applicant.id).order_by(Application.applied_at.desc()).all()
        
        return render_template('my_applications.html', applications=applications, title_suffix="All Applications")

    @app.route('/my-pending')
    @login_required
    def my_pending_applications():
        if current_user.role != 'applicant':
            flash('applicant_only', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        applicant = current_user.applicant_profile
        if not applicant:
            flash('applicant_profile_not_found', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        # Filter hanya yang Pending
        applications = Application.query.filter_by(
            id_applicant=applicant.id,
            status='pending'
        ).order_by(Application.applied_at.desc()).all()
        
        return render_template('my_applications.html', applications=applications, title_suffix="Pending Applications")

    @app.route('/my-accepted')
    @login_required
    def my_accepted_applications():
        if current_user.role != 'applicant':
            flash('applicant_only', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        applicant = current_user.applicant_profile
        if not applicant:
            flash('applicant_profile_not_found', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        # Filter hanya yang Diterima
        applications = Application.query.filter_by(
            id_applicant=applicant.id,
            status='accepted'
        ).order_by(Application.applied_at.desc()).all()
        
        return render_template('my_applications.html', applications=applications, title_suffix="Accepted Applications")


    # Notification routes
    @app.route('/notifications')
    @login_required
    def get_notifications():
        notifications = Notification.query.filter_by(id_user=current_user.id).order_by(Notification.created_at.desc()).limit(10).all()
        return jsonify([n.to_dict() for n in notifications])
    
    # NEW API: Mendapatkan Job ID dari Application ID (untuk navigasi notifikasi)
    @app.route('/api/get_job_id/<int:application_id>')
    @login_required
    def get_job_id_from_application(application_id):
        application = Application.query.get(application_id)
        if not application:
            return jsonify({'job_id': None}), 404
        
        # Jika pengguna adalah Pelamar, pastikan aplikasi ini miliknya
        if current_user.role == 'applicant' and application.id_applicant != current_user.applicant_profile.id:
             return jsonify({'job_id': None}), 403
        
        # Jika pengguna adalah Perusahaan, pastikan aplikasi ini untuk lowongan mereka
        if current_user.role == 'company' and application.job.company.user.id != current_user.id:
            return jsonify({'job_id': None}), 403

        return jsonify({'job_id': application.id_job})

    @app.route('/notifications/read/<int:notification_id>', methods=['POST'])
    @login_required
    def mark_notification_read(notification_id):
        notification = Notification.query.get_or_404(notification_id)
        if notification.id_user != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        notification.is_read = True
        db.session.commit()
        return jsonify({'success': True})

    @app.route('/notifications/read-all', methods=['POST'])
    @login_required
    def mark_all_notifications_read():
        Notification.query.filter_by(id_user=current_user.id, is_read=False).update({'is_read': True})
        db.session.commit()
        return jsonify({'success': True})

    @app.route('/company-profile', methods=['GET', 'POST'])
    @login_required
    def company_profile():
        if current_user.role != 'company':
            flash('company_only', 'danger') # DISESUAIKAN
            return redirect(url_for('index'))

        company = current_user.company_profile
        if not company:
            company = Company(id_user=current_user.id, company_name="New Company")
            db.session.add(company)
            db.session.commit()

        form = CompanyProfileForm(obj=company)
        if form.validate_on_submit():
            form.populate_obj(company)
            db.session.commit()
            flash('company_profile_saved', 'success') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        return render_template('company_profile.html', form=form, company=company)

    @app.route('/logout')
    @login_required
    def logout():
        logout_user()
        return redirect(url_for('index'))

    @app.route('/dashboard')
    @login_required
    def dashboard():
        page = request.args.get('page', 1, type=int)
        if current_user.role == 'admin':
            return redirect(url_for('admin_dashboard'))
        elif current_user.role == 'company':
            company = current_user.company_profile
            if not company or not company.company_name:
                flash('company_profile_required', 'warning') # DISESUAIKAN
                return redirect(url_for('company_profile'))

            jobs_query = JobListing.query.filter_by(id_company=company.id).order_by(JobListing.posted_at.desc())
            jobs_pagination = jobs_query.paginate(
                page=page, per_page=PER_PAGE, error_out=False
            )
            total_jobs = jobs_pagination.total # Ambil total dari pagination
            total_applications = sum(len(job.applications) for job in jobs_pagination.items) # Hitung dari item halaman ini (atau bisa di-query terpisah jika perlu)
            recent_applications = db.session.query(Application).join(JobListing).filter(JobListing.id_company == company.id).order_by(Application.applied_at.desc()).limit(5).all()

            return render_template('dashboard_company.html',
                                     jobs_pagination=jobs_pagination,
                                     company=company,
                                     total_jobs=total_jobs,
                                     total_applications=total_applications,
                                     recent_applications=recent_applications,
                                     request=request)
        else: 
            # Ambil parameter filter dari URL (GET request)
            q = request.args.get('q', '')
            location = request.args.get('location', '')
            company_name = request.args.get('company', '')
            min_salary_str = request.args.get('salary', '')

            # Mulai kueri dasar
            query = JobListing.query.filter_by(is_open=True)

            # 1. Filter Kata Kunci (q)
            if q:
                search_term = f"%{q}%"
                query = query.filter(or_(
                    JobListing.title.ilike(search_term),
                    JobListing.description.ilike(search_term),
                    JobListing.qualifications.ilike(search_term)
                ))

            # 2. Filter Lokasi
            if location:
                query = query.filter(JobListing.location.ilike(f"%{location}%"))

            # 3. Filter Perusahaan (Membutuhkan JOIN)
            if company_name:
                query = query.join(Company).filter(Company.company_name.ilike(f"%{company_name}%"))

            # 4. Filter Gaji Minimal
            if min_salary_str:
                try:
                    min_salary = int(min_salary_str)
                    query = query.filter(JobListing.salary_min >= min_salary)
                except ValueError:
                    pass # Abaikan jika input gajinya tidak valid

            # Eksekusi kueri
            jobs_pagination = query.order_by(JobListing.posted_at.desc()).paginate(
                page=page, per_page=PER_PAGE, error_out=False
            )
            
            applicant_profile = current_user.applicant_profile
            total_app = applicant_profile.applications if applicant_profile else []
            pending_app_count = len([app for app in total_app if app.status == 'pending'])
            accepted_app_count = len([app for app in total_app if app.status == 'accepted'])

            return render_template('dashboard_user.html', 
                                   jobs_pagination=jobs_pagination, 
                                   guest=False,
                                   total_app_count=len(total_app),
                                   pending_app_count=pending_app_count,
                                   accepted_app_count=accepted_app_count,
                                   request=request)
            
    @app.route('/profile')
    @login_required
    def profile():
        """Menampilkan halaman profil berdasarkan role pengguna."""
        if current_user.role == 'applicant':
            return render_template('profile_applicant.html')
        elif current_user.role == 'company':
            # Untuk perusahaan, kita tampilkan data mereka. Halaman editnya adalah 'company_profile'
            return render_template('profile_company.html')
        else:
            return redirect(url_for('dashboard'))

    @app.route('/profile/edit', methods=['GET', 'POST'])
    @login_required
    def edit_profile():
        """Menampilkan form edit profil berdasarkan role."""
        if current_user.role == 'applicant':
            profile = current_user.applicant_profile
            form = ApplicantProfileForm(obj=profile)

            if form.validate_on_submit():
                profile.full_name = form.full_name.data
                profile.skills = form.skills.data
                profile.phone = form.phone.data
                db.session.commit()
                flash('profile_updated', 'success') # DISESUAIKAN (Key baru)
                return redirect(url_for('profile'))

            return render_template('edit_profile_applicant.html', form=form)

        elif current_user.role == 'company':
            # --- INI BAGIAN YANG DIPERBAIKI ---
            profile = current_user.company_profile
            # Kita gunakan CompanyProfileForm di sini
            form = CompanyProfileForm(obj=profile) 

            if form.validate_on_submit():
                form.populate_obj(profile)
                db.session.commit()
                flash('company_profile_saved', 'success') # DISESUAIKAN (Menggunakan key yang sama)
                return redirect(url_for('profile'))

            # Render template edit yang baru kita buat
            return render_template('edit_profile_company.html', form=form)
            # --- AKHIR PERBAIKAN ---
        else:
            return redirect(url_for('dashboard'))

    @app.route('/company/<int:company_id>')
    def public_company_profile(company_id):
        """Halaman profil publik untuk sebuah perusahaan."""
        company = Company.query.get_or_404(company_id)
        # Ambil hanya lowongan yang sedang dibuka oleh perusahaan ini
        open_jobs = JobListing.query.filter_by(
            id_company=company_id, 
            is_open=True
        ).order_by(JobListing.posted_at.desc()).all()
        
        return render_template('public_company_profile.html', company=company, jobs=open_jobs)

    @app.route('/job/<int:job_id>')
    def job_detail(job_id):
        job = JobListing.query.get_or_404(job_id)
        
        # Hitung pelamar aktif (Pending atau Diterima)
        used_slots = Application.query.filter_by(id_job=job.id).filter(
            Application.status.in_(['pending', 'accepted'])
        ).count()
        
        data = {
            'id': job.id,
            'title': job.title,
            'location': job.location,
            'description': job.description,
            'qualifications': job.qualifications,
            'company': job.company.company_name if job.company else "N/A",
            'company_id': job.company.id if job.company else None,
            'applied_count': used_slots,
            'slots': job.slots,
            'is_open': job.is_open,
            'salary_min': job.salary_min,
            'salary_max': job.salary_max
        }
        return jsonify(data)

    @app.route('/apply/<int:job_id>', methods=['GET', 'POST'])
    @login_required
    def apply(job_id):
        if current_user.role != 'applicant':
            flash('applicant_only', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        job = JobListing.query.get_or_404(job_id)
        applicant = current_user.applicant_profile
        
        # --- NEW SLOT CHECK LOGIC ---
        # Hitung slot yang terpakai (Pending atau Diterima)
        used_slots = Application.query.filter_by(id_job=job.id).filter(
            Application.status.in_(['pending', 'accepted'])
        ).count()
        
        if used_slots >= job.slots:
            flash('apply_slot_full', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        if not job.is_open:
            flash('apply_job_closed', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        # --- END NEW SLOT CHECK LOGIC ---

        if not applicant:
            flash('applicant_profile_not_found', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        # Check if already applied
        existing_application = Application.query.filter_by(
            id_applicant=applicant.id, 
            id_job=job.id
        ).first()
        if existing_application:
            flash('apply_already_applied', 'warning') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        form = ApplyForm()
        if form.validate_on_submit():
            # Handle CV upload
            cv_file = form.cv_file.data
            if cv_file:
                try:
                    # Generate unique filename
                    original_filename = secure_filename(cv_file.filename)
                    file_ext = os.path.splitext(original_filename)[1]
                    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
                    
                    # Ensure upload directory exists
                    upload_dir = os.path.join(current_app.root_path, 'static', 'uploads', 'cv')
                    os.makedirs(upload_dir, exist_ok=True)
                    
                    # Save file
                    file_path = os.path.join(upload_dir, unique_filename)
                    cv_file.save(file_path)
                    
                    # Update applicant with CV path (using existing cv_path field)
                    applicant.cv_path = unique_filename
                    db.session.commit()
                    
                except Exception as e:
                    flash('apply_cv_error', 'danger') # DISESUAIKAN
                    return redirect(url_for('apply', job_id=job_id))

            # Create application
            application = Application(
                id_applicant=applicant.id,
                id_job=job.id,
                notes=form.cover_letter.data
            )
            db.session.add(application)
            db.session.commit()
            
            # Create notification for company when application is received
            notification = Notification(
                id_user=job.company.id_user,
                title="New Application Received",
                message=f"{current_user.applicant_profile.full_name} applied for {job.title}",
                type='application_received',
                related_id=application.id
            )
            db.session.add(notification)
            db.session.commit()
            
            flash('apply_success', 'success') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        return render_template('apply.html', form=form, job=job)

    # ADD new route for viewing CV
    @app.route('/cv/<filename>')
    @login_required
    def view_cv(filename):
        # Security check - only company can view CV
        if current_user.role != 'company':
            flash('unauthorized', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        return send_from_directory(
            os.path.join(current_app.root_path, 'static', 'uploads', 'cv'),
            filename
        )
    
    @app.route('/company/job/<int:job_id>/close', methods=['POST'])
    @login_required
    def close_job(job_id):
        job = JobListing.query.get_or_404(job_id)
        if current_user.role != 'company' or job.company.user.id != current_user.id:
            flash('unauthorized_job', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        job.is_open = False
        db.session.commit()
        flash('job_closed', 'warning') # DISESUAIKAN
        return redirect(url_for('dashboard'))

    @app.route('/company/job/<int:job_id>/open', methods=['POST'])
    @login_required
    def open_job(job_id):
        job = JobListing.query.get_or_404(job_id)
        if current_user.role != 'company' or job.company.user.id != current_user.id:
            flash('unauthorized_job', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        
        job.is_open = True
        db.session.commit()
        flash('job_reopened', 'success') # DISESUAIKAN
        return redirect(url_for('dashboard'))

    @app.route('/company/job/<int:job_id>/delete', methods=['POST'])
    @login_required
    def delete_job(job_id):
        job = JobListing.query.get_or_404(job_id)
        if current_user.role != 'company' or job.company.user.id != current_user.id:
            flash('unauthorized_job', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        if job.is_open:
            flash('job_close_first', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        job_title = job.title
        
        # Collect IDs of users who applied
        applicant_users = [app.applicant.user for app in job.applications]

        db.session.delete(job)
        db.session.commit()
        
        # Create notifications for relevant applicants
        for user in applicant_users:
            notification = Notification(
                id_user=user.id,
                title="Job Posting Removed",
                message=f"The job '{job_title}' you applied for has been removed by the company.",
                type='job_posted',
                related_id=None 
            )
            db.session.add(notification)
        db.session.commit()

        flash('job_deleted', 'success') # DISESUAIKAN
        return redirect(url_for('dashboard'))

    @app.route('/company/add-job', methods=['GET', 'POST'])
    @login_required
    def add_job():
        if current_user.role != 'company':
            flash('company_only', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        company = current_user.company_profile
        if not company:
            flash('company_profile_required', 'warning') # DISESUAIKAN
            return redirect(url_for('company_profile'))

        form = AddJobForm()
        if form.validate_on_submit():
            new_job = JobListing(
                title=form.title.data,
                location=form.location.data,
                description=form.description.data,
                qualifications=form.qualifications.data,
                slots=form.slots.data,
                id_company=company.id,
                salary_min=form.salary_min.data or 0,
                salary_max=form.salary_max.data or 0
            )
            db.session.add(new_job)
            db.session.commit()
            
            # Create notifications for all applicants when new job is posted
            applicants = Applicant.query.all()
            for applicant in applicants:
                notification = Notification(
                    id_user=applicant.id_user,
                    title="New Job Posted",
                    message=f"A new job '{new_job.title}' has been posted by {company.company_name}",
                    type='job_posted',
                    related_id=new_job.id
                )
                db.session.add(notification)
            db.session.commit()
            
            flash('job_added', 'success') # DISESUAIKAN
            return redirect(url_for('dashboard'))
        return render_template('add_job.html', form=form)

    @app.route('/company/job/<int:job_id>/edit', methods=['GET', 'POST'])
    @login_required
    def edit_job(job_id):
        if current_user.role != 'company':
            return redirect(url_for('dashboard'))
        job = JobListing.query.get_or_404(job_id)

        if job.company.user.id != current_user.id:
            flash('unauthorized_job', 'danger') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        form = AddJobForm(obj=job)
        if form.validate_on_submit():
            form.populate_obj(job)
            db.session.commit()
            flash('job_updated', 'success') # DISESUAIKAN
            return redirect(url_for('dashboard'))

        return render_template('edit_job.html', form=form, job=job)

    @app.route('/company/applications')
    @login_required
    def company_applications():
        if current_user.role != 'company':
            return redirect(url_for('dashboard'))
        company = current_user.company_profile
        if not company:
            return redirect(url_for('dashboard'))

        applications = db.session.query(Application).join(JobListing).filter(JobListing.id_company == company.id).order_by(Application.applied_at.desc()).all()
        return render_template('company_applications.html', applications=applications)

    @app.route('/company/application/<int:application_id>/accept', methods=['POST'])
    @login_required
    def accept_application(application_id):
        if current_user.role != 'company':
            return redirect(url_for('dashboard'))
        application = Application.query.get_or_404(application_id)

        if application.job.company.user.id != current_user.id:
            flash('unauthorized_app', 'danger') # DISESUAIKAN
            return redirect(url_for('company_applications'))
        
        application.status = 'accepted'
        db.session.commit()
        
        # Create notification for applicant when application is accepted
        notification = Notification(
            id_user=application.applicant.id_user,
            title="Application Status Updated",
            message=f"Your application for {application.job.title} has been accepted",
            type='application_status',
            related_id=application.id
        )
        db.session.add(notification)
        db.session.commit()
        
        flash('app_accepted', 'success') # DISESUAIKAN
        return redirect(url_for('view_application', application_id=application_id))

    @app.route('/company/application/<int:application_id>/reject', methods=['POST'])
    @login_required
    def reject_application(application_id):
        if current_user.role != 'company':
            return redirect(url_for('dashboard'))
        application = Application.query.get_or_404(application_id)

        if application.job.company.user.id != current_user.id:
            flash('unauthorized_app', 'danger') # DISESUAIKAN
            return redirect(url_for('company_applications'))
        
        application.status = 'rejected'
        db.session.commit()
        
        # Create notification for applicant when application is rejected
        notification = Notification(
            id_user=application.applicant.id_user,
            title="Application Status Updated",
            message=f"Your application for {application.job.title} has been rejected",
            type='application_status',
            related_id=application.id
        )
        db.session.add(notification)
        db.session.commit()
        
        flash('app_rejected', 'info') # DISESUAIKAN
        return redirect(url_for('view_application', application_id=application_id))

    @app.route('/company/application/<int:application_id>')
    @login_required
    def view_application(application_id):
        if current_user.role != 'company':
            return redirect(url_for('dashboard'))
        application = Application.query.get_or_404(application_id)

        if application.job.company.user.id != current_user.id:
            flash('unauthorized_view_app', 'danger') # DISESUAIKAN
            return redirect(url_for('company_applications'))
        return render_template('view_application.html', application=application)

    @app.route('/about')
    def about():
        return render_template('about.html')

    @app.route('/contact')
    def contact():
        return render_template('contact.html')

    @app.route('/address')
    def address():
        return render_template('address.html')
    
    @app.route('/notifications/clear-all', methods=['POST'])
    @login_required
    def clear_all_notifications():
        # Menghapus semua notifikasi milik pengguna
        # FIX: Menambahkan synchronize_session=False untuk batch delete agar commit berhasil di DB
        Notification.query.filter_by(id_user=current_user.id).delete(synchronize_session=False)
        db.session.commit()
        return jsonify({'success': True})
    
    @app.cli.command("create-admin")
    @click.argument("email")
    @click.argument("password")
    def create_admin(email, password):
        """Membuat user admin baru dari terminal.
        Contoh: flask create-admin admin@nemukerja.com password123
        """
        if User.query.filter_by(email=email).first():
            print(f"Error: Email '{email}' sudah terdaftar.")
            return

        pw_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        new_admin = User(
            email=email.lower(),
            password=pw_hash,
            role='admin'
        )
        db.session.add(new_admin)
        db.session.commit()
        print(f"Sukses! Admin user '{email}' telah dibuat.")

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)