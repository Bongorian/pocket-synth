package com.bongorian.pocketsynth;

import android.media.midi.MidiDeviceService;
import android.media.midi.MidiReceiver;
import java.io.IOException;
import com.bongorian.pocketsynth.midi.MidiFramer;

public final class SynthMidiService extends MidiDeviceService {
    private final MidiFramer framer = new MidiFramer(new MidiReceiver() {
        @Override public void onSend(byte[] data, int offset, int count, long timestamp) {
            SynthRuntime runtime = SynthRuntime.current();
            if (runtime != null) runtime.midi.message("app", data, offset, count);
        }
    });
    private final MidiReceiver receiver = new MidiReceiver() {
        @Override public synchronized void onSend(byte[] data, int offset, int count, long timestamp) throws IOException { framer.send(data, offset, count, timestamp); }
        @Override public void onFlush() { disconnected(); }
    };
    private void disconnected() {
        SynthRuntime runtime = SynthRuntime.current();
        if (runtime != null) runtime.handler.post(() -> runtime.midi.disconnected("app"));
    }
    @Override public MidiReceiver[] onGetInputPortReceivers() { return new MidiReceiver[] { receiver }; }
    @Override public void onDeviceStatusChanged(android.media.midi.MidiDeviceStatus status) {
        if (!status.isInputPortOpen(0)) disconnected();
    }
    @Override public void onDestroy() { disconnected(); super.onDestroy(); }
}
