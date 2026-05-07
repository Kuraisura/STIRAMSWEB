export interface EmailOptions {
  to: string
  subject: string
  html?: string
  text?: string
  template?: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  emailId?: number
  error?: string
}

export class SMTPEmailClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = typeof window !== "undefined" ? window.location.origin : ""
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `HTTP error! status: ${response.status}`

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        throw new Error(errorMessage)
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error("SMTP Email Client Error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }
    }
  }

  async sendBulkEmails(emails: EmailOptions[]): Promise<EmailResult[]> {
    const results: EmailResult[] = []

    for (const email of emails) {
      const result = await this.sendEmail(email)
      results.push(result)
      // Add small delay between emails to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return results
  }

  async sendTemplateEmail(to: string, templateName: string, variables: Record<string, string>): Promise<EmailResult> {
    // This would typically fetch the template from database and replace variables
    // For now, we'll use a simple implementation
    const templates: Record<string, { subject: string; html: string }> = {
      late_arrival: {
        subject: `Late Arrival Notification - ${variables.date || "Today"}`,
        html: `
          <h2>Late Arrival Notification</h2>
          <p>Dear ${variables.employee_name || "Employee"},</p>
          <p>This is to inform you that you were marked late today, ${variables.date || "today"}, at ${
            variables.actual_time || "unknown time"
          }. Your scheduled time in is ${variables.scheduled_time || "7:00 AM"}.</p>
          <p>Please ensure to arrive on time to maintain productivity and professionalism.</p>
          <p>Best regards,<br>STI College RAMS System</p>
        `,
      },
      absence_alert: {
        subject: `Absence Alert - ${variables.employee_name || "Employee"} - ${variables.date || "Today"}`,
        html: `
          <h2>Absence Alert</h2>
          <p>Dear ${variables.employee_name || "Employee"},</p>
          <p>You are marked absent for ${
            variables.date || "today"
          }. If this is incorrect or if you have a valid reason for your absence, please contact your supervisor or HR department immediately.</p>
          <p>Please ensure to follow proper leave procedures for future absences.</p>
          <p>Best regards,<br>STI College RAMS System</p>
        `,
      },
    }

    const template = templates[templateName]
    if (!template) {
      return {
        success: false,
        error: `Template '${templateName}' not found`,
      }
    }

    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      template: templateName,
    })
  }
}

// Export singleton instance
export const smtpClient = new SMTPEmailClient()
