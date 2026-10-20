# 🏫 STIRAMS (Web)

**RFID Attendance Management System — Web Dashboard** · `Web`

Full-stack web attendance management system for STI College Santa Rosa with RFID scanning, DTR generation, faculty scheduling, and audit logging.

## Why This Project

At STI College Santa Rosa, faculty attendance used to be a paper affair: instructors signed log sheets, and at every cutoff the HR office re-typed those sheets into Daily Time Record forms for payroll — lates, undertimes, absences, and holiday premiums all computed by hand. Reconciling one department meant flipping through stacks of paper, and a single misplaced entry could quietly cost someone a paycheck. Built as internship/capstone work for the campus, STIRAMS replaces that pipeline end-to-end: RFID taps captured at the campus kiosk flow into this dashboard, where administrators verify them, resolve irregularities, and produce payroll-ready DTRs in minutes instead of days.

The web dashboard is the administrative half of STIRAMS, made for the registrar, HR/payroll staff, and department heads who need one browser-accessible place to see who is present today, manage teaching loads and substitutions, approve leave filings, and generate the documents payroll actually accepts — with role-based access and a full audit trail so accountability is never in question.

## How It Works

1. At 7:45 AM, Prof. Dela Cruz taps her RFID card at the campus kiosk; the desktop client validates the card, records her time-in, and syncs the log to the central STIRAMS database.
2. Her department head opens the dashboard from a browser and lands on the live overview — today's present/late/absent counts, the real-time attendance feed, and per-department charts update without a refresh.
3. When a teacher calls in sick, the HR officer assigns a substitute from the Substitute Assignment screen; the substitution is pushed back to the kiosk so the replacement's taps are validated against the right class schedule.
4. Halfway through the term, the registrar builds class loads and exam coverage in the Schedule Management pages, and declares holidays that automatically affect attendance status and premium-pay calculations.
5. At the end of the cutoff, the payroll clerk opens Reports, selects the cutoff period and faculty member, previews the generated Daily Time Record, and bulk-prints (or e-mails) the forms for signature — no manual transcription anywhere.
6. Every login, edit, and approval is written to the Log Trail, and the Backup module keeps a restorable snapshot of the database in case anything goes wrong.

## Modules

### Authentication & Session Management
Login, logout, session inspection, and account-recovery endpoints secured with bcrypt credential checks, HMAC-signed tokens in HttpOnly cookies, and CSRF tokens. Only authorized STI personnel can reach the dashboard, and sessions can be invalidated centrally.
**Scenario:** The IT officer gives a new admin her campus credentials; the admin signs in on the login page, is issued a signed session, and every action she takes afterwards is tied to her account in the audit trail — when she logs out from the header, the session is revoked immediately.

### Dashboard Overview
The landing page of the dashboard: quick stats, recent activity, department attendance, and weekly attendance endpoints give an at-a-glance workforce snapshot.
**Scenario:** At 8:00 AM, the principal opens the dashboard and sees that 84 of 97 faculty are already timed in, three are late, and yesterday's weekly chart shows the College of Criminology trending late every Monday — she flags it to the department head before the first class starts.

### Attendance Monitoring
Live attendance logs, daily summaries, irregularity reports, day policies, and an "unlogged" list let HR watch time-in/time-out events as they happen and catch missing records the same day.
**Scenario:** HR officer Ana reviews the live feed after first period and notices Prof. Santos timed in but never timed out; she opens the irregularities report, confirms the missing log, and corrects it before it reaches payroll.

### DTR & Payroll Reports
The Daily Time Record engine: cutoff-based DTR generation, per-employee and bulk Excel exports, printable faculty DTR forms with signature blocks, timesheet views, and bulk DTR e-mailing.
**Scenario:** On the 15th, payroll clerk Marvin selects the semi-monthly cutoff, previews one faculty DTR to verify the lates and undertimes render correctly, then bulk-prints the whole department's forms and e-mails copies to each instructor for acknowledgment.

### Class Schedule Management
Weekly class-load builder with dialogs, table views, schedule import/processing endpoints, and integrity checks across rooms, subjects, and teaching schedules.
**Scenario:** The registrar imports the new term's teaching loads, spots an empty Monday 7:00 AM slot for Sir Reyes in the table view, and assigns the section directly from the dialog — the kiosk immediately starts validating his taps against that class.

