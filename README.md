# Pocket Synth

Offline Android synthesizer for Titan Slim, with a standalone browser version.
Version 4 provides 16 MIDI parts, 16 shared voices, 39 factory presets and 16
persistent user slots. Engines: subtractive, two-operator FM, morphable wavetable,
additive, ring modulation and three synthesized drum kits. Each part has its own
patch, filter, ADSR, vibrato, drive, delay, level, pan and mute; master volume and
output compression are shared. No network or microphone permission.
Audio uses the browser's native Web Audio nodes.

## Play

- A W S E D F T G Y H U J K O L: chromatic notes from C to D, including sharps.
- Z / X: octave down / up (C1 to C6).
- Space: momentary sustain pedal. Hold: latched sustain.
- Esc or the red square: stop all voices and clear delay.
- Hardware volume buttons: Android media volume.
- Save icon: choose a User 1-16 slot and a sound name; occupied slots show an overwrite action.
- Header Ch selector: choose the part to edit and play with touch/physical keys.
- Parts tab: assign sounds to all 16 channels; edit selected part level/pan and mute any part.
- Touch supports multiple fingers and sliding between keys.

The Android activity forwards physical key down/up directly to the instrument.
Octave changes do not change the pitch of keys already held. Leaving the app,
losing audio focus, or hiding the browser stops sound. Android MIDI mode keeps
MIDI playback alive when changing apps; local touch/keyboard notes still release.
Maximum polyphony also
includes release tails; the oldest released voice is stolen first.

Open `app/src/main/assets/index.html` in a desktop browser, or install the APK.
The first note enables browser audio. The Android build uses a local HTTPS origin
served entirely from bundled assets; it does not run a server.

## Build

Run `./gradlew --offline --no-daemon assembleDebug` with the device's installed
JDK 21, SDK 34, Gradle 8.10.2 and Debian ARM64 AAPT2. Output:
`app/build/outputs/apk/debug/app-debug.apk`.

The debug build uses `~/.config/.android/debug.keystore` when present to preserve
the installed app's signing identity. Override with
`-PpocketDebugKeystore=/path/to/debug.keystore`; no signing key is stored in Git.

References: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
and https://developer.android.com/develop/ui/views/layout/webapps/webview
Icons: Lucide, ISC license, vendored in `app/src/main/assets/icons`.

## Android MIDI

Enable MIDI reception on the MIDI tab first. A mediaPlayback foreground service
retains the synth while another app is in front. Disable reception to stop it.
In Orca-c Android, open F1 > MIDI Output, enable output and choose
`Pocket Synth - MIDI In`. Do not choose the older Orca SF2 Synth port.
USB class-compliant MIDI 1.0 output ports detected by Android are opened
automatically; a port selector also exposes registered device outputs.
Linux/ALSA and BLE scanning are outside this build's scope.

Supported: note on/off (including velocity-zero), velocity, channel selection or
Omni, CC64 sustain, CC7 volume, CC11 expression, pitch bend (default +/-2
semitones), RPN 0 coarse bend range up to 24, CC120, CC121, CC123, system reset.
CC1 controls vibrato depth; CC74 controls cutoff, independently per channel/source.
Optional program change 0-38 selects a factory preset on the message's channel.
The original first 12 program numbers are preserved. Patches and effects are
per channel; assignments, edits and mixer settings persist automatically.
This is not a GM melodic sound bank. No MIDI 2.0 UMP, SysEx patch
loading, MPE, MIDI-clock sync or aftertouch assignment. Incoming MIDI is played
on receipt; future timestamps are not a sample-accurate scheduling contract.

The MIDI byte framer is vendored AOSP code. USB hotplug closes only the removed
source's voices. Virtual port closure stops app-source voices. MIDI-off clears
voices and delay. Existing User 1-4 patches remain readable as Analog patches.

## Drums And New Engines

