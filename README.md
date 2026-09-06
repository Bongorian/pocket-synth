# Pocket Synth 5

Offline Android synthesizer with 16 MIDI parts, a shared 16-voice budget,
75 factory presets, 16 named user slots and a browser interface. Eleven independent
engine modules include all nine synthesis families below, plus ring modulation
and synthesized drum kits. No network or microphone permission is required.

| Engine | Implementation | Main sound controls |
| --- | --- | --- |
| Virtual Analog | Two bandlimited oscillators and sine sub | Wave, detune, sub, filter |
| Wavetable | Interpolation between five harmonic frames in three tables | Table, position |
| FM | Two-operator frequency modulation with index envelope | Ratio, index, index decay |
| PCM Sampler | Pitched mono PCM playback; built-in or imported audio | Root note, start, loop |
| Additive | Up to 32 weighted harmonics | Harmonic count, tilt, even balance |
| Physical Model | Karplus–Strong fractional-delay plucked string, rendered and cached per note | Damping, decay, pluck position |
| Granular | Overlapping Hann-windowed sample grains in a two-second cyclic cloud | Grain size, density, position, spread, scan |
| Spectral | Windowed 512-sample DFT analysis, partial remapping and bandlimited frozen-spectrum resynthesis | Freeze position, partial shift, tilt, blur |
| Wave Sequence | Four wave oscillators with looping audio-rate crossfade control signals | Steps per second, blend, pattern |
| Ring Mod | Carrier multiplied by a bipolar modulator | Ratio, wet mix |
| Drum Kit | Synthesized kick, snare, hats, toms and percussion | Kit, tune, decay |

Audio is rendered by native Web Audio nodes with an interactive latency hint;
there is no JavaScript sample callback or timer driving ongoing playback.
Sequence speed is independent of played pitch. Expensive prepared buffers are
cached (24 buffers) and harmonic waves are cached (192 entries). Voice stealing
includes release tails and prefers already released voices. Filter, drive, delay,
mixer and LFO are shared per part where possible; master compression limits output.
Latency depends on the Android WebView/audio route. No end-to-end latency or
sustained thermal benchmark is claimed; this is not an AAudio/Oboe native DSP app.

## Play and edit

- Touch keys support chords and sliding. Physical keys A W S E D F T G Y H U J K O L play chromatically; Z/X change octave.
- Space is a momentary sustain pedal; Hold latches sustain. Esc or the red square stops voices and clears delays.
- Choose a part with Ch, then choose its sound in Sound Library. Search, filter by engine, mark favorites and navigate previous/next sounds.
- ENGINE shows only that engine's controls and an explanation in Japanese. TONE/ENV/FX edit the shared sound chain; LIVE provides filter XY and performance controls.
- MIDI velocity, sustain, pitch bend and modulation remain independent per channel/source. Local bend/modulation controls are per part.
- FX includes vibrato, filter LFO, tremolo, drive, delay and feedback. Filter LFO and tremolo use the same part LFO rate as vibrato.
- MIX provides level, pan, mute, solo and sound assignment for all 16 parts.
- Save stores a named user patch. Undo/Redo and A/B comparison cover current-session patch edits.
- Project exports/imports a JSON bank including embedded user PCM. Maximum bank file size is 8 MiB; browser storage capacity can limit large collections.

PCM, physical and granular source settings are captured at note-on, as are
sequence blend/pattern. Filters, expression, LFO and effects remain live for these
engines; sequence speed and spectral processing controls also update held notes.
A physical string naturally decays to silence within a maximum six-second buffer.
Granular loops are prepared two-second clouds, not an unbounded streaming grain
scheduler; transposition changes grain timing together with sample pitch.
Spectral processing freezes one frame, not a continuous phase-vocoder effect or
microphone processor. Wave sequences offer three four-step waveform patterns,
not an arbitrary sample-sequence editor or external MIDI-clock sync.

## Samples and presets

ENGINE > 音声読込 imports an audio file using the Android document picker or
browser file input. Audio must be 10 ms–2 seconds and no larger than 2 MiB. Formats
are those decoded by the installed WebView/browser; WAV PCM is the test format.
Audio is downmixed/resampled to mono 24 kHz / 16 bit and embedded in the patch.
Set Root Note to the original recording pitch; the default is C4. PCM, granular
and spectral engines share the sample selector. Selecting a built-in sample
replaces the selected patch's imported sample. Saving/bank export includes sample data.

The three built-in PCM sources (Pluck, Bell, Air) are original synthesized samples,
not acoustic instrument recordings. No external sample library or download is needed.

