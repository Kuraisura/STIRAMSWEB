import { Resend } from 'resend'

export interface EmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  template?: string
  variables?: Record<string, any>
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
  emailId?: number
}

export interface BulkEmailOptions {
  emails: EmailOptions[]
  template?: string
  variables?: Record<string, any>
}

export class EmailService {
  private resend: Resend | null = null
  private defaultFrom: string

  constructor() {
    // Default sender: prefer env var, fallback to noreply@stirams.site
    this.defaultFrom = process.env.FROM_EMAIL || process.env.NEXT_PUBLIC_FROM_EMAIL || 'noreply@stirams.site'
  }

  private getResend(): Resend {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) {
        throw new Error('Email service not configured. Please set RESEND_API_KEY.')
      }
      this.resend = new Resend(apiKey)
    }
    return this.resend
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      console.log('EmailService.sendEmail called with:', {
        to: options.to,
        subject: options.subject,
        from: options.from || this.defaultFrom
      })
      
      const resend = this.getResend()

      const emailData: any = {
        from: options.from || this.defaultFrom,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
      }

      if (options.html) emailData.html = options.html
      if (options.text) emailData.text = options.text
      if (options.replyTo) emailData.replyTo = options.replyTo

      const { data, error } = await resend.emails.send(emailData)

      if (error) {
        console.error('Resend email error:', error)
        return {
          success: false,
          error: error.message || 'Failed to send email'
        }
      }

      return {
        success: true,
        messageId: data?.id
      }
    } catch (error) {
      console.error('Email sending error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async sendBulkEmails(options: BulkEmailOptions): Promise<EmailResult[]> {
    const results: EmailResult[] = []
    
    for (const email of options.emails) {
      const result = await this.sendEmail(email)
      results.push(result)
      
      // Add a small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return results
  }

  async sendTemplateEmail(
    to: string, 
    templateName: string, 
    variables: Record<string, any>
  ): Promise<EmailResult> {
    const templates = this.getEmailTemplates()
    const template = templates[templateName]
    
    if (!template) {
      return {
        success: false,
        error: `Template '${templateName}' not found`
      }
    }

    // Replace variables in template
    let subject = template.subject
    let html = template.html
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g')
      subject = subject.replace(regex, String(value))
      html = html.replace(regex, String(value))
    })

    // Inline local public images so Gmail always renders them
    try {
      html = await this.inlinePublicImages(html)
    } catch (e) {
      console.warn('Inline images failed (continuing):', (e as any)?.message || e)
    }

    return this.sendEmail({
      to,
      subject,
      html,
      template: templateName
    })
  }

  private async inlinePublicImages(html: string): Promise<string> {
    const path = await import('path')
    const fs = await import('fs/promises')
    const cwd = process.cwd()
    const publicDir = path.join(cwd, 'public')
    const mimeFor = (p: string) => {
      const ext = path.extname(p).toLowerCase()
      if (ext === '.png') return 'image/png'
      if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
      if (ext === '.svg') return 'image/svg+xml'
      if (ext === '.gif') return 'image/gif'
      return 'application/octet-stream'
    }
    const re = /src="([^"]+)"/g
    const replacements: Array<{ from: string; to: string }> = []
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const src = m[1]
      if (!src || /^https?:\/\//i.test(src) || /^data:/i.test(src)) continue
      const dec = decodeURIComponent(src)
      const rel = dec.replace(/^\//, '').split('?')[0]
      const diskPath = path.join(publicDir, rel)
      try {
        const buf = await fs.readFile(diskPath)
        const mime = mimeFor(diskPath)
        const dataUri = `data:${mime};base64,${buf.toString('base64')}`
        replacements.push({ from: src, to: dataUri })
      } catch { /* skip if not found */ }
    }
    let out = html
    for (const r of replacements) {
      out = out.split(`src="${r.from}"`).join(`src="${r.to}"`)
    }
    return out
  }

  private getEmailTemplates(): Record<string, { subject: string; html: string }> {
    return {
      sti_brand_campaign: {
        subject: 'Important Update for {{employee_name}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: {{theme_bg}}; color: #111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td style="background:#ffd400; text-align:center; padding: 16px 0;">
                  {{rams_logo_block}}
                </td>
              </tr>
              <tr>
                <td>
                  <img src="{{banner_url}}" alt="STI Banner" style="width: 100%; height: auto; display: block;" />
                </td>
              </tr>
            </table>

            <div style="background: #0032a0; color: #ffffff; padding: 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb;">Hi {{employee_name}},</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 14px 0; line-height: 1.6;">{{message}}</p>

              <div style="text-align: center; margin: 22px 0 10px 0;">
                <a href="{{cta_url}}" style="background: #ffd400; color: #0032a0; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700; font-size: 13px; display: inline-block;">{{cta_label}}</a>
              </div>

              <!-- Bottom visual banner first -->
              <div style="margin: 18px 0 8px 0;">
                <img src="{{bottom_banner_url}}" alt="STI Campaign" style="width: 100%; height: auto; border-radius: 6px; display: block;" />
              </div>

              <!-- Then clickable logos row -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 8px 0 0 0;">
                <tr>
                  <td align="center" style="padding: 8px 0; text-overflow: unset; overflow: visible; white-space: normal;">
                    <a href="{{elms_url}}" style="text-decoration:none; display:inline-block; margin:0 10px;">
                      <img src="{{sti_logo_url}}" alt="STI eLMS" style="height:36px; width:auto; display:inline-block;" />
                    </a>
                    <a href="{{facebook_url}}" style="text-decoration:none; display:inline-block; margin:0 10px;">
                      <img src="{{fb_logo_url}}" alt="Facebook" style="height:36px; width:auto; display:inline-block;" />
                    </a>
                    <a href="{{youtube_url}}" style="text-decoration:none; display:inline-block; margin:0 10px;">
                      <img src="{{yt_logo_url}}" alt="YouTube" style="height:36px; width:auto; display:inline-block;" />
                    </a>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #0032a0; padding: 12px 20px; text-align: center; font-size: 12px; color: #ffffff; width: 100%; box-sizing: border-box;">
              <div>This is an automated email from the STI College Santa Rosa RAMS System.</div>
            </div>
          </div>
        `
      },
      employee_report: {
        subject: 'Your Attendance Report - {{report_period}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: {{theme_bg}}; color: #111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td bgcolor="#ffd400" style="background:#ffd400; text-align:center; padding: 16px 0;">{{rams_logo_block}}</td>
              </tr>
              <tr>
                <td>
                  <img src="{{banner_url}}" alt="STI Banner" style="width: 100%; height: auto; display: block;" />
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td bgcolor="#0032a0" style="background:#0032a0; color:#ffffff; padding: 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb;">Hi <span style="color:#111827; font-weight:700; background:#ffdd57; padding:2px 6px; border-radius:4px;">{{employee_name}}</span>,</p>
                  </td>
                </tr>
              </table>

              <div style="background: #ffdd57; padding: 12px 16px; border-radius: 6px; margin-bottom: 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                  <tr>
                    <td style="vertical-align: middle;">
                      <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Weekly Report</div>
                      <div style="font-size: 12px; color: #1f2937;">Period: <strong>{{report_period}}</strong></div>
                    </td>
                    <td style="text-align: right;">
                      <a href="{{report_url}}" style="display: inline-block; background: #0032a0; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 700; font-size: 12px;">VIEW REPORT</a>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 18px 0; color:#111827;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px; color:#111827;">
                  <tr>
                    <td style="padding: 8px 0; color:#111827;">Days Present</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 700; color:#111827;">{{days_present}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color:#111827;">Days Absent</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 700; color:#111827;">{{days_absent}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color:#111827;">Late Arrivals</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 700; color:#111827;">{{late_arrivals}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color:#111827;">Early Departures</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 700; color:#111827;">{{early_departures}}</td>
                  </tr>
                </table>
              </div>


              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 8px 0 0 0;">
                <tr>
                  <td align="center" style="padding: 8px 0;">
                    <a href="{{elms_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ffd400; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{sti_logo_url}}" alt="STI eLMS" style="width:100%; height:100%; object-fit:contain; display:block; padding:6px; box-sizing:border-box; background:transparent;" />
                    </a>
                    <a href="{{facebook_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#1877f2; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{fb_logo_url}}" alt="Facebook" style="width:100%; height:100%; object-fit:contain; display:block; padding:8px; box-sizing:border-box; background:transparent;" />
                    </a>
                    <a href="{{youtube_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ff0000; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{yt_logo_url}}" alt="YouTube" style="width:100%; height:100%; object-fit:contain; display:block; padding:8px; box-sizing:border-box; background:transparent;" />
                    </a>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #0032a0; padding: 12px 20px; text-align: center; font-size: 12px; color: #ffffff; width: 100%; box-sizing: border-box;">
              <div>This is an automated email from the STI College Santa Rosa RAMS System.</div>
            </div>
          </div>
        `
      },
      late_arrival: {
        subject: 'Late Arrival Notification - {{date}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: {{theme_bg}}; color: #111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td style="background:#ffd400; text-align:center; padding: 16px 0;">{{rams_logo_block}}</td>
              </tr>
              <tr>
                <td>
                  <img src="{{banner_url}}" alt="STI Banner" style="width: 100%; height: auto; display: block;" />
                </td>
              </tr>
            </table>

            <div style="background: #0032a0; color: #ffffff; padding: 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                <td style="vertical-align: top;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb;">Hi <span style="color:#111827; font-weight:700; background:#ffd400; padding:2px 6px; border-radius:4px;">{{employee_name}}</span>,</p>
                  </td>
                </tr>
              </table>

              <h2 style="color: #ffffff; margin: 6px 0 16px 0;">Late Arrival Notification</h2>
              <p>This is to inform you that you were marked late today, <strong>{{date}}</strong>, at <strong>{{actual_time}}</strong>.</p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 16px 0;">
                <p style="margin: 0;"><strong>Details:</strong></p>
                <ul style="margin: 10px 0;">
                  <li>Scheduled time: {{scheduled_time}}</li>
                  <li>Actual arrival: {{actual_time}}</li>
                  <li>Department: {{department}}</li>
                </ul>
              </div>
              <p>Please ensure to arrive on time to maintain productivity and professionalism.</p>


              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 8px 0 0 0;">
                <tr>
                  <td align="center" style="padding: 8px 0;">
                    <a href="{{elms_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ffd400; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{sti_logo_url}}" alt="STI eLMS" style="width:100%; height:100%; object-fit:contain; display:block; padding:6px; box-sizing:border-box; background:transparent;" />
                    </a>
                    <a href="{{facebook_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#1877f2; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{fb_logo_url}}" alt="Facebook" style="width:100%; height:100%; object-fit:contain; display:block; padding:8px; box-sizing:border-box; background:transparent;" />
                    </a>
                    <a href="{{youtube_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ff0000; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{yt_logo_url}}" alt="YouTube" style="width:100%; height:100%; object-fit:contain; display:block; padding:8px; box-sizing:border-box; background:transparent;" />
                    </a>
                  </td>
                </tr>
              </table>
                </td>
              </tr>
            </table>

            <div style="background: #0032a0; padding: 12px 20px; text-align: center; font-size: 12px; color: #ffffff; width: 100%; box-sizing: border-box;">
              <p style="margin:0;">This is an automated email from the STI College Santa Rosa RAMS System.</p>
            </div>
          </div>
        `
      },
      
      absence_alert: {
        subject: 'Absence Alert - {{employee_name}} - {{date}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: {{theme_bg}}; color: #111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td style="background:#ffd400; text-align:center; padding: 16px 0;">{{rams_logo_block}}</td>
              </tr>
              <tr>
                <td>
                  <img src="{{banner_url}}" alt="STI Banner" style="width: 100%; height: auto; display: block;" />
                </td>
              </tr>
            </table>

            <div style="background: #0032a0; color: #ffffff; padding: 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #e5e7eb;">Hi <span style="color:#111827; font-weight:700; background:#d1fae5; padding:2px 6px; border-radius:4px;">{{employee_name}}</span>,</p>
                  </td>
                </tr>
              </table>

              <h2 style="color: #dc2626; margin: 6px 0 16px 0;">Absence Alert</h2>
              <p>You are marked absent for <strong>{{date}}</strong>.</p>
              <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 16px 0;">
                <p style="margin: 0;"><strong>Important:</strong></p>
                <p style="margin: 10px 0;">If this is incorrect or you have a valid reason for your absence, please contact your supervisor or HR department immediately.</p>
              </div>
              <p>Please ensure to follow proper leave procedures for future absences.</p>

              <div style="margin: 18px 0 8px 0;">
                <img src="{{bottom_banner_url}}" alt="STI Campaign" style="width: 100%; height: auto; border-radius: 6px; display: block;" />
              </div>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 8px 0 0 0;">
                <tr>
                  <td align="center" style="padding: 8px 0;">
                    <a href="{{elms_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ffd400; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{sti_logo_url}}" alt="STI eLMS" style="width:70%; height:70%; object-fit:contain; display:block; margin:6px auto;" />
                    </a>
                    <a href="{{facebook_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#1877f2; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{fb_logo_url}}" alt="Facebook" style="width:60%; height:60%; object-fit:contain; display:block; margin:8px auto; background:transparent;" />
                    </a>
                    <a href="{{youtube_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ff0000; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{yt_logo_url}}" alt="YouTube" style="width:60%; height:60%; object-fit:contain; display:block; margin:8px auto; background:transparent;" />
                    </a>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #0032a0; padding: 12px 20px; text-align: center; font-size: 12px; color: #ffffff; width: 100%; box-sizing: border-box;">
              <p style="margin:0;">This is an automated email from the STI College Santa Rosa RAMS System.</p>
            </div>
          </div>
        `
      },
      
      weekly_summary: {
        subject: 'Weekly Attendance Summary - {{employee_name}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: {{theme_bg}}; color: #111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td style="background:#ffd400; text-align:center; padding: 16px 0;">{{rams_logo_block}}</td>
              </tr>
              <tr>
                <td>
                  <img src="{{banner_url}}" alt="STI Banner" style="width: 100%; height: auto; display: block;" />
                </td>
              </tr>
            </table>

            <div style="background: #0032a0; color: #ffffff; padding: 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">Hi {{employee_name}},</p>
                  </td>
                </tr>
              </table>

              <h2 style="color: #059669; margin: 6px 0 16px 0;">Weekly Attendance Summary</h2>
              <p>Here is your attendance summary for the week of <strong>{{week_start}} to {{week_end}}</strong>:</p>
              <div style="background: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 16px 0;">
                <p style="margin: 0;"><strong>Summary:</strong></p>
                <ul style="margin: 10px 0;">
                  <li>Days present: {{days_present}}</li>
                  <li>Days absent: {{days_absent}}</li>
                  <li>Late arrivals: {{late_arrivals}}</li>
                  <li>Early departures: {{early_departures}}</li>
                </ul>
              </div>

              <div style="margin: 18px 0 8px 0;">
                <img src="{{bottom_banner_url}}" alt="STI Campaign" style="width: 100%; height: auto; border-radius: 6px; display: block;" />
              </div>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 8px 0 0 0;">
                <tr>
                  <td align="center" style="padding: 8px 0;">
                    <a href="{{elms_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ffd400; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{sti_logo_url}}" alt="STI eLMS" style="width:70%; height:70%; object-fit:contain; display:block; margin:6px auto;" />
                    </a>
                    <a href="{{facebook_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#1877f2; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{fb_logo_url}}" alt="Facebook" style="width:60%; height:60%; object-fit:contain; display:block; margin:8px auto; background:transparent;" />
                    </a>
                    <a href="{{youtube_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ff0000; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{yt_logo_url}}" alt="YouTube" style="width:60%; height:60%; object-fit:contain; display:block; margin:8px auto; background:transparent;" />
                    </a>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #0032a0; padding: 12px 20px; text-align: center; font-size: 12px; color: #ffffff; width: 100%; box-sizing: border-box;">
              <p style="margin:0;">This is an automated email from the STI College Santa Rosa RAMS System.</p>
            </div>
          </div>
        `
      },
      
      system_notification: {
        subject: 'System Notification - {{subject}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: {{theme_bg}}; color: #111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td style="background:#ffffff; text-align:center; padding: 14px 0;">{{rams_logo_block}}</td>
              </tr>
            </table>

            <div style="background: #0032a0; color: #ffffff; padding: 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">STI College Santa Rosa</p>
                  </td>
                  <td style="text-align: right; vertical-align: top;">{{rams_logo_block}}</td>
                </tr>
              </table>

              <h2 style="color: #7c3aed; margin: 6px 0 16px 0;">{{subject}}</h2>
              <div style="background: #f3f4f6; padding: 15px; margin: 16px 0; border-radius: 6px;">
                {{message}}
              </div>

              <div style="margin: 18px 0 8px 0;">
                <img src="{{bottom_banner_url}}" alt="STI Campaign" style="width: 100%; height: auto; border-radius: 6px; display: block;" />
              </div>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 8px 0 0 0;">
                <tr>
                  <td align="center" style="padding: 8px 0;">
                    <a href="{{elms_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ffd400; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{sti_logo_url}}" alt="STI eLMS" style="width:70%; height:70%; object-fit:contain; display:block; margin:6px auto;" />
                    </a>
                    <a href="{{facebook_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#1877f2; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{fb_logo_url}}" alt="Facebook" style="width:60%; height:60%; object-fit:contain; display:block; margin:8px auto; background:transparent;" />
                    </a>
                    <a href="{{youtube_url}}" style="text-decoration:none; display:inline-block; width:40px; height:40px; border-radius:50%; overflow:hidden; background:#ff0000; border:1px solid #e5e7eb; margin:0 8px;">
                      <img src="{{yt_logo_url}}" alt="YouTube" style="width:60%; height:60%; object-fit:contain; display:block; margin:8px auto; background:transparent;" />
                    </a>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #0032a0; padding: 12px 20px; text-align: center; font-size: 12px; color: #ffffff; width: 100%; box-sizing: border-box;">
              <p style="margin:0;">This is an automated email from the STI College Santa Rosa RAMS System.</p>
            </div>
          </div>
        `
      }
    }
  }
}

// Export singleton instance
export const emailService = new EmailService() 
