# STIRAMS Web

A web dashboard for managing employee attendance, schedules, and Daily Time Records at STI College Santa Rosa.

**Web** · **Institutional Project** · 2026

[Portfolio](https://kuraisler.xyz) · [Website demo](https://stiramsweb.vercel.app/)

## Purpose

STIRAMS Web turns RFID attendance records into information campus administrators can review and use for reporting. It is the management side of a two-part system: the Windows kiosk captures card taps, and the web dashboard manages people, schedules, exceptions, and reports.

## Intended users

HR personnel, campus administrators, and staff responsible for faculty and employee attendance at STI College Santa Rosa.

## Main capabilities

- Monitor attendance and review employee records, schedules, and recent activity.
- Generate Daily Time Records and export attendance reports.
- Manage leave requests, holidays, teaching schedules, and substitutions.
- Review attendance irregularities, verification requests, and audit history.

## How it was built

### Web application

Next.js App Router and TypeScript handle dashboard pages and server API routes; Tailwind CSS and Radix UI support the interface.

### Shared attendance data

Server-side PostgreSQL queries use the pg driver. The dashboard works with the same attendance data as the WPF client, which owns local offline capture and synchronization.

### Reporting and updates

SWR refreshes client data, Recharts visualizes attendance, and report routes assemble timesheets, exports, and email delivery.

## Technology stack

| Responsibility | Technologies |
| --- | --- |
| Web interface | Next.js 14, React 18, TypeScript, Tailwind CSS 4, Radix UI |
| Server & database | Next.js API Routes, PostgreSQL, pg |
| Data & reporting | SWR, Recharts, ExcelJS, Nodemailer |

## Project scope and current state

An institutional capstone and internship project for STI College Santa Rosa. The dashboard and kiosk are separate applications within one attendance system; a running dashboard requires its configured database and institutional settings.

## Source guide

- [`app/dashboard/`](app/dashboard/)
- [`app/api/`](app/api/)
- [`lib/`](lib/)
- [`package.json`](package.json)

## Development setup

Requires Node.js, npm, and a development PostgreSQL database with the matching institutional schema. Configure the database, authentication/session settings, and optional email services referenced by the server code. The WPF kiosk is a separate application.

```sh
npm install
npm run dev

# Production build
npm run build
```

## Screenshot and module walkthrough

Expand a screen below to see the capture and an explanation of the module, its visible controls, and its role in the application.

<details open>
<summary><strong>01 · Administrator sign-in</strong></summary>

A campus-branded login form overlays a photograph of STI College Santa Rosa. Email, password, and session options provide the entry point to the attendance-management dashboard.

<p><img src="screenshots/1.png" alt="Administrator sign-in" width="960"></p>

</details>

<details>
<summary><strong>02 · Dashboard overview</strong></summary>

The dashboard combines an institutional banner, employee/department counts, attendance summaries, and persistent navigation. It provides a starting overview before administrators open operational modules.

<p><img src="screenshots/2.png" alt="Dashboard overview" width="960"></p>

</details>

<details>
<summary><strong>03 · Attendance monitoring</strong></summary>

Summary cards classify attendance while the log table shows employee, log type, time, date, and status. Search, date/department filters, and refresh controls help staff inspect individual tap records.

<p><img src="screenshots/3.png" alt="Attendance monitoring" width="960"></p>

</details>

<details>
<summary><strong>04 · Daily Time Record generation</strong></summary>

The DTR command center walks the user through cutoff selection, a faculty member, school year, and semester. Single-record generation and bulk-print actions turn attendance records into reporting output.

<p><img src="screenshots/4.png" alt="Daily Time Record generation" width="960"></p>

</details>

<details>
<summary><strong>05 · Printable DTR preview</strong></summary>

A modal previews the faculty Daily Time Record in a page-oriented layout, with Close and Print DTR actions. Administrators can inspect the selected report before sending it to a printer.

<p><img src="screenshots/5.png" alt="Printable DTR preview" width="960"></p>

</details>

<details>
<summary><strong>06 · Teaching-schedule management</strong></summary>

Faculty cards summarize class counts by weekday under the active term. Search, department/status filters, and grid/list options help staff locate and manage teaching schedules; this capture shows an employee with no classes.

<p><img src="screenshots/6.png" alt="Teaching-schedule management" width="960"></p>

</details>

<details>
<summary><strong>07 · Exam-schedule management</strong></summary>

The exam-schedule page provides staff search, filters, past-exam visibility, and grid/list views. Its No Teaching Staff Found state shows how the module handles a selection without available staff records.

<p><img src="screenshots/7.png" alt="Exam-schedule management" width="960"></p>

</details>

<details>
<summary><strong>08 · Employee directory and departments</strong></summary>

Search and employment filters sit above an employee table containing identity, department, contact, RFID/schedule, and work-status information. Add Employee and department-management controls maintain the records used by attendance and scheduling.

<p><img src="screenshots/8.png" alt="Employee directory and departments" width="960"></p>

</details>

<details>
<summary><strong>09 · Holiday and no-class setup</strong></summary>

The holiday module offers Add Holiday and an empty list for holidays, suspended classes, and no-class days. These entries provide scheduling exceptions that administrators can maintain as the calendar changes.

<p><img src="screenshots/9.png" alt="Holiday and no-class setup" width="960"></p>

</details>

<details>
<summary><strong>10 · Substitute assignments</strong></summary>

Search, status filtering, and refresh controls organize class-substitution requests. The empty state indicates no assignments are currently listed and directs staff toward creating a substitution.

<p><img src="screenshots/10.png" alt="Substitute assignments" width="960"></p>

</details>

<details>
<summary><strong>11 · Substitution records and forms</strong></summary>

Date-range, schedule-type, and text filters narrow substitution records intended for review and printing. This capture shows no matching forms, distinguishing the reporting view from assignment creation.

<p><img src="screenshots/11.png" alt="Substitution records and forms" width="960"></p>

</details>

<details>
<summary><strong>12 · Attendance verification filings</strong></summary>

Leave-token limits and filing-status totals appear above verification records and search. The module supports reviewing employee attendance-related filings and their approval state; this capture contains zero totals.

<p><img src="screenshots/12.png" alt="Attendance verification filings" width="960"></p>

</details>

<details>
<summary><strong>13 · Activity log and audit trail</strong></summary>

Date, action, user-type, and text filters narrow a table of recorded actions such as login and record creation. Administrators can review who acted, when, and the logged description during investigation or support.

<p><img src="screenshots/13.png" alt="Activity log and audit trail" width="960"></p>

</details>

<details>
<summary><strong>14 · Academic-term configuration</strong></summary>

The active-term summary and term table show academic year, semester, date boundaries, duration, and status. Add/edit controls organize the term context used by scheduling and reports.

<p><img src="screenshots/14.png" alt="Academic-term configuration" width="960"></p>

</details>

<details>
<summary><strong>15 · Database backup and restore</strong></summary>

Connection status and last-backup information appear above backup creation and restore controls. This is an administrative recovery module; the screenshot shows the interface, not a completed or verified restoration.

<p><img src="screenshots/15.png" alt="Database backup and restore" width="960"></p>

</details>

## License

See [LICENSE](LICENSE).

---

Project by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
