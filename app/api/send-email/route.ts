import { type NextRequest, NextResponse } from "next/server"
import { emailService } from "@/lib/email-service"
import { dbQuery } from "@/lib/db"

// Force dynamic rendering (uses request headers for auth/rate limiting)
export const dynamic = 'force-dynamic'

class EmailSendService {
  private static instance: EmailSendService

  static getInstance(): EmailSendService {
    if (!EmailSendService.instance) {
      EmailSendService.instance = new EmailSendService()
    }
    return EmailSendService.instance
  }

  private makeAbsolute(url?: string) {
    // Resolve absolute URL for images so email clients (Gmail) can fetch them.
    if (!url) return url
    if (/^https?:\/\//i.test(url)) return url
    // Preferred explicit site URL; else Vercel; else localhost fallback
    const baseEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL
    const base = baseEnv
      ? (baseEnv.startsWith('http') ? baseEnv : `https://${baseEnv}`)
      : 'http://localhost:3000'
    const sanitizedBase = base.replace(/\/$/, '')
    const trimmed = url.replace(/^\//, '')
    return `${sanitizedBase}/${trimmed}`
  }

  private normalizeImgUrl(url?: string) {
    // Allow external hosts including i.imgur.com/imgur.com as-is.
    // Only return undefined for truly empty/invalid values.
    if (!url) return url
    if (String(url).toLowerCase().includes('undefined') || String(url).toLowerCase().includes('null')) return undefined
    return url
  }

  private async createEmailLogEntry(emailData: any, status: "pending" | "sent" | "delivered" | "failed", errorMessage?: string) {
    try {
      const rows = await dbQuery<any>(
        `INSERT INTO email_logs (
           recipient_email,
           recipient_name,
           subject,
           content,
           template_used,
           status,
           error_message,
           sent_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8
         )
         RETURNING *`,
        [
          Array.isArray(emailData.to) ? emailData.to[0] : emailData.to,
          'User',
          emailData.subject || (emailData.template ? `Template: ${emailData.template}` : ''),
          emailData.html || emailData.text || '',
          emailData.template || 'manual_send',
          status,
          errorMessage || null,
          status === 'sent' ? new Date().toISOString() : null,
        ]
      )
      return rows[0] || null
    } catch (e) {
      console.warn('createEmailLog failed (continuing):', (e as any)?.message || e)
      return null
    }
  }

  async sendEmail(emailData: any) {
    console.log("[SendEmail] Email send request received")
    const { to, subject, html, text, template, variables } = emailData

    if (!to) {
      throw new Error("Missing required field: to")
    }

    const isTemplateMode = !!template && typeof variables !== "undefined"
    if (!isTemplateMode) {
      if (!subject || (!html && !text)) {
        throw new Error("Missing required fields: subject and content (html or text)")
      }
    }

    await this.createEmailLogEntry(emailData, "pending")

    let result
    if (isTemplateMode) {
      const ramsLogoSrc = this.makeAbsolute(this.normalizeImgUrl(variables?.rams_logo_url)) || 'https://i.imgur.com/TqEOF7H.png'
      const mergedVars: any = {
        banner_url: variables?.banner_url || 'https://i.imgur.com/eq0pluX.jpeg',
        bottom_banner_url: variables?.bottom_banner_url || 'https://i.imgur.com/0c9OuVQ.jpeg',
        theme_bg: variables?.theme_bg || '#ffdd00',
        elms_url: variables?.elms_url || 'https://elms.sti.edu/',
        facebook_url: variables?.facebook_url || 'https://www.facebook.com/santarosa.sti.edu',
        youtube_url: variables?.youtube_url || 'https://www.youtube.com/@STI_College',
        sti_logo_url: variables?.sti_logo_url || 'https://i.imgur.com/TqEOF7H.png',
        fb_logo_url: variables?.fb_logo_url || 'https://i.imgur.com/1730342312_facebook-logo-2024.png',
        yt_logo_url: variables?.yt_logo_url || 'https://i.imgur.com/QPbtyn1.png',
        cta_url: variables?.cta_url || (typeof variables?.report_url === 'string' ? variables.report_url : undefined) || 'https://elms.sti.edu/',
        cta_label: variables?.cta_label || 'OPEN PORTAL',
        rams_logo_block: ramsLogoSrc ? `<img src="${ramsLogoSrc}" alt="RAMS Logo" style="height: 135px; width: auto; display: inline-block; background-color: transparent;" />` : '',
        ...variables,
      }

      // Do not transform absolute Imgur URLs; only resolve local paths if provided.
      if (!/^https?:\/\//i.test(mergedVars.banner_url)) mergedVars.banner_url = this.makeAbsolute(mergedVars.banner_url)
      if (!/^https?:\/\//i.test(mergedVars.bottom_banner_url)) mergedVars.bottom_banner_url = this.makeAbsolute(mergedVars.bottom_banner_url)
      if (!/^https?:\/\//i.test(mergedVars.sti_logo_url)) mergedVars.sti_logo_url = this.makeAbsolute(this.normalizeImgUrl(mergedVars.sti_logo_url))
      if (!/^https?:\/\//i.test(mergedVars.fb_logo_url)) mergedVars.fb_logo_url = this.makeAbsolute(mergedVars.fb_logo_url)
      if (!/^https?:\/\//i.test(mergedVars.yt_logo_url)) mergedVars.yt_logo_url = this.makeAbsolute(this.normalizeImgUrl(mergedVars.yt_logo_url))
      
      result = await emailService.sendTemplateEmail(
        Array.isArray(to) ? to[0] : to,
        template,
        mergedVars
      )
    } else {
      result = await emailService.sendEmail({
        to,
        subject,
        html,
        text,
        template,
      })
    }

    if (!result.success) {
      await this.createEmailLogEntry(emailData, "failed", result.error)
      throw new Error(result.error || "Failed to send email")
    }

    const emailLog = await this.createEmailLogEntry(emailData, "sent")
    console.log("[SendEmail] Email sent successfully:", result.messageId)
    
    return {
      success: true,
      messageId: result.messageId,
      emailId: emailLog?.email_id,
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body size
    const { validateRequestBodySize } = await import('@/lib/security')
    const body = await request.json().catch(() => ({}))
    
    if (!validateRequestBodySize(body)) {
      return NextResponse.json(
        { error: 'Request body too large (max 10MB)' },
        { status: 413 }
      )
    }
    
    // Validate email addresses
    const { sanitizeEmail } = await import('@/lib/security')
    if (body.to) {
      const emails = Array.isArray(body.to) ? body.to : [body.to]
      for (const email of emails) {
        if (!sanitizeEmail(email)) {
          return NextResponse.json(
            { error: `Invalid email address: ${email}` },
            { status: 400 }
          )
        }
      }
    }
    
    // Authentication removed - emails can be sent without authentication
    const emailSendService = EmailSendService.getInstance()
    const result = await emailSendService.sendEmail(body)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[SendEmail] Email sending error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
