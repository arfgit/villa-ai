let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let isPlaying = false
let scheduledTimer: number | null = null
let nextNoteTime = 0
let currentStep = 0

const TEMPO_BPM = 96
const SECONDS_PER_BEAT = 60 / TEMPO_BPM
const STEPS_PER_BEAT = 4
const SECONDS_PER_STEP = SECONDS_PER_BEAT / STEPS_PER_BEAT
const SCHEDULE_AHEAD = 0.12

const MELODY: Array<{ note: number | null; dur: number }> = [
  { note: 65.41, dur: 2 },  // C2
  { note: 82.41, dur: 1 },  // E2
  { note: 98.00, dur: 1 },  // G2
  { note: 130.81, dur: 2 }, // C3
  { note: 98.00, dur: 1 },
  { note: 82.41, dur: 1 },
  { note: 73.42, dur: 2 },  // D2
  { note: 87.31, dur: 1 },  // F2
  { note: 110.00, dur: 1 }, // A2
  { note: 146.83, dur: 2 }, // D3
  { note: 110.00, dur: 1 },
  { note: 87.31, dur: 1 },
  { note: 87.31, dur: 2 },  // F2
  { note: 110.00, dur: 1 },
  { note: 130.81, dur: 1 },
  { note: 174.61, dur: 2 }, // F3
  { note: 130.81, dur: 1 },
  { note: 110.00, dur: 1 },
  { note: 98.00, dur: 2 },  // G2
  { note: 130.81, dur: 1 },
  { note: 164.81, dur: 1 }, // E3
  { note: 196.00, dur: 2 }, // G3
  { note: 164.81, dur: 1 },
  { note: 130.81, dur: 1 },
]

const LEAD: Array<{ note: number | null; dur: number }> = [
  { note: 523.25, dur: 2 }, // C5
  { note: null, dur: 2 },
  { note: 659.25, dur: 1 }, // E5
  { note: 783.99, dur: 1 }, // G5
  { note: 523.25, dur: 2 },
  { note: null, dur: 2 },
  { note: 587.33, dur: 2 }, // D5
  { note: null, dur: 2 },
  { note: 698.46, dur: 1 }, // F5
  { note: 880.00, dur: 1 }, // A5
  { note: 587.33, dur: 2 },
  { note: null, dur: 2 },
  { note: 698.46, dur: 4 },
  { note: 880.00, dur: 2 },
  { note: 1046.50, dur: 2 }, // C6
  { note: 783.99, dur: 4 },
  { note: 659.25, dur: 2 },
  { note: 783.99, dur: 2 },
]

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    masterGain = ctx.createGain()
    masterGain.gain.value = 0.08
    masterGain.connect(ctx.destination)
  }
  return ctx
}

function playSquareNote(freq: number, startTime: number, duration: number, gain: number = 0.6) {
  if (!ctx || !masterGain) return
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, startTime)

  const env = ctx.createGain()
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.01)
  env.gain.linearRampToValueAtTime(gain * 0.6, startTime + duration * 0.7)
  env.gain.linearRampToValueAtTime(0, startTime + duration)

  osc.connect(env)
  env.connect(masterGain)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

function playTriangleNote(freq: number, startTime: number, duration: number, gain: number = 0.4) {
  if (!ctx || !masterGain) return
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, startTime)

  const env = ctx.createGain()
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.02)
  env.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  osc.connect(env)
  env.connect(masterGain)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

function scheduleNotes() {
  if (!ctx) return

  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
    const bassIdx = currentStep % MELODY.length
    const bassNote = MELODY[bassIdx]
    const leadIdx = currentStep % LEAD.length
    const leadNote = LEAD[leadIdx]

    if (bassNote && bassNote.note !== null) {
      playTriangleNote(bassNote.note, nextNoteTime, SECONDS_PER_STEP * bassNote.dur, 0.5)
    }
    if (leadNote && leadNote.note !== null) {
      playSquareNote(leadNote.note, nextNoteTime, SECONDS_PER_STEP * leadNote.dur * 0.95, 0.35)
    }

    const stepDur = bassNote?.dur ?? 1
    nextNoteTime += SECONDS_PER_STEP * stepDur
    currentStep += stepDur
  }

  if (isPlaying) {
    scheduledTimer = window.setTimeout(scheduleNotes, 25)
  }
}

export async function startMusic(): Promise<void> {
  const audioCtx = ensureContext()
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume()
  }
  if (isPlaying) return
  isPlaying = true
  currentStep = 0
  nextNoteTime = audioCtx.currentTime + 0.05
  scheduleNotes()
}

export function stopMusic(): void {
  isPlaying = false
  if (scheduledTimer !== null) {
    clearTimeout(scheduledTimer)
    scheduledTimer = null
  }
  if (masterGain && ctx) {
    masterGain.gain.cancelScheduledValues(ctx.currentTime)
    masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1)
    setTimeout(() => {
      if (masterGain) masterGain.gain.value = 0.08
    }, 200)
  }
}

export function isMusicPlaying(): boolean {
  return isPlaying
}
