import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { LanguageProvider } from "@/lib/language-context"
import { Toaster } from "@/components/ui/toaster"
import { MobileBlocker } from "@/components/mobile-blocker"
import { ChunkLoadRecovery } from "@/components/chunk-load-recovery"
import { MaintenanceFallbackGuard } from "@/components/maintenance-fallback-guard"
import { RecoveryHotkeyNav } from "@/components/recovery-hotkey-nav"

// Configure Inter font with fallbacks and error handling
// If network fails during build, system fonts will be used
const inter = Inter({ 
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif"],
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: "STI RAMS - Employee Attendance Monitoring System",
  description: "Real-time Attendance Monitoring System for STI College employees with RFID integration",
  keywords: "attendance, monitoring, RFID, STI College, employee management",
    generator: 'v0.dev',
  icons: [
    { url: "/sti-logo.png", type: "image/png", sizes: "16x16" },
    { url: "/sti-logo.png", type: "image/png", sizes: "32x32" },
    { url: "/sti-logo.png", type: "image/png", sizes: "48x48" },
    { url: "/sti-logo.png", type: "image/png", sizes: "any" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" sizes="16x16" href="/sti-logo.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/sti-logo.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/sti-logo.png" />
        <link rel="shortcut icon" href="/sti-logo.png" />
        <link rel="apple-touch-icon" href="/sti-logo.png" />
      </head>
      <body className={`${inter.className} bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100`}>
        <script dangerouslySetInnerHTML={{__html:`
          // Disable right-click and common dev shortcuts + Detect DevTools Console
          (function(){
            document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, {passive:false});
            document.addEventListener('keydown', function(e){
              const key = (e && typeof e.key === 'string') ? e.key : ''
              const k = key ? key.toLowerCase() : ''
              /** Allow Ctrl+Alt+Shift+P emergency recovery shortcut (blocked below if Ctrl+P used alone). */
              const ctrlOrMetaPrint = ((e.ctrlKey || e.metaKey) && k==='p' && !(e.altKey && e.shiftKey))
              if ((e.ctrlKey || e.metaKey) && (k==='s' || k==='u' || ctrlOrMetaPrint || k==='c' || k==='x' || k==='i' || k==='j' || k==='k')) { e.preventDefault(); }
              if (key==='F12') { e.preventDefault(); }
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k==='c' || k==='i' || k==='j')) { e.preventDefault(); window.close(); }
            });
            // Prevent text selection globally except in editable controls
            const isEditable = (el)=>{
              if (!el) return false;
              const t = (el.tagName||'').toUpperCase();
              return t==='INPUT' || t==='TEXTAREA' || t==='SELECT' || el.isContentEditable;
            };
            document.addEventListener('selectstart', function(e){ if(!isEditable(e.target)) e.preventDefault(); }, {passive:false});
            document.addEventListener('mousedown', function(e){ if(e.shiftKey && !isEditable(e.target)) e.preventDefault(); }, {passive:false});
            document.addEventListener('dragstart', function(e){ if(!isEditable(e.target)) e.preventDefault(); }, {passive:false});
            // Disable autofill and suggestions globally
            const disableAttrs = (el)=>{
              try {
                el.setAttribute('autoComplete','off');
                el.setAttribute('autocapitalize','none');
                el.setAttribute('autocorrect','off');
                el.setAttribute('spellcheck','false');
                el.setAttribute('autosave','off');
                el.setAttribute('data-form-type','other');
              } catch {}
            };
            const scan = () => {
              document.querySelectorAll('input,textarea,form').forEach(disableAttrs);
            };
            // Delay MutationObserver to avoid hydration conflicts
            setTimeout(() => {
              const mo = new MutationObserver(scan); 
              mo.observe(document.documentElement,{subtree:true,childList:true,attributes:false});
              window.addEventListener('load', scan);
              scan();
            }, 100);
            
            // Detect DevTools Console and close tab
            let devtools = false;
            const detectDevTools = () => {
              const element = new Image();
              Object.defineProperty(element, 'id', {
                get: function() {
                  if (!devtools) {
                    devtools = true;
                    window.close();
                    document.body.innerHTML = '';
                  }
                }
              });
              // Remove the console.log that was causing infinite image logging
              // setInterval(() => {
              //   console.log(element);
              // }, 1000);
            };
            detectDevTools();
          })();
        `}} />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ChunkLoadRecovery />
          <MaintenanceFallbackGuard />
          <LanguageProvider>
            <RecoveryHotkeyNav />
            <MobileBlocker>
              {children}
            </MobileBlocker>
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
