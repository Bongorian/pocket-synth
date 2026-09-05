package android.media.midi;
import java.io.IOException;
// Host-side adapter for exercising the vendored framer without Android hardware.
public abstract class MidiReceiver {
    public void send(byte[] data, int offset, int count, long timestamp) throws IOException { onSend(data, offset, count, timestamp); }
    public abstract void onSend(byte[] data, int offset, int count, long timestamp) throws IOException;
}
