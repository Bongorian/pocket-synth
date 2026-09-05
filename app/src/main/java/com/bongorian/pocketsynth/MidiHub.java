package com.bongorian.pocketsynth;

import android.content.Context;
import android.media.midi.*;
import java.io.IOException;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;
import com.bongorian.pocketsynth.midi.MidiFramer;

final class MidiHub {
    private final SynthRuntime runtime;
    private final MidiManager manager;
    volatile boolean enabled;
    private String selected = "auto";
    private int generation;
    private final Map<String, Connection> connections = new HashMap<>();
    private final Set<String> pending = new HashSet<>();
    private final ArrayList<JSONArray> queue = new ArrayList<>();
    private boolean scheduled;
    private final MidiManager.DeviceCallback callback = new MidiManager.DeviceCallback() {
        @Override public void onDeviceAdded(MidiDeviceInfo info) { refresh(); }
        @Override public void onDeviceRemoved(MidiDeviceInfo info) {
            for (String key : new ArrayList<>(connections.keySet())) if (key.startsWith(info.getId() + ":")) closeConnection(key);
            refresh();
        }
    };
    MidiHub(SynthRuntime runtime) {
        this.runtime = runtime;
        manager = (MidiManager) runtime.app.getSystemService(Context.MIDI_SERVICE);
        if (manager != null) manager.registerDeviceCallback(callback, runtime.handler);
    }
    void setEnabled(boolean value) {
        enabled = value; generation++; pending.clear();
        synchronized (queue) { queue.clear(); }
        if (!value) {
            for (String key : new ArrayList<>(connections.keySet())) closeConnection(key);
            runtime.silence();
        }
        refresh();
    }
    void select(String source) {
        selected = source; generation++; pending.clear();
        for (String key : new ArrayList<>(connections.keySet())) closeConnection(key);
        refresh();
    }
    void refresh() {
        if (enabled && manager != null) for (MidiDeviceInfo info : manager.getDevices()) {
            for (MidiDeviceInfo.PortInfo port : info.getPorts()) {
                if (port.getType() != MidiDeviceInfo.PortInfo.TYPE_OUTPUT) continue;
                String key = info.getId() + ":" + port.getPortNumber();
                if (selected.equals(key) || (selected.equals("auto") && info.getType() == MidiDeviceInfo.TYPE_USB)) open(info, port, key);
            }
        }
        publish();
    }
    private void open(MidiDeviceInfo info, MidiDeviceInfo.PortInfo port, String key) {
        if (connections.containsKey(key) || pending.contains(key)) return;
        pending.add(key); final int token = generation;
        manager.openDevice(info, device -> {
            if (token == generation) pending.remove(key);
            if (device == null) { publishError("MIDI接続失敗"); return; }
            boolean exists = false;
            for (MidiDeviceInfo current : manager.getDevices()) if (current.getId() == info.getId()) exists = true;
            if (!enabled || token != generation || !exists) { try { device.close(); } catch (IOException ignored) {} return; }
            MidiOutputPort output = device.openOutputPort(port.getPortNumber());
            if (output == null) { try { device.close(); } catch (IOException ignored) {} publishError("ポート使用中"); return; }
            MidiFramer framer = new MidiFramer(new MidiReceiver() {
                @Override public void onSend(byte[] data, int offset, int count, long timestamp) { message(key, data, offset, count); }
            });
            output.connect(framer); connections.put(key, new Connection(device, output)); publish();
        }, runtime.handler);
    }
    void message(String source, byte[] data, int offset, int count) {
        if (!enabled || count == 0) return;
        int status = data[offset] & 255;
        if (status < 128 || (status >= 240 && status != 255)) return;
        JSONArray event = new JSONArray().put(source).put(status).put(count > 1 ? data[offset + 1] & 127 : 0).put(count > 2 ? data[offset + 2] & 127 : 0);
        synchronized (queue) {
            if (queue.size() >= 2048) { queue.clear(); queue.add(new JSONArray().put(source).put(255).put(0).put(0)); }
            else queue.add(event);
            if (scheduled) return;
            scheduled = true;
        }
        runtime.handler.post(() -> {
            JSONArray batch;
            synchronized (queue) { batch = new JSONArray(queue); queue.clear(); scheduled = false; }
            if (enabled && runtime.ready && runtime.focusAllowed) runtime.js("window.receiveMidi(" + batch + ")");
        });
    }
    void disconnected(String source) { runtime.js("window.midiDisconnected && window.midiDisconnected(" + JSONObject.quote(source) + ")"); }
    private void closeConnection(String key) {
        Connection c = connections.remove(key);
        if (c != null) { try { c.port.close(); c.device.close(); } catch (IOException ignored) {} }
        disconnected(key);
    }
    void publish() {
        if (!runtime.ready) return;
        JSONArray ports = new JSONArray();
        if (manager != null) for (MidiDeviceInfo info : manager.getDevices()) for (MidiDeviceInfo.PortInfo p : info.getPorts()) {
            if (p.getType() != MidiDeviceInfo.PortInfo.TYPE_OUTPUT) continue;
            String name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME, "MIDI " + info.getId());
            try { ports.put(new JSONObject().put("id", info.getId() + ":" + p.getPortNumber()).put("name", name + " / " + p.getName())); }
            catch (org.json.JSONException ignored) { }
        }
        runtime.js("window.midiNativeState(" + enabled + "," + ports + "," + JSONObject.quote("App In + " + connections.size() + " device ports") + ")");
    }
    void publishError(String error) { runtime.js("window.midiNativeState(" + enabled + ",null," + JSONObject.quote(error) + ")"); }
    void close() {
        enabled = false; generation++;
        if (manager != null) manager.unregisterDeviceCallback(callback);
        for (String key : new ArrayList<>(connections.keySet())) closeConnection(key);
    }
    private static final class Connection {
        final MidiDevice device; final MidiOutputPort port;
        Connection(MidiDevice d, MidiOutputPort p) { device = d; port = p; }
    }
}
