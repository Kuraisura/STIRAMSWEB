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

## Screenshots

<table>
<tr>
<td align="center"><img src="screenshots/1.png" alt="Secure entry point" width="440"><br>Secure entry point</td>
<td align="center"><img src="screenshots/2.png" alt="Daily briefing" width="440"><br>Daily briefing</td>
</tr>
</table>

<details>
<summary>View all 15 screenshots</summary>

### 1. Secure entry point

![Secure entry point](screenshots/1.png)

### 2. Daily briefing

![Daily briefing](screenshots/2.png)

### 3. Live attendance feed

![Live attendance feed](screenshots/3.png)

### 4. DTR generation center

![DTR generation center](screenshots/4.png)

### 5. DTR preview

![DTR preview](screenshots/5.png)

### 6. Class schedule builder

![Class schedule builder](screenshots/6.png)

### 7. Exam schedule management

![Exam schedule management](screenshots/7.png)

### 8. Employee directory

![Employee directory](screenshots/8.png)

### 9. Holiday calendar

![Holiday calendar](screenshots/9.png)

### 10. Substitution manager

![Substitution manager](screenshots/10.png)

### 11. Substitution records

![Substitution records](screenshots/11.png)

### 12. Leave verification

![Leave verification](screenshots/12.png)

### 13. Audit trail

![Audit trail](screenshots/13.png)

### 14. Academic term setup

![Academic term setup](screenshots/14.png)

### 15. Database maintenance

![Database maintenance](screenshots/15.png)

</details>

## License

See [LICENSE](LICENSE).

---

Project by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