### Exam Schedule Management
Faculty exam-coverage scheduling with its own dialogs, table views, and week/period filters, kept separate from regular class loads.
**Scenario:** During finals week, the exams coordinator assigns coverage for the Grade 12 final exams; teachers assigned a duty that week see their schedule reflected in status calculations instead of being marked absent for missing their regular class.

### Employee Directory
The central HR database — search, filter, create, and delete staff records organized by department, employment status, and photo profiles.
**Scenario:** When a new instructor is hired, HR officer Ana adds her profile with department, status, and photo; from then on her RFID taps resolve to a name, department, and schedule across every module of the system.

### Holiday & Calendar Management
Declare non-working days and holidays that override attendance rules, plus a calendar view of terms and events.
**Scenario:** The admin declares a campus-wide holiday for Ninoy Aquino Day; staff who tap in that day are flagged as holiday-present for premium pay, and nobody is incorrectly marked late for missing their shift.

### Substitution Management
Substitute assignment, substitution forms, eligibility/availability checks, active-substitution detection, and a records archive for accountability.
**Scenario:** When Sir Gomez reports sick at 7:30 AM, the admin assigns Ma'am Flores as the substitute for his 8:00 AM class; the assignment is logged, later archived in Substitution Forms, and shows up in workload evaluations at end of term.

### Leave & Verification Filings
Leave requests and approvals backed by a leave-token system (10 tokens/year), plus verification filings with RFID re-tap and scan endpoints for missed or disputed logs.
**Scenario:** Prof. Lim files a two-day sick leave and her remaining tokens drop accordingly; the admin verifies it against her RFID history, and a colleague who forgot to tap uses the verification form to submit a re-tap request that the admin approves after checking the kiosk log.

### Audit Log Trail
A full activity ledger capturing logins, record creations, and modifications with actor, timestamp, and action detail.
**Scenario:** When a schedule change is questioned a month later, the IT officer opens Log Trail, filters by the employee record, and sees exactly which admin edited it and when — tampering is surfaced in seconds.

### Academic Term Setup
School year and semester configuration that every schedule, attendance rule, and report is anchored to.
**Scenario:** Before the opening of classes, the registrar creates School Year 2025–2026, First Semester; schedules, DTR cutoffs, and leave tokens now count against the new term, and an active-term warning modal blocks misconfigured operation until it is set.

### Backup & Recovery Console
Database backup and restore endpoints, database status checks, and a dedicated recovery console for emergency access when normal routes fail.
**Scenario:** Every Friday the sysadmin clicks Backup and notes the fresh last-backup date; after a bad import wipes part of a table, he restores the previous snapshot from the recovery console and the dashboard comes back with no data loss.

### Notifications & Email
Real-time notification stream, read/mark-all-read controls in the header, log-based notification sync, and single/bulk e-mail sending for DTRs and announcements.
**Scenario:** A verification request is approved on the dashboard, the instructor gets a notification bell alert instantly, and the payroll clerk uses the bulk mailer to send the whole department their DTR PDFs in one action.

## Features

- RFID-based time-in/time-out tracking with real-time status
- Daily Time Record (DTR) generation and bulk printing
- Faculty class schedule and exam schedule management
- Employee directory with department organization
- Holiday and substitution assignment management
- Verification filings with leave token settings
- Full audit log trail with activity tracking
- Academic term configuration
- Database backup and restore

## Tech Stack

- React
- Node.js
- Express
- PostgreSQL
- Tailwind CSS
- JWT Auth

## About

Web-based companion to the STIRAMS desktop application. Provides administrators and faculty with a browser-accessible dashboard for managing attendance, schedules, DTRs, and employee records. Features role-based access, printable DTR forms, and a comprehensive audit trail.

## Screenshots

### Secure entry point — only authorized STI personnel can log in. The campus building photo reinforces institutional identity while the glass card keeps the focus on authentication.

![Secure entry point — only authorized STI personnel can log in. The campus building photo reinforces institutional identity while the glass card keeps the focus on authentication.](screenshots/1.png)

