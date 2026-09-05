import android.media.midi.MidiReceiver;
import com.bongorian.pocketsynth.midi.MidiFramer;
import java.util.*;
public class FramerTest {
    public static void main(String[] args) throws Exception {
        List<String> out = new ArrayList<>();
        MidiFramer f = new MidiFramer(new MidiReceiver() {
            @Override public void onSend(byte[] d, int offset, int count, long timestamp) {
                StringJoiner s = new StringJoiner(",");
                for (int i=0;i<count;i++) s.add(Integer.toString(d[offset+i]&255));
                out.add(s.toString());
            }
        });
        f.send(new byte[]{(byte)0x90,60},0,2,0);
        f.send(new byte[]{100,64,(byte)0xf8,110,60,0},0,6,0);
        f.send(new byte[]{(byte)0x80,64,0,(byte)0xc1,3,(byte)0xe1,0,64},0,8,0);
        List<String> expected = Arrays.asList("144,60,100","248","144,64,110","144,60,0","128,64,0","193,3","225,0,64");
        if (!expected.equals(out)) throw new AssertionError(out.toString());
        System.out.println("PASS: packet splits, running status, interleaved clock, note off, program change, pitch bend");
    }
}
