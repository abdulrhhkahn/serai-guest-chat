// Short two-tone beep, generated on the fly rather than shipping an audio
// file. Browsers block audio from playing before any user interaction on
// the page at all — this will silently no-op on a completely fresh
// pageload until the person has clicked or typed something once, which
// is a browser restriction, not a bug here.
export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.16);
    });
  } catch {
    /* best-effort — some browsers/contexts may block this entirely */
  }
}
