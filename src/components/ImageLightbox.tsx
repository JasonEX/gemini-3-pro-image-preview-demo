import { type MouseEvent, useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

type ImageLightboxProps = {
  src: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageLightbox({ src, open, onOpenChange }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    if (open) {
      setZoom(100)
    }
  }, [open, src])

  const clampZoom = (value: number) => Math.min(300, Math.max(50, value))

  const handleZoomIn = () => setZoom((z) => clampZoom(z + 25))
  const handleZoomOut = () => setZoom((z) => clampZoom(z - 25))
  const handleImageClick = (event: MouseEvent<HTMLImageElement>) => {
    event.stopPropagation()
    handleZoomIn()
  }
  const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  const handleClose = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-auto h-auto p-0 bg-transparent border-0 shadow-none focus:outline-none overflow-hidden [&>button]:hidden">
        {open && (
          <div
            className="relative flex items-center justify-center w-full h-full"
            onClick={handleContentClick}
          >
            {/* 关闭按钮 - 移动到图片外部右上角，增加点击区域 */}
            <button
              aria-label="关闭预览"
              className="fixed top-4 right-4 z-50 rounded-full bg-black/50 p-2.5 text-white transition hover:bg-black/70 backdrop-blur-sm"
              onClick={handleClose}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative flex items-center justify-center" style={{ maxHeight: '85vh', maxWidth: '95vw' }}>
              <img
                src={src}
                alt="预览图片"
                className="max-h-[85vh] max-w-[95vw] select-none rounded-lg object-contain transition-transform duration-200 ease-out cursor-grab active:cursor-grabbing"
                style={{ transform: `scale(${zoom / 100})` }}
                onClick={handleImageClick}
              />
            </div>

            <div
              className="fixed bottom-8 left-1/2 -translate-x-1/2 transform z-50"
              onClick={handleContentClick}
            >
              <div className="flex items-center gap-4 rounded-full bg-black/70 px-4 py-2 text-white shadow-lg backdrop-blur-md border border-white/10">
                <button
                  className="rounded-full p-1.5 transition hover:bg-white/20 disabled:opacity-30"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  aria-label="缩小"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="w-12 text-center text-xs font-mono tabular-nums select-none">{zoom}%</span>
                <button
                  className="rounded-full p-1.5 transition hover:bg-white/20 disabled:opacity-30"
                  onClick={handleZoomIn}
                  disabled={zoom >= 300}
                  aria-label="放大"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
