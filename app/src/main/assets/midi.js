'use strict';
class MidiController {
  constructor(engine, changed, program) {
    this.engine = engine; this.changed = changed; this.program = program;
    this.channels = new Map(); this.enabled = false; this.channel = -1; this.events = 0;
  }
  state(source, channel) {
    const key = source + ':' + channel;
    if (!this.channels.has(key)) this.channels.set(key, { key, source, channel, pedal: false,
      held: new Set(), sustained: new Set(), volume: 1, expression: 1, bend: 8192, range: 2,
      rpnMsb: 127, rpnLsb: 127, modulation: 0, cutoff: null });
    return this.channels.get(key);
  }
  voices(s) { return [...this.engine.live].filter(v => v.id.startsWith('midi:' + s.key + ':')); }
  apply(s) {
    for (const v of this.voices(s)) {
      this.engine.pitch(v, (s.bend - 8192) / 8192 * s.range * 100);
      this.engine.expression(v, s.volume * s.expression);
      this.engine.controls(v, {modulation:s.modulation, cutoff:s.cutoff});
    }
  }
  off(s, note) {
    const id = 'midi:' + s.key + ':' + note; s.held.delete(note);
    if (s.pedal) s.sustained.add(note); else this.engine.noteOff(id);
  }
  clear(s, immediate = false) {
    for (const v of this.voices(s)) {
      if (immediate) this.engine.dispose(v); else this.engine.noteOff(v.id);
    }
    s.held.clear(); s.sustained.clear(); s.pedal = false;
  }
  reset() { for (const s of this.channels.values()) this.clear(s, true); this.channels.clear(); }
  clearChannel(channel) { for (const s of this.channels.values()) if(s.channel===channel)this.clear(s,true); }
  disconnect(source) {
    for (const [key, s] of this.channels) if (s.source === source) { this.clear(s, true); this.channels.delete(key); }
    this.changed();
  }
  receive(batch) {
    if (!this.enabled) return;
    for (const [source, status, d1, d2] of batch) {
      if (status === 255) { this.reset(); this.engine.panic(); continue; }
      const command = status & 240, channel = status & 15;
      if (command < 128 || command > 224 || (this.channel !== -1 && this.channel !== channel)) continue;
      const s = this.state(source, channel), id = 'midi:' + s.key + ':' + d1;
      this.events++;
      if (command === 128 || (command === 144 && d2 === 0)) this.off(s, d1);
      else if (command === 144) {
        this.engine.wake();
        this.engine.noteOff(id); s.sustained.delete(d1); s.held.add(d1);
        this.engine.noteOn(id, d1, undefined, d2 / 127, channel); this.apply(s);
      } else if (command === 224) { s.bend = d1 | (d2 << 7); this.apply(s); }
      else if (command === 192) this.program(d1, channel);
      else if (command === 176) {
        if (d1 === 64) {
          s.pedal = d2 >= 64;
          if (!s.pedal) { for (const n of s.sustained) if (!s.held.has(n)) this.engine.noteOff('midi:' + s.key + ':' + n); s.sustained.clear(); }
        } else if (d1 === 7 || d1 === 11) {
          s[d1 === 7 ? 'volume' : 'expression'] = d2 / 127; this.apply(s);
        } else if (d1 === 120) this.clear(s, true);
        else if (d1 === 123) { for (const n of [...s.held]) this.off(s, n); }
        else if (d1 === 121) {
          s.bend = 8192; s.expression = 1; s.pedal = false; s.rpnMsb = s.rpnLsb = 127; s.modulation=0; s.cutoff=null;
          for (const n of s.sustained) this.engine.noteOff('midi:' + s.key + ':' + n);
          s.sustained.clear(); this.apply(s);
        } else if (d1 === 101) s.rpnMsb = d2;
        else if (d1 === 100) s.rpnLsb = d2;
        else if (d1 === 6 && s.rpnMsb === 0 && s.rpnLsb === 0) { s.range = Math.min(24, d2); this.apply(s); }
        else if (d1 === 74) { s.cutoff=80*Math.pow(200,d2/127); this.apply(s); }
        else if (d1 === 1) { s.modulation=d2/127*50; this.apply(s); }
      }
    }
    this.changed();
  }
}
window.MidiController = MidiController;
