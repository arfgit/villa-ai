import type { SceneType } from '@/types'

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let isPlaying = false
let scheduledTimer: number | null = null
let resetTimer: number | null = null
let nextBassTime = 0
let nextLeadTime = 0
let nextDrumTime = 0
let bassStep = 0
let leadStep = 0
let drumStep = 0
let currentTrack: SceneType | 'menu' = 'menu'

const TEMPO_BPM = 100
const STEPS_PER_BEAT = 4
const SCHEDULE_AHEAD = 0.15
const MASTER_VOLUME = 0.07
const FADE_IN_MS = 800
const FADE_OUT_MS = 600

interface Note {
  freq: number | null
  dur: number
}

interface Track {
  bass: Note[]
  lead: Note[]
  drumPattern: ('kick' | 'snare' | 'hat' | null)[]
  bassWave: OscillatorType
  leadWave: OscillatorType
  bpm?: number
}

const FREQS = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51,
}

const TRACKS: Record<SceneType | 'menu', Track> = {
  menu: {
    bassWave: 'triangle',
    leadWave: 'square',
    bass: [
      { freq: FREQS.C2, dur: 2 }, { freq: FREQS.G2, dur: 2 },
      { freq: FREQS.A2, dur: 2 }, { freq: FREQS.E2, dur: 2 },
      { freq: FREQS.F2, dur: 2 }, { freq: FREQS.C2, dur: 2 },
    ],
    lead: [
      { freq: FREQS.E5, dur: 2 }, { freq: FREQS.G5, dur: 2 },
      { freq: FREQS.A5, dur: 4 },
      { freq: FREQS.G5, dur: 2 }, { freq: FREQS.E5, dur: 2 },
      { freq: FREQS.D5, dur: 4 },
    ],
    drumPattern: ['kick', null, 'hat', null, 'snare', null, 'hat', null],
  },

  firepit: {
    bassWave: 'triangle',
    leadWave: 'square',
    bass: [
      { freq: FREQS.A2, dur: 4 }, { freq: FREQS.E2, dur: 4 },
      { freq: FREQS.F2, dur: 4 }, { freq: FREQS.C2, dur: 4 },
      { freq: FREQS.D2, dur: 4 }, { freq: FREQS.A2, dur: 4 },
    ],
    lead: [
      { freq: FREQS.A4, dur: 2 }, { freq: FREQS.C5, dur: 2 },
      { freq: FREQS.E5, dur: 4 },
      { freq: null, dur: 2 }, { freq: FREQS.D5, dur: 2 },
      { freq: FREQS.C5, dur: 4 },
      { freq: FREQS.A4, dur: 2 }, { freq: FREQS.B4, dur: 2 },
      { freq: FREQS.A4, dur: 4 },
    ],
    drumPattern: ['kick', null, null, null, 'hat', null, null, null, 'kick', null, 'snare', null, 'hat', null, null, null],
  },

  pool: {
    bassWave: 'square',
    leadWave: 'triangle',
    bass: [
      { freq: FREQS.C3, dur: 1 }, { freq: FREQS.C3, dur: 1 },
      { freq: FREQS.G2, dur: 1 }, { freq: FREQS.G2, dur: 1 },
      { freq: FREQS.A2, dur: 1 }, { freq: FREQS.A2, dur: 1 },
      { freq: FREQS.F2, dur: 1 }, { freq: FREQS.F2, dur: 1 },
    ],
    lead: [
      { freq: FREQS.E5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.C6, dur: 2 },
      { freq: FREQS.B5, dur: 1 }, { freq: FREQS.A5, dur: 1 }, { freq: FREQS.G5, dur: 2 },
      { freq: FREQS.E5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.A5, dur: 2 },
      { freq: FREQS.G5, dur: 1 }, { freq: FREQS.F5, dur: 1 }, { freq: FREQS.E5, dur: 2 },
    ],
    drumPattern: ['kick', 'hat', 'snare', 'hat', 'kick', 'hat', 'snare', 'hat'],
    bpm: 120,
  },

  kitchen: {
    bassWave: 'triangle',
    leadWave: 'sine',
    bass: [
      { freq: FREQS.F2, dur: 4 }, { freq: FREQS.A2, dur: 4 },
      { freq: FREQS.G2, dur: 4 }, { freq: FREQS.C3, dur: 4 },
    ],
    lead: [
      { freq: FREQS.F5, dur: 2 }, { freq: FREQS.A5, dur: 2 },
      { freq: FREQS.C6, dur: 4 },
      { freq: FREQS.B5, dur: 2 }, { freq: FREQS.A5, dur: 2 },
      { freq: FREQS.G5, dur: 4 },
      { freq: FREQS.F5, dur: 2 }, { freq: FREQS.E5, dur: 2 },
      { freq: FREQS.D5, dur: 4 },
    ],
    drumPattern: ['kick', null, 'hat', null, 'snare', null, 'hat', null],
  },

  bedroom: {
    bassWave: 'sine',
    leadWave: 'triangle',
    bass: [
      { freq: FREQS.D2, dur: 8 },
      { freq: FREQS.A2, dur: 8 },
      { freq: FREQS.F2, dur: 8 },
      { freq: FREQS.C2, dur: 8 },
    ],
    lead: [
      { freq: FREQS.D5, dur: 4 }, { freq: FREQS.F5, dur: 4 },
      { freq: FREQS.A5, dur: 8 },
      { freq: FREQS.G5, dur: 4 }, { freq: FREQS.F5, dur: 4 },
      { freq: FREQS.E5, dur: 8 },
    ],
    drumPattern: ['kick', null, null, null, null, null, null, null, 'snare', null, null, null, null, null, null, null],
    bpm: 70,
  },

  recouple: {
    bassWave: 'sawtooth',
    leadWave: 'square',
    bass: [
      { freq: FREQS.A2, dur: 2 }, { freq: FREQS.A2, dur: 2 },
      { freq: FREQS.F2, dur: 2 }, { freq: FREQS.F2, dur: 2 },
      { freq: FREQS.G2, dur: 2 }, { freq: FREQS.G2, dur: 2 },
      { freq: FREQS.E2, dur: 2 }, { freq: FREQS.E2, dur: 2 },
    ],
    lead: [
      { freq: FREQS.A4, dur: 2 }, { freq: FREQS.C5, dur: 2 },
      { freq: FREQS.E5, dur: 4 },
      { freq: FREQS.F5, dur: 2 }, { freq: FREQS.E5, dur: 2 },
      { freq: FREQS.D5, dur: 4 },
      { freq: FREQS.C5, dur: 2 }, { freq: FREQS.B4, dur: 2 },
      { freq: FREQS.A4, dur: 4 },
    ],
    drumPattern: ['kick', null, 'snare', null, 'kick', 'kick', 'snare', null, 'kick', null, 'snare', 'hat', 'kick', 'kick', 'snare', null],
    bpm: 84,
  },

  date: {
    bassWave: 'sine',
    leadWave: 'triangle',
    bass: [
      { freq: FREQS.G2, dur: 4 }, { freq: FREQS.E2, dur: 4 },
      { freq: FREQS.A2, dur: 4 }, { freq: FREQS.D2, dur: 4 },
    ],
    lead: [
      { freq: FREQS.B4, dur: 2 }, { freq: FREQS.D5, dur: 2 },
      { freq: FREQS.G5, dur: 4 },
      { freq: FREQS.F5, dur: 2 }, { freq: FREQS.E5, dur: 2 },
      { freq: FREQS.D5, dur: 4 },
      { freq: FREQS.A4, dur: 2 }, { freq: FREQS.C5, dur: 2 },
      { freq: FREQS.B4, dur: 4 },
    ],
    drumPattern: ['kick', null, null, null, 'hat', null, null, null],
    bpm: 80,
  },

  challenge: {
    bassWave: 'square',
    leadWave: 'sawtooth',
    bass: [
      { freq: FREQS.E2, dur: 1 }, { freq: FREQS.E2, dur: 1 }, { freq: FREQS.E2, dur: 1 }, { freq: FREQS.G2, dur: 1 },
      { freq: FREQS.A2, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.B2, dur: 1 },
      { freq: FREQS.C3, dur: 1 }, { freq: FREQS.C3, dur: 1 }, { freq: FREQS.B2, dur: 1 }, { freq: FREQS.A2, dur: 1 },
      { freq: FREQS.G2, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.B2, dur: 1 }, { freq: FREQS.E2, dur: 1 },
    ],
    lead: [
      { freq: FREQS.E5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.B5, dur: 1 }, { freq: FREQS.E6, dur: 1 },
      { freq: FREQS.D6, dur: 1 }, { freq: FREQS.B5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.E5, dur: 1 },
      { freq: FREQS.A5, dur: 1 }, { freq: FREQS.B5, dur: 1 }, { freq: FREQS.C6, dur: 1 }, { freq: FREQS.B5, dur: 1 },
      { freq: FREQS.A5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.F5, dur: 1 }, { freq: FREQS.E5, dur: 1 },
    ],
    drumPattern: ['kick', 'hat', 'snare', 'hat', 'kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat', 'kick', 'hat', 'snare', 'kick'],
    bpm: 140,
  },
  interview: {
    bassWave: 'sine',
    leadWave: 'triangle',
    bass: [
      { freq: FREQS.A2, dur: 4 }, { freq: FREQS.E2, dur: 4 },
      { freq: FREQS.F2, dur: 4 }, { freq: FREQS.C2, dur: 4 },
    ],
    lead: [
      { freq: FREQS.A4, dur: 2 }, { freq: FREQS.C5, dur: 2 }, { freq: FREQS.E5, dur: 2 }, { freq: FREQS.A5, dur: 2 },
      { freq: FREQS.G5, dur: 2 }, { freq: FREQS.E5, dur: 2 }, { freq: FREQS.C5, dur: 2 }, { freq: FREQS.A4, dur: 2 },
    ],
    drumPattern: [null, null, 'hat', null, null, null, 'hat', null, null, null, 'hat', null, null, null, 'hat', null],
    bpm: 80,
  },
  bombshell: {
    bassWave: 'sawtooth',
    leadWave: 'square',
    bass: [
      { freq: FREQS.F2, dur: 1 }, { freq: FREQS.F2, dur: 1 }, { freq: FREQS.F2, dur: 1 }, { freq: FREQS.G2, dur: 1 },
      { freq: FREQS.A2, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.C3, dur: 1 },
      { freq: FREQS.F2, dur: 1 }, { freq: FREQS.F2, dur: 1 }, { freq: FREQS.F2, dur: 1 }, { freq: FREQS.G2, dur: 1 },
      { freq: FREQS.A2, dur: 1 }, { freq: FREQS.C3, dur: 1 }, { freq: FREQS.D3, dur: 1 }, { freq: FREQS.F3, dur: 1 },
    ],
    lead: [
      { freq: FREQS.C5, dur: 1 }, { freq: FREQS.E5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.C6, dur: 1 },
      { freq: FREQS.A5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.F5, dur: 1 }, { freq: FREQS.E5, dur: 1 },
      { freq: FREQS.D5, dur: 1 }, { freq: FREQS.F5, dur: 1 }, { freq: FREQS.A5, dur: 1 }, { freq: FREQS.C6, dur: 1 },
      { freq: FREQS.D6, dur: 1 }, { freq: FREQS.C6, dur: 1 }, { freq: FREQS.A5, dur: 1 }, { freq: FREQS.F5, dur: 1 },
    ],
    drumPattern: ['kick', 'hat', 'kick', 'snare', 'kick', 'hat', 'kick', 'snare', 'kick', 'kick', 'hat', 'snare', 'kick', 'hat', 'snare', 'kick'],
    bpm: 130,
  },
  minigame: {
    bassWave: 'square',
    leadWave: 'square',
    bass: [
      { freq: FREQS.C2, dur: 1 }, { freq: FREQS.C2, dur: 1 }, { freq: FREQS.E2, dur: 1 }, { freq: FREQS.G2, dur: 1 },
      { freq: FREQS.C3, dur: 1 }, { freq: FREQS.G2, dur: 1 }, { freq: FREQS.E2, dur: 1 }, { freq: FREQS.C2, dur: 1 },
      { freq: FREQS.F2, dur: 1 }, { freq: FREQS.F2, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.C3, dur: 1 },
      { freq: FREQS.F3, dur: 1 }, { freq: FREQS.C3, dur: 1 }, { freq: FREQS.A2, dur: 1 }, { freq: FREQS.F2, dur: 1 },
    ],
    lead: [
      { freq: FREQS.C5, dur: 1 }, { freq: FREQS.E5, dur: 1 }, { freq: FREQS.G5, dur: 1 }, { freq: FREQS.C6, dur: 1 },
      { freq: FREQS.G5, dur: 1 }, { freq: FREQS.E5, dur: 1 }, { freq: FREQS.C5, dur: 1 }, { freq: FREQS.E5, dur: 1 },
      { freq: FREQS.F5, dur: 1 }, { freq: FREQS.A5, dur: 1 }, { freq: FREQS.C6, dur: 1 }, { freq: FREQS.E6, dur: 1 },
      { freq: FREQS.C6, dur: 1 }, { freq: FREQS.A5, dur: 1 }, { freq: FREQS.F5, dur: 1 }, { freq: FREQS.C5, dur: 1 },
    ],
    drumPattern: ['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat', 'kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'kick'],
    bpm: 130,
  },
} as Record<SceneType | 'menu', Track>

// Alias new scene types to existing tracks
TRACKS.public_vote = TRACKS.recouple
TRACKS.islander_vote = TRACKS.recouple
TRACKS.producer_twist = TRACKS.bombshell
TRACKS.casa_amor_arrival = TRACKS.bombshell
TRACKS.casa_amor_date = TRACKS.date
TRACKS.casa_amor_challenge = TRACKS.challenge
TRACKS.casa_amor_stickswitch = TRACKS.recouple
TRACKS.grand_finale = TRACKS.recouple

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    masterGain = ctx.createGain()
    masterGain.gain.value = 0
    masterGain.connect(ctx.destination)
  }
  return ctx
}

