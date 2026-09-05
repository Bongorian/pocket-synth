package com.bongorian.pocketsynth;

import android.app.Activity;
import android.os.Bundle;
import android.media.AudioManager;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private SynthRuntime runtime;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff171b19);
        getWindow().setNavigationBarColor(0xff171b19);
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
        if (key != null && ("awsedftgyhujkolzx ".contains(key) || key.equals("Escape"))
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