Ch10 defaults to Electro Kit. Electro Kit, Deep Kit and Dust Kit can be assigned
to any channel. Selecting a kit moves the local keyboard to C2 (MIDI note 36).
Common GM percussion positions: 35/36 kick, 37 rim, 38/40 snare, 39 clap,
42/44 closed/pedal hat, 46 open hat, 41/43/45/47/48/50 toms, 49 crash,
51 ride and 56 cowbell. Other notes use related synthesized percussion or shaker;
this is not a full GM drum sample library. Hats choke within their own part.
Drums are one-shots: Note Off does not truncate them; panic/CC120 stops them.
Drum Tune and Drum Decay shape the kit. Melodic ADSR/sub/detune/vibrato do not
apply to percussion. Filter, drive, delay and mixer controls still apply.

Additive exposes harmonic count, spectral tilt and even-harmonic balance.
Ring Mod exposes carrier/modulator ratio and dry/wet balance for metallic tones.

## Verification

Install the test dependencies with `npm ci --prefix tools`. Browser tests use
Chromium at `/usr/bin/chromium`; device tests use the local Android ADB endpoint
`127.0.0.1:5555`. Run commands from the project root. Generated screenshots and
device-session backups under `verification` are not included in the repository.

`node tools/verify.cjs`: keyboard, sustain, touch, persistence, pitch and layout.
`node tools/verify-v2.cjs`: FM/WT rendered audio, channel isolation, controllers,
RPN, disconnect, patch migration and all responsive tabs.
`node tools/verify-v3.cjs`: all 39 preset renders, additive/ring spectra changes,
drum families, channel-local programs/effects/controllers, voice budget, mute,
hat choke, part persistence, User 16, stereo pan and responsive Parts/drum views.
`node tools/verify-device.cjs`: Android key events and lifecycle, MIDI mode off.
`node tools/verify-device-v3.cjs`: native WebView multipart audio, foreground
service background playback and drum layout; restores the previous part settings.
`tools/verify-orca.cjs`: with Orca Android configured and a one-shot bang below
a MIDI operator, checks app-to-app MIDI, background FM samples and note release.
USB hardware has not been attached for an end-to-end test.
Orca integration was verified for v2; the v3 update does not repeat that test.

## Version 4: Studio And Live Controls

- Fixed keyboard and performance controls with a compact portrait layout and a separate landscape arrangement.
- Sound Library with text search, engine filtering, favorites and previous/next patch buttons.
- Named User 1-16 sounds. Existing v3 sounds and part assignments remain readable.
- Per-part patch Undo/Redo (24 edits, current session) and A/B comparison. Comparing within one engine updates sounding voices; changing engines releases that part.
- LIVE: filter/resonance XY control with logarithmic frequency, plus envelope controls or drum tune/decay.
- Spring-return local pitch bend (+/-2 semitones), modulation and local-note velocity. MIDI input velocity and bend remain independent. Bend/Mod reset on part changes and leaving the app.
- Sixteen touch drum pads for drum patches; physical keys retain their original chromatic mapping.
- Part Solo, one-touch part selection and note activity indicators. Solo is temporary and preserves saved mute settings.
- Native Android document picker for JSON bank export/import. Backups include all 16 parts, user sounds/names, favorites and master volume. Restore validates the bank and asks before replacing data.
- Native keyboard input remains available in search/name dialogs, instead of triggering notes.

The app has no arpeggiator or external clock sync. XY edits the current patch;
it does not override an external MIDI CC74 cutoff value already assigned to a voice.
Solo suppresses new notes on other parts; it does not retrigger held notes when released.
Patch Undo does not undo bank restore or changes to saved user slots.

`node tools/verify-v4.cjs` is the focused v4 check: six engine renders, solo and
performance control isolation, patch browser, XY, undo/redo, A/B, named save/reload,
backup restore/reload, and four viewport layouts including landscape and drum pads.
Earlier UI verification scripts target their original versions' controls.
V4 passed this focused check and was installed over the existing Android app;
native startup confirmed v4, 16 parts, 39 presets and the document bridge at
452x705. External MIDI hardware and Android document-provider roundtrips were
not repeated in this pass.
