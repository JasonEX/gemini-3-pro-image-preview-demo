import { RotateCcw, Settings, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type ChatHeaderProps = {
  loading: boolean
  onReset: () => void
  onOpenSettings?: () => void
}

export function ChatHeader({ loading, onReset, onOpenSettings }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b bg-background/95 backdrop-blur px-3 py-2 md:px-4 md:py-3 sticky top-0 z-40">
      <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
        <h1 className="text-lg md:text-xl font-bold flex items-center gap-2 truncate">
          <span className="md:hidden truncate">✨ Banana Pro</span>
          <span className="hidden md:inline">✨ Banana Pro 图像创作</span>
        </h1>
        {loading && (
          <Badge variant="secondary" className="gap-1 animate-pulse shrink-0 px-1.5 md:px-2.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs hidden sm:inline">生成中…</span>
            <span className="text-xs sm:hidden">…</span>
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-0.5 md:gap-2 text-sm text-muted-foreground shrink-0">
        {onOpenSettings && (
          <Button variant="ghost" size="icon" onClick={onOpenSettings} title="设置" className="h-8 w-8 md:h-9 md:w-9">
            <Settings className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onReset} title="重置对话" disabled={loading} className="h-8 w-8 md:h-9 md:w-9">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