function playNote(type: OscillatorType, freq: number, startTime: number, duration: number, gain: number) {
  if (!ctx || !masterGain) return
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)

  const env = ctx.createGain()
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.01)
  env.gain.linearRampToValueAtTime(gain * 0.6, startTime + duration * 0.7)
  env.gain.linearRampToValueAtTime(0, startTime + duration)

  osc.connect(env)
  env.connect(masterGain)
  osc.onended = () => {
    osc.disconnect()
    env.disconnect()
  }
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

function playDrum(kind: 'kick' | 'snare' | 'hat', startTime: number) {
  if (!ctx || !masterGain) return

  if (kind === 'kick') {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, startTime)
    osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.12)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.5, startTime)
    env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15)
    osc.connect(env)
    env.connect(masterGain)
    osc.onended = () => { osc.disconnect(); env.disconnect() }
    osc.start(startTime)
    osc.stop(startTime + 0.2)
  } else if (kind === 'snare') {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.3, startTime)
    env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1)
    noise.connect(env)
    env.connect(masterGain)
    noise.onended = () => { noise.disconnect(); env.disconnect() }
    noise.start(startTime)
  } else {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 6000
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.12, startTime)
    env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04)
    noise.connect(filter)
    filter.connect(env)
    env.connect(masterGain)
    noise.onended = () => { noise.disconnect(); filter.disconnect(); env.disconnect() }
    noise.start(startTime)
  }
}

