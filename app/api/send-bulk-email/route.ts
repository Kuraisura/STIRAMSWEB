import { type NextRequest, NextResponse } from "next/server"
import { emailService } from "@/lib/email-service"
import { dbQuery } from "@/lib/db"

async function getActiveEmployees() {
  return dbQuery<any>(
    `SELECT employee_id, full_name, department, employment_status, email
     FROM employees
     WHERE is_active IS NULL OR is_active = true`
  )
}

async function createEmailLogEntry(log: {
  recipient_email: string
  recipient_name?: string
  subject: string
  content: string
  template_used?: string
  status: "pending" | "sent" | "delivered" | "failed"
  error_message?: string
  sent_at?: string
}) {
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
     RETURNING email_id`,
    [
      log.recipient_email,
      log.recipient_name || null,
      log.subject,
      log.content,
      log.template_used || null,
      log.status,
      log.error_message || null,
      log.sent_at || null,
    ]
  )
  return rows[0] || null
}

class BulkEmailService {
  private static instance: BulkEmailService

  static getInstance(): BulkEmailService {
    if (!BulkEmailService.instance) {
      BulkEmailService.instance = new BulkEmailService()
    }
    return BulkEmailService.instance
  }

  private async getEmailRecipients(requestData: any) {
    const { 
      recipients, 
      sendToAllEmployees = false,
      departments = [],
      employmentStatus = []
    } = requestData

    let emailRecipients: string[] = []

    if (sendToAllEmployees) {
      try {
        const employees = await getActiveEmployees()
        emailRecipients = employees
          .filter(emp => {
            if (departments.length > 0 && !departments.includes(emp.department)) {
              return false
            }
            if (employmentStatus.length > 0 && !employmentStatus.includes(emp.employment_status)) {
              return false
            }
            return true
          })
          .map(emp => emp.email)
      } catch (error) {
        console.error("[SendBulkEmail] Error fetching employees:", error)
        throw new Error("Failed to fetch employee list")
      }
    } else if (recipients && Array.isArray(recipients)) {
      emailRecipients = recipients
    } else {
      throw new Error("Must specify either recipients array or sendToAllEmployees: true")
    }

    if (emailRecipients.length === 0) {
      throw new Error("No recipients found")
    }

    return emailRecipients
  }

  private async createEmailOptions(emailRecipients: string[], requestData: any) {
    const { subject, html, text, template, variables, sendToAllEmployees } = requestData

    const employeeMap: Record<string, any> = {}
    if (sendToAllEmployees) {
      const employees = await getActiveEmployees()
      employees.forEach(emp => {
        if (emp.email) employeeMap[emp.email] = emp
      })
    }

    return emailRecipients.map(email => {
      const emp = employeeMap[email]
      const perUserVariables = emp ? {
        employee_name: emp.full_name || emp.email,
        department: emp.department || "",
        email_name: (emp as any).email_name || emp.full_name || "",
      } : {}
      return {
        to: email,
        subject,
        html,
        text,
        template,
        variables: { 
          ...(variables || {}), 
          ...perUserVariables, 
          banner_url: (variables?.banner_url || '/placeholder.jpg'), 
          bottom_banner_url: (variables?.bottom_banner_url || '/placeholder.jpg') 
        }
      }
    })
  }

  private async logEmailResults(emailRecipients: string[], requestData: any, results: any[]) {
    const { subject, html, text, template } = requestData

    const logPromises = emailRecipients.map((email, index) => {
      const result = results[index]
      return createEmailLogEntry({
        recipient_email: email,
        recipient_name: "Bulk Email Recipient",
        subject,
        content: html || text || "",
        template_used: template || "bulk_send",
        status: result.success ? "sent" : "failed",
        error_message: result.error,
        sent_at: result.success ? new Date().toISOString() : undefined,
      })
    })

    await Promise.all(logPromises)
  }

  async sendBulkEmails(requestData: any) {
    console.log("[SendBulkEmail] Bulk email request received")
    const { subject, html, text, template } = requestData

    if (!subject || (!html && !text && !template)) {
      throw new Error("Missing required fields: subject and content (html, text, or template)")
    }

    const emailRecipients = await this.getEmailRecipients(requestData)
    const emailOptions = await this.createEmailOptions(emailRecipients, requestData)

    console.log("[SendBulkEmail] Sending to", emailRecipients.length, "recipients")
    const results = await emailService.sendBulkEmails({ emails: emailOptions })

    const successfulEmails = results.filter(r => r.success)
    const failedEmails = results.filter(r => !r.success)

    await this.logEmailResults(emailRecipients, requestData, results)
    
    console.log("[SendBulkEmail] Bulk email completed:", successfulEmails.length, "successful,", failedEmails.length, "failed")

    return {
      success: true,
      totalRecipients: emailRecipients.length,
      successfulEmails: successfulEmails.length,
      failedEmails: failedEmails.length,
      results: results.map((result, index) => ({
        email: emailRecipients[index],
        success: result.success,
        messageId: result.messageId,
        error: result.error
      }))
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const bulkEmailService = BulkEmailService.getInstance()
    const body = await request.json()
    const result = await bulkEmailService.sendBulkEmails(body)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[SendBulkEmail] Bulk email sending error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
} 
