'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

export default function TestEmailPage() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('Test Email from RAMS System')
  const [message, setMessage] = useState('This is a test email from your RAMS system using the custom domain email.')
  const [loading, setLoading] = useState(false)

  const sendTestEmail = async () => {
    if (!to) {
      toast({
        title: "Error",
        description: "Please enter a recipient email address",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">STI College Santa Rosa</h1>
                <p style="margin: 10px 0 0 0;">RAMS System</p>
              </div>
              
              <div style="padding: 30px; background: #f8fafc;">
                <h2 style="color: #1e40af; margin-bottom: 20px;">Test Email</h2>
                
                <p>Hello,</p>
                
                <p>${message}</p>
                
                <div style="background: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0;"><strong>Email Details:</strong></p>
                  <ul style="margin: 10px 0;">
                    <li>Sent from: noreply@kuraisler.me</li>
                    <li>Sent at: ${new Date().toLocaleString()}</li>
                    <li>System: RAMS (Remote Attendance Management System)</li>
                  </ul>
                </div>
                
                <p>Best regards,<br>
                <strong>STI College RAMS System</strong></p>
              </div>
              
              <div style="background: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
                <p>This is a test email from the STI College RAMS System.</p>
              </div>
            </div>
          `,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: "Success!",
          description: `Email sent successfully to ${to}`,
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to send email",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email. Please check your configuration.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Test Email Configuration</CardTitle>
          <CardDescription>
            Test your email setup with your custom domain (noreply@kuraisler.me)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Recipient Email</label>
            <Input
              type="email"
              placeholder="Enter recipient email address"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          
          <Button 
            onClick={sendTestEmail} 
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Sending...' : 'Send Test Email'}
          </Button>
          
          <div className="text-sm text-gray-600 mt-4 p-4 bg-gray-50 rounded">
            <p><strong>Configuration:</strong></p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>From: noreply@kuraisler.me</li>
              <li>Service: Resend</li>
              <li>Domain: kuraisler.me</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 
