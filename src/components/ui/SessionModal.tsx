import { useState } from 'react'
import clsx from 'clsx'
import { getSessionId } from '@/lib/sessionId'
import { loadSessionByKey } from '@/store/useVillaStore'

interface Props {
  open: boolean
  onClose: () => void
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function SessionModal({ open, onClose }: Props) {
  const currentId = getSessionId()
  const [inputId, setInputId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  function handleCopy() {
    navigator.clipboard.writeText(currentId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  async function handleLoad() {
    const trimmed = inputId.trim()
    if (!UUID_RE.test(trimmed)) {
      setError('Invalid session ID format')
      return
    }
    setLoading(true)
    setError(null)
    const ok = await loadSessionByKey(trimmed)
    setLoading(false)
    if (ok) {
      onClose()
    } else {
      setError('Session not found or empty')
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-villa-bg-2 border-2 border-villa-pink w-full max-w-md">
          <div className="flex items-center justify-between p-3 border-b border-villa-pink/30">
            <span className="text-[10px] uppercase tracking-widest text-villa-pink">
              session manager
            </span>
            <button onClick={onClose} className="text-villa-dim hover:text-villa-pink text-xs">
              [close]
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-1">
                your session key
              </label>
              <div className="flex gap-2">
                <div className="flex-1 bg-villa-bg border border-villa-dim/30 px-2 py-1.5 text-xs font-mono text-villa-aqua select-all break-all">
                  {currentId}
                </div>
                <button
                  onClick={handleCopy}
                  className={clsx(
                    'px-2 py-1.5 text-[10px] uppercase border shrink-0',
                    copied
                      ? 'border-villa-sun text-villa-sun'
                      : 'border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua'
                  )}
                >
                  {copied ? 'copied' : 'copy'}
                </button>
              </div>
              <p className="text-[9px] text-villa-dim/60 mt-1">
                save this key to reload your villa session later
              </p>
            </div>

            <div className="border-t border-villa-dim/20 pt-4">
              <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-1">
                load existing session
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputId}
                  onChange={(e) => { setInputId(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLoad() }}
                  placeholder="paste session key..."
                  className="flex-1 bg-villa-bg border border-villa-dim/30 px-2 py-1.5 text-xs font-mono text-villa-pink placeholder:text-villa-dim/30 outline-none focus:border-villa-pink/60"
                />
                <button
                  onClick={handleLoad}
                  disabled={loading || !inputId.trim()}
                  className={clsx(
                    'px-3 py-1.5 text-[10px] uppercase border shrink-0',
                    loading
                      ? 'border-villa-dim/40 text-villa-dim cursor-wait'
                      : 'border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg cursor-pointer'
                  )}
                >
                  {loading ? 'loading...' : 'load'}
                </button>
              </div>
              {error && (
                <p className="text-[10px] text-villa-love mt-1">{error}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
