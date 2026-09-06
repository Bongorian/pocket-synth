package com.bongorian.pocketsynth;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.media.AudioManager;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private SynthRuntime runtime;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff151719);
        getWindow().setNavigationBarColor(0xff151719);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        runtime = SynthRuntime.get(this);
        runtime.attached = true;
        runtime.context.setBaseContext(this);
        if (runtime.web.getParent() != null) ((ViewGroup) runtime.web.getParent()).removeView(runtime.web);
        setContentView(runtime.web); runtime.web.requestFocus();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        String key = null;
        int code = event.getKeyCode();
        if (code >= KeyEvent.KEYCODE_A && code <= KeyEvent.KEYCODE_Z) key = String.valueOf((char) ('a' + code - KeyEvent.KEYCODE_A));
        else if (code == KeyEvent.KEYCODE_SPACE) key = " ";
        else if (code == KeyEvent.KEYCODE_ESCAPE) key = "Escape";
        if (!runtime.editing && key != null && ("awsedftgyhujkolzx ".contains(key) || key.equals("Escape"))
                && !event.isCtrlPressed() && !event.isAltPressed()) {
            if (event.getAction() == KeyEvent.ACTION_DOWN || event.getAction() == KeyEvent.ACTION_UP) {
                if (event.getRepeatCount() == 0) {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) runtime.requestFocus();
                    runtime.js("window.hardwareKey && window.hardwareKey(" + JSONObject.quote(key)
                        + "," + (event.getAction() == KeyEvent.ACTION_DOWN) + ")");
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
    void exportBank(String data) {
        runtime.exportData = data;
        startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .setType("application/json").addCategory(Intent.CATEGORY_OPENABLE)
            .putExtra(Intent.EXTRA_TITLE, "pocket-synth-bank.json"), 40);
    }
    void importSample() {
        startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE), 42);
    }
    void importBank() {
        startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .setType("*/*").addCategory(Intent.CATEGORY_OPENABLE), 41);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) {
            runtime.exportData = null;
            return;
        }
        try {
            if (request == 40 && runtime.exportData != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    out.write(runtime.exportData.getBytes(StandardCharsets.UTF_8));
                }
                runtime.exportData = null;
                runtime.js("window.studio?.notify('バックアップを書き出しました')");
            } else if (request == 42) {
                final android.net.Uri uri = data.getData();
                new Thread(() -> {
                    try (InputStream in = getContentResolver().openInputStream(uri);
                         ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[4096]; int n;
                        while ((n = in.read(buffer)) != -1) {
                            out.write(buffer, 0, n);
                            if (out.size() > 2097152) throw new java.io.IOException("Too large");
                        }
                        String encoded = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
                        String name = "Imported audio";
                        try (android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                            if (cursor != null && cursor.moveToFirst()) {
                                int column = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                                if (column >= 0) name = cursor.getString(column);
                            }
                        }
                        final String script = "window.synthImportSample(" + JSONObject.quote(encoded) + "," + JSONObject.quote(name) + ")";
                        runtime.handler.post(() -> runtime.js(script));
                    } catch (Exception error) {
                        runtime.handler.post(() -> runtime.js("window.studio?.notify('音声を読み込めません（最大2 MB）')"));
                    }
                }, "PocketSampleImport").start();
            } else if (request == 41) {
                try (InputStream in = getContentResolver().openInputStream(data.getData());
                     ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096];
                    int n;
                    while ((n = in.read(buffer)) != -1) {
                        out.write(buffer, 0, n);
                        if (out.size() > 8388608) throw new java.io.IOException("Too large");
                    }
                    runtime.js("window.studioImport(" + JSONObject.quote(out.toString("UTF-8")) + ")");
                }
            }
        } catch (Exception error) {
            runtime.exportData = null;
            runtime.js("window.studio?.notify('ファイルを処理できませんでした')");
        }
    }
    @Override public void onBackPressed() {
        runtime.web.evaluateJavascript("window.studio?.closeDialog() || false", result -> {
            if (!"true".equals(result)) super.onBackPressed();
        });
    }
    @Override protected void onPause() {
        runtime.foreground = false;
        runtime.js("window.synthSetForeground && window.synthSetForeground(false)");
        if (!runtime.midi.enabled) { runtime.silence(); runtime.web.onPause(); runtime.abandonFocus(); }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); runtime.foreground = true; runtime.web.onResume(); runtime.requestFocus();
        runtime.js("window.synthSetForeground && window.synthSetForeground(true)");
        runtime.midi.publish();
    }
    @Override protected void onDestroy() {
        runtime.attached = false;
        if (runtime.web.getParent() != null) ((ViewGroup) runtime.web.getParent()).removeView(runtime.web);
        runtime.context.setBaseContext(getApplicationContext());
        if (!runtime.midi.enabled) runtime.destroy();
        super.onDestroy();
    }
}
