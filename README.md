# 🏫 STIRAMS (Web)

**RFID Attendance Management System — Web Dashboard** · `Web`

Full-stack web attendance management system for STI College Santa Rosa with RFID scanning, DTR generation, faculty scheduling, and audit logging.

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

---

Built by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