### Daily briefing — the dashboard gives administrators an instant snapshot of workforce status: how many employees are present, which department they belong to, and whether anyone is late today.

![Daily briefing — the dashboard gives administrators an instant snapshot of workforce status: how many employees are present, which department they belong to, and whether anyone is late today.](screenshots/2.png)

### Live attendance feed — monitors every time-in and time-out event as it happens, categorized by attendance type (present, late, absent, etc.) so HR can spot patterns and address issues in real time.

![Live attendance feed — monitors every time-in and time-out event as it happens, categorized by attendance type (present, late, absent, etc.) so HR can spot patterns and address issues in real time.](screenshots/3.png)

### DTR generation center — the payroll preparation tool. Administrators select a cutoff period and faculty member, then generate or bulk-print official Daily Time Record forms needed for salary processing.

![DTR generation center — the payroll preparation tool. Administrators select a cutoff period and faculty member, then generate or bulk-print official Daily Time Record forms needed for salary processing.](screenshots/4.png)

### DTR preview — shows the exact printable form before it goes to print, ensuring time logs are accurate before submission to HR or accounting. Prevents costly payroll errors.

![DTR preview — shows the exact printable form before it goes to print, ensuring time logs are accurate before submission to HR or accounting. Prevents costly payroll errors.](screenshots/5.png)

### Class schedule builder — lets administrators assign weekly class loads to each faculty member. Empty slots indicate unassigned periods that need to be filled for the upcoming term.

![Class schedule builder — lets administrators assign weekly class loads to each faculty member. Empty slots indicate unassigned periods that need to be filled for the upcoming term.](screenshots/6.png)

### Exam schedule management — organizes faculty exam coverage. The empty state here indicates no teaching staff have been assigned exam duties yet for the current period.

![Exam schedule management — organizes faculty exam coverage. The empty state here indicates no teaching staff have been assigned exam duties yet for the current period.](screenshots/7.png)

### Employee directory — the central HR database where administrators search, filter, and manage all staff members organized by department. Used for onboarding, transfers, and record-keeping.

![Employee directory — the central HR database where administrators search, filter, and manage all staff members organized by department. Used for onboarding, transfers, and record-keeping.](screenshots/8.png)

### Holiday calendar — lets admins declare non-working days that affect attendance calculations. Employees marked present on a declared holiday receive premium pay.

![Holiday calendar — lets admins declare non-working days that affect attendance calculations. Employees marked present on a declared holiday receive premium pay.](screenshots/9.png)

### Substitution manager — when a faculty member is absent, administrators assign a substitute teacher here. Ensures classes aren't cancelled when someone is sick or on leave.

![Substitution manager — when a faculty member is absent, administrators assign a substitute teacher here. Ensures classes aren't cancelled when someone is sick or on leave.](screenshots/10.png)

### Substitution records — an archive of all past substitution assignments for accountability and workload tracking. Useful when evaluating teaching load distribution.

![Substitution records — an archive of all past substitution assignments for accountability and workload tracking. Useful when evaluating teaching load distribution.](screenshots/11.png)

### Leave verification — tracks leave applications with a token system (10 tokens/year). Employees submit requests here; administrators verify or deny them based on available tokens.

![Leave verification — tracks leave applications with a token system (10 tokens/year). Employees submit requests here; administrators verify or deny them based on available tokens.](screenshots/12.png)

### Audit trail — logs every action taken in the system (logins, record creations, modifications) for security and accountability. If data is tampered with, this reveals who did it and when.

![Audit trail — logs every action taken in the system (logins, record creations, modifications) for security and accountability. If data is tampered with, this reveals who did it and when.](screenshots/13.png)

### Academic term setup — configures the school year and semester structure that all schedules and attendance rules are anchored to. Must be set correctly before any other module works.

![Academic term setup — configures the school year and semester structure that all schedules and attendance rules are anchored to. Must be set correctly before any other module works.](screenshots/14.png)

### Database maintenance — creates backups and restores data if the system crashes. The last-backup date tells admins how current their safety net is.

![Database maintenance — creates backups and restores data if the system crashes. The last-backup date tells admins how current their safety net is.](screenshots/15.png)

---

Built by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