function getStepDuration(): number {
  const track = TRACKS[currentTrack]
  const bpm = track.bpm ?? TEMPO_BPM
  return (60 / bpm) / STEPS_PER_BEAT
}

function scheduleNotes() {
  if (!ctx || !isPlaying) return
  const track = TRACKS[currentTrack]
  const stepDur = getStepDuration()
  const horizon = ctx.currentTime + SCHEDULE_AHEAD

  while (nextBassTime < horizon) {
    const note = track.bass[bassStep % track.bass.length]!
    if (note.freq !== null) {
      playNote(track.bassWave, note.freq, nextBassTime, stepDur * note.dur, 0.5)
    }
    nextBassTime += stepDur * note.dur
    bassStep++
  }

  while (nextLeadTime < horizon) {
    const note = track.lead[leadStep % track.lead.length]!
    if (note.freq !== null) {
      playNote(track.leadWave, note.freq, nextLeadTime, stepDur * note.dur * 0.95, 0.32)
    }
    nextLeadTime += stepDur * note.dur
    leadStep++
  }

  while (nextDrumTime < horizon) {
    const drum = track.drumPattern[drumStep % track.drumPattern.length]
    if (drum) {
      playDrum(drum, nextDrumTime)
    }
    nextDrumTime += stepDur * 1
    drumStep++
  }

  scheduledTimer = window.setTimeout(scheduleNotes, 25)
}