Version 5 adds 36 presets (75 total): three each for analog, wavetable, FM and
additive; four PCM sounds; and five each for physical, granular, spectral and
wave sequence. Examples: VA Velvet Pad, FM Tine Studio, PCM Music Box, Model Nylon,
Model Koto, Grain Bell Dust, Spectral Ghost Choir, Sequence Aurora.

## MIDI and Android

Enable MIDI reception in the MIDI tab. Android MIDI mode uses a mediaPlayback
foreground service so MIDI continues when another app is in front. Local touch
and keyboard notes release when leaving the app. Focus loss stops sound.

USB class-compliant MIDI 1.0 output ports detected by Android open automatically.
A source selector also exposes registered device outputs. Other apps can send
to **Pocket Synth - MIDI In** (for example Orca-c Android).

Supported: note on/off, velocity-zero note off, channel selection/Omni, CC64,
CC7, CC11, pitch bend, RPN 0 bend range up to 24 semitones, CC120/121/123,
CC1 vibrato, CC74 cutoff, system reset, and optional Program Change 0–74.
This is not a GM bank. No MIDI 2.0 UMP, MPE, SysEx patches, aftertouch assignment,
BLE scanning, external clock sync or sample-accurate future MIDI timestamps.
USB disconnect stops the removed source's voices. Physical USB hardware was not
attached during v5 verification; the Android USB MIDI implementation remains present.

## Engine extension contract

`app/src/main/assets/engines/registry.js` owns the registry. Each engine has its own
file and calls `SynthEngines.register(id, descriptor)`. Descriptors expose:

- `label`, `description`, `defaults`, `controls` and optional `sample` metadata.
- `create(host, voice, time)` connects sources to `voice.filter` and starts them at the supplied audio time.
- Optional `update(host, voice, changed)` handles parameters applicable to held notes.

Put pitched sources into `voice.osc`, non-pitched scheduled sources into
`voice.auxSources`, and additional nodes into `voice.extra`. Connect pitch LFO to
source detune where applicable. The host owns ADSR, MIDI controllers, pitch bend,
effects, registration, voice stealing, note release and disposal. One-shot engines
use `oneshot: true` and register their complete voice through the host (see drums).

Load the new script before `engine.js` in `index.html`, declare numeric parameter
`specs` on the descriptor (the same shape as shared controls in `app.js`), and add factory patches in `presets.js`. Engine selectors,
labels, visibility and library filters derive from registry metadata. The host does
not dispatch synthesis through a list of mode-specific branches.

## Build and verification

Run `./gradlew --offline --no-daemon assembleDebug` with installed JDK 21, SDK 34,
Gradle 8.10.2 and Debian ARM64 AAPT2. APK: `app/build/outputs/apk/debug/app-debug.apk`.
Debug signing uses `~/.config/.android/debug.keystore` if present; override using
`-PpocketDebugKeystore=/path/to/debug.keystore`.

For browser playback, open `app/src/main/assets/index.html`. Android serves bundled
assets through a local HTTPS WebView origin; no web server or hosting is used.

Run `npm ci --prefix tools` to install browser test dependencies, then:

- `node tools/verify-v5.cjs`: all 75 preset audio renders, 11 engine lifecycles, parameter output changes, voice limit/panic, WAV decoding and sample save/reload, bank validation, engine filters and compact/landscape layouts.
- `node tools/verify-v4.cjs`: shared studio controls, solo, MIDI bend isolation, XY, Undo/Redo, A/B, named save/reload, bank restore and four viewport sizes.
- `node tools/verify-device-v5.cjs`: all 11 engines through the MIDI controller in the native WebView, source disconnect, multipart/background audio, native sample bridge and layout. This injects MIDI bytes into the WebView, not through an attached USB device.
- Device utilities use Android ADB at `127.0.0.1:5555`; `tools/device-eval.cjs` evaluates code in the debug WebView.

Earlier versioned UI scripts target their original controls. External USB hardware,
end-to-end input-to-speaker latency and long-duration thermal behavior require
separate hardware testing.

Web Audio reference: https://webaudio.github.io/web-audio-api/
Lucide icons and vendored AOSP MIDI byte framer licenses are listed in
`THIRD_PARTY_NOTICES.md`.

V5 was built and installed on the connected Android device. Device verification
passed at 48 kHz; Web Audio reported 5.33 ms baseLatency (not input-to-speaker latency).
Native document-provider file roundtrips and USB hardware were not exercised.
Regenerate the original built-in PCM assets with `python3 tools/generate-samples.py`.
