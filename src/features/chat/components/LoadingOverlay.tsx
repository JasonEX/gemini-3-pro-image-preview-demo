import { Loader2 } from "lucide-react"
import type { ImageSize } from "@/features/chat/types"

type LoadingOverlayProps = {
  show: boolean
  message?: string
  imageSize?: ImageSize
}

const buildEstimate = (imageSize?: ImageSize) => {
  if (!imageSize) return "预计耗时：1K≈1分钟，2K≈5分钟，4K≈10分钟；最长可等待 20 分钟，请耐心等待"
  const map: Record<ImageSize, string> = { "1K": "≈1分钟", "2K": "≈5分钟", "4K": "≈10分钟" }
  return `预计耗时：${imageSize}${map[imageSize]}（参考值）· 最长可等待 20 分钟，请耐心等待`
}

export function LoadingOverlay({ show, message = "正在生成图像，请稍候…", imageSize }: LoadingOverlayProps) {
  // 不显示时不渲染DOM
  if (!show) return null

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex items-center justify-center transition-opacity duration-200 z-50 p-4"
      aria-hidden={false}
    >
      <div className="rounded-2xl bg-background/90 shadow-lg border px-4 py-3 md:px-6 md:py-4 flex items-center gap-3 backdrop-blur-sm max-w-[90vw] md:max-w-md">
        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-sm truncate">{message}</span>
          <span className="text-xs text-muted-foreground break-words leading-tight">{buildEstimate(imageSize)}</span>
        </div>
      </div>
    </div>
  )
}