function fadeIn() {
  if (!ctx || !masterGain) return
  const now = ctx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setValueAtTime(masterGain.gain.value, now)
  masterGain.gain.linearRampToValueAtTime(MASTER_VOLUME, now + FADE_IN_MS / 1000)
}

export async function startMusic(track: SceneType | 'menu' = 'menu'): Promise<void> {
  const audioCtx = ensureContext()
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume()
    } catch {
      return
    }
  }
  if (resetTimer !== null) {
    clearTimeout(resetTimer)
    resetTimer = null
  }
  currentTrack = track
  if (isPlaying) {
    bassStep = 0
    leadStep = 0
    drumStep = 0
    nextBassTime = audioCtx.currentTime + 0.05
    nextLeadTime = audioCtx.currentTime + 0.05
    nextDrumTime = audioCtx.currentTime + 0.05
    return
  }
  isPlaying = true
  bassStep = 0
  leadStep = 0
  drumStep = 0
  nextBassTime = audioCtx.currentTime + 0.05
  nextLeadTime = audioCtx.currentTime + 0.05
  nextDrumTime = audioCtx.currentTime + 0.05
  fadeIn()
  scheduleNotes()
}

export function changeTrack(track: SceneType | 'menu'): void {
  if (!isPlaying || currentTrack === track) {
    currentTrack = track
    return
  }
  if (!ctx) return
  currentTrack = track
  bassStep = 0
  leadStep = 0
  drumStep = 0
  nextBassTime = ctx.currentTime + 0.05
  nextLeadTime = ctx.currentTime + 0.05
  nextDrumTime = ctx.currentTime + 0.05
}

export function stopMusic(): void {
  if (!isPlaying) return
  isPlaying = false
  if (scheduledTimer !== null) {
    clearTimeout(scheduledTimer)
    scheduledTimer = null
  }
  if (resetTimer !== null) {
    clearTimeout(resetTimer)
    resetTimer = null
  }
  if (masterGain && ctx) {
    const now = ctx.currentTime
    masterGain.gain.cancelScheduledValues(now)
    masterGain.gain.setValueAtTime(masterGain.gain.value, now)
    masterGain.gain.linearRampToValueAtTime(0, now + FADE_OUT_MS / 1000)
  }
}

export function isMusicPlaying(): boolean {
  return isPlaying
}
