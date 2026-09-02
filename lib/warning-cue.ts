/**
 * The one cue cuelume does not have: a caution tone.
 *
 * Its seventeen sounds cover every surface in this app except "you are about
 * to do something you cannot undo" — `error` means it already failed, and
 * `bloom` is the neutral panel-arriving swell every other dialog gets. A
 * destructive confirm deserves to sound different from a settings sheet.
 *
 * The shape comes from procedural-sounds.vercel.app (MIT), which generates
 * recipes in the same layers/envelope vocabulary cuelume uses: two descending
 * sines, the second delayed — a falling interval, which is what a warning has
 * sounded like since long before interfaces had them.
 *
 * Its ~6kb player is not vendored with it. That runtime carries reverb, FM,
 * filters and pink/brown noise, none of which this recipe touches, and it
 * hardcodes a connection to `ctx.destination` — which would put this one cue
 * outside the app's own mute and volume. Twenty lines of plain Web Audio play
 * the same recipe and stay inside them.
 */

/** `warning-gpvq3`, transcribed from the generator's own output. */
const LAYERS = [
  { frequency: 702.5350597525128, attack: 0.004, decay: 0.09003838208446335, gain: 0.138, delay: 0 },
  { frequency: 557.6023543352462, attack: 0.004, decay: 0.168877301015077, gain: 0.182, delay: 0.1321461360042998 },
] as const;

/** Exponential ramps cannot reach zero, so silence is approached, not set. */
const SILENT = 0.0001;
const TAIL = 0.1;

let context: AudioContext | null = null;

/**
 * Plays the caution tone at `volume` (0–1).
 *
 * Lazily creates its own `AudioContext` on first use, the same way cuelume
 * does, and resumes a suspended one where the browser allows. Any failure —
 * no Web Audio, autoplay still blocked — is a silent no-op rather than a
 * thrown error, because a cue is never worth breaking a click over.
 */
export function playWarning(volume: number): void {
  if (typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();

    const start = context.currentTime;
    for (const layer of LAYERS) {
      const at = start + layer.delay;
      const peak = Math.max(layer.gain * volume, SILENT);

      const gain = context.createGain();
      gain.gain.setValueAtTime(SILENT, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + layer.attack);
      gain.gain.exponentialRampToValueAtTime(SILENT, at + layer.attack + layer.decay);

      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(layer.frequency, at);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + layer.attack + layer.decay + TAIL);
    }
  } catch {
    // Blocked autoplay, no Web Audio — nothing to recover, nothing to report.
  }
}
