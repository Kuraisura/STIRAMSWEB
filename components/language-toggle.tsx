"use client"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/language-context"
import { Languages } from "lucide-react"

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'fil' : 'en')
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2 text-sm font-medium"
      title={language === 'en' ? 'Switch to Filipino' : 'Switch to English'}
    >
      <Languages className="h-4 w-4" />
      <span className="hidden sm:inline">
        {language === 'en' ? 'EN' : 'FIL'}
      </span>
    </Button>
  )
}
