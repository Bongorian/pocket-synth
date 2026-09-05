# Third-party code

- Lucide SVG icons: ISC; license in `app/src/main/assets/icons/LICENSE`.
- `MidiFramer.java` and `MidiConstants.java`: Copyright (C) 2015 The Android
  Open Source Project, Apache License 2.0 (`APACHE-2.0.txt`). Vendored from
  https://github.com/aosp-mirror/platform_frameworks_base/tree/master/core/java/com/android/internal/midi
  on 2026-09-06. Only package names were changed to avoid Android boot-classpath
  collisions. These classes handle byte-stream framing, running status and
  interleaved real-time bytes.

Synthesis uses native Web Audio OscillatorNode, PeriodicWave, BiquadFilterNode,
GainNode and WaveShaperNode. FM is a two-operator audio-rate modulation graph.
Wavetables are locally generated harmonic frames interpolated into PeriodicWave.
