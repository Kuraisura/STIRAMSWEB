'use client'

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface ActiveTermWarningModalProps {
  open: boolean
  onSetTerm: () => void
}

export function ActiveTermWarningModal({ open, onSetTerm }: ActiveTermWarningModalProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/20 p-3">
              <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-500" />
            </div>
          </div>
          <AlertDialogTitle className="text-center text-xl">
            No Active Academic Term
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-base">
            You must set an active academic term before accessing this page. 
            Please configure an academic term to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex justify-center sm:justify-center">
          <Button 
            onClick={onSetTerm}
            className="w-full sm:w-auto"
          >
            Set Academic Term
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
