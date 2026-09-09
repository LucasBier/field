// A quiet, locally synthesized loop. Audio starts only from an explicit interaction.
export function createRoomAudio() {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;
  let next = 0;
  let disposed = false;
  let wanted = false;
  const notes = [
    48, 55, 60, 63, 46, 53, 58, 62, 44, 51, 56, 60, 43, 50, 55, 58,
  ];
  function schedule() {
    if (!context || !master || context.state !== 'running') return;
    while (next < context.currentTime + 0.3) {
      const midi = notes[step % notes.length];
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      envelope.gain.setValueAtTime(0, next);
      envelope.gain.linearRampToValueAtTime(0.09, next + 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.001, next + 1.5);
      oscillator.connect(envelope).connect(master);
      oscillator.start(next);
      oscillator.stop(next + 1.6);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
      next += 0.42;
      step++;
    }
  }
  return {
    async play() {
      if (disposed) return;
      wanted = true;
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0.4;
        master.connect(context.destination);
      }
      await context.resume();
      if (disposed || !wanted) return;
      next = context.currentTime + 0.04;
      master!.gain.setTargetAtTime(0.4, context.currentTime, 0.2);
      if (!timer) timer = setInterval(schedule, 120);
      schedule();
    },
    pause() {
      wanted = false;
      clearInterval(timer);
      timer = undefined;
      if (context && master)
        master.gain.setTargetAtTime(0, context.currentTime, 0.08);
    },
    dispose() {
      disposed = true;
      wanted = false;
      clearInterval(timer);
      if (context) void context.close();
    },
  };
}
