from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileAllowed, FileRequired
from wtforms import StringField, PasswordField, BooleanField, SubmitField, TextAreaField, IntegerField, SelectField
from wtforms.validators import DataRequired, Email, Length, EqualTo, ValidationError, Optional, NumberRange

class RegisterForm(FlaskForm):
    name = StringField('Full Name', validators=[DataRequired(), Length(min=2, max=100)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    phone = StringField('Phone Number', validators=[Optional(), Length(max=20)])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Confirm Password', validators=[DataRequired(), EqualTo('password')])

    role = SelectField('Role', choices=[('applicant', 'Job Seeker'), ('company', 'Company')], validators=[DataRequired()])
    company_name = StringField('Company Name', validators=[Optional(), Length(max=100)])
    description = TextAreaField('Company Description', validators=[Optional(), Length(max=500)])
    website = StringField('Website', validators=[Optional(), Length(max=200)])
    submit = SubmitField('Sign Up')

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class CompanyProfileForm(FlaskForm):
    company_name = StringField('Company Name', validators=[DataRequired(), Length(max=100)])
    description = TextAreaField('Description', validators=[DataRequired(), Length(max=500)])
    contact_email = StringField('Contact Email', validators=[DataRequired(), Email()]) 
    phone = StringField('Phone Number', validators=[Optional(), Length(max=20)]) 
    website = StringField('Website', validators=[Optional(), Length(max=200)])
    submit = SubmitField('Save Profile')

class AddJobForm(FlaskForm):
    title = StringField('Job Title', validators=[DataRequired(), Length(max=100)])
    location = StringField('Location', validators=[DataRequired(), Length(max=100)])
    description = TextAreaField('Job Description', validators=[DataRequired()])
    qualifications = TextAreaField('Qualifications', validators=[DataRequired()]) 
    slots = IntegerField('Available Slots', validators=[
        DataRequired(), 
        NumberRange(min=1, message='Slots must be at least 1')
    ], default=1)
    salary_min = IntegerField('Minimum Salary (Optional)', validators=[Optional(), NumberRange(min=0)])
    salary_max = IntegerField('Maximum Salary (Optional)', validators=[Optional(), NumberRange(min=0)])
    submit = SubmitField('Add Job')

class ApplyForm(FlaskForm):
    cover_letter = TextAreaField('Cover Letter', validators=[
        DataRequired(), 
        Length(min=50, message='Cover letter must be at least 100 characters long')
    ])
    cv_file = FileField('Upload CV (PDF, max 10MB)', validators=[
        FileRequired(message='Please upload your CV'),
        FileAllowed(['pdf'], 'Only PDF files are allowed!')
    ])
    submit = SubmitField('Submit Application')
    
    def validate_cv_file(self, field):
        if field.data:
            try:
                # Check file size (10MB limit)
                field.data.seek(0, 2)  # Go to end of file
                file_size = field.data.tell()
                field.data.seek(0)  # Reset file pointer
                
                if file_size > 10 * 1024 * 1024:  # 10MB in bytes
                    raise ValidationError('File size must be less than 10MB. Your file is too large.')
                
                # Additional security check - verify it's actually a PDF
                filename = field.data.filename.lower()
                if not filename.endswith('.pdf'):
                    raise ValidationError('Only PDF files are allowed.')
                    
            except OSError:
                # Handle case where file pointer cannot be moved
                raise ValidationError('Error reading file. Please try again.')
class ReactiveForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    submit = SubmitField('Send Reactivation Link')
    
class ResetPasswordForm(FlaskForm):
    password = PasswordField('Password', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Confirm Password', validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Reset Password')
    
class ApplicantProfileForm(FlaskForm):
    full_name = StringField('Full Name', validators=[DataRequired(), Length(min=2, max=100)])
    phone = StringField('Phone Number', validators=[Optional(), Length(max=20)])
    skills = TextAreaField('Skills', validators=[Optional(), Length(max=1000)], description="List your skills separated by commas (e.g., Python, Flask, UI/UX Design)")
    submit = SubmitField('Save Changes')