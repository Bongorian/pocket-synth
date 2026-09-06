package com.bongorian.pocketsynth;

import android.content.Context;
import android.content.Intent;
import android.content.MutableContextWrapper;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;

final class SynthRuntime {
    private static volatile SynthRuntime instance;
    static SynthRuntime get(Context c) {
        if (instance == null) instance = new SynthRuntime(c.getApplicationContext());
        return instance;
    }
    static SynthRuntime current() { return instance; }
    final Context app;
    final MutableContextWrapper context;
    final WebView web;
    final Handler handler = new Handler(Looper.getMainLooper());
    final MidiHub midi;
    private final AudioManager audio;
    private final AudioFocusRequest focus;
    boolean foreground, attached, ready, destroyed, focusAllowed = true;
    volatile boolean editing;
    String exportData;

    private SynthRuntime(Context app) {
        this.app = app;
        audio = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setOnAudioFocusChangeListener(change -> {
                focusAllowed = change == AudioManager.AUDIOFOCUS_GAIN;
                if (!focusAllowed) silence();
            }, handler).build();
        context = new MutableContextWrapper(app);
        web = new WebView(context); web.setBackgroundColor(0xff151719);
        web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        if (0 != (app.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) WebView.setWebContentsDebuggingEnabled(true);
        midi = new MidiHub(this);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void enable(boolean enabled) {
                handler.post(() -> {
                    if (enabled) {
                        try { app.startForegroundService(new Intent(app, PlaybackService.class)); }
                        catch (RuntimeException e) { midi.publishError("MIDI開始失敗"); }
                    } else {
                        midi.setEnabled(false); app.stopService(new Intent(app, PlaybackService.class));
                    }
                });
            }
            @JavascriptInterface public void selectSource(String source) { handler.post(() -> midi.select(source)); }
        }, "AndroidMidi");
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void editing(boolean value) { editing = value; }
            @JavascriptInterface public void exportBank(String data) {
                if (data == null || data.length() > 8388608) return;
                handler.post(() -> {
                    if (attached && context.getBaseContext() instanceof MainActivity)
                        ((MainActivity) context.getBaseContext()).exportBank(data);
                });
            }
            @JavascriptInterface public void importSample() {
                handler.post(() -> {
                    if (attached && context.getBaseContext() instanceof MainActivity)
                        ((MainActivity) context.getBaseContext()).importSample();
                });
            }
            @JavascriptInterface public void importBank() {
                handler.post(() -> {
                    if (attached && context.getBaseContext() instanceof MainActivity)
                        ((MainActivity) context.getBaseContext()).importBank();
                });
            }
        }, "AndroidStudio");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) { ready = true; midi.publish(); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                if ("synth.local".equals(request.getUrl().getHost()) && path != null && !path.contains("..")) {
                    if (path.equals("/")) path = "/index.html";
                    String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
                    try { return new WebResourceResponse(mime, "UTF-8", app.getAssets().open(path.substring(1))); }
                    catch (IOException ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
            }
        });
        web.loadUrl("https://synth.local/index.html");
    }
    void js(String script) { if (!destroyed) web.evaluateJavascript(script, null); }
    void silence() { js("window.synthSuspend && window.synthSuspend()"); }
    void requestFocus() { focusAllowed = audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED; }
    void abandonFocus() { audio.abandonAudioFocusRequest(focus); }
    void destroy() { if (destroyed) return; midi.close(); abandonFocus(); destroyed = true; web.destroy(); instance = null; }
}
