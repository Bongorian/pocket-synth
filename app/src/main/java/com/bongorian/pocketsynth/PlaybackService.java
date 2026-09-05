package com.bongorian.pocketsynth;

import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.IBinder;

public final class PlaybackService extends Service {
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent != null && "STOP".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("midi", "MIDI再生", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, PlaybackService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(1, new Notification.Builder(this, "midi").setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Pocket Synth").setContentText("MIDI受信中").setContentIntent(open)
            .setOngoing(true).addAction(new Notification.Action.Builder(null, "停止", stop).build()).build());
        SynthRuntime runtime = SynthRuntime.get(this);
        runtime.requestFocus(); runtime.web.onResume(); runtime.midi.setEnabled(true);
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() {
        SynthRuntime runtime = SynthRuntime.current();
        if (runtime != null) {
            runtime.midi.setEnabled(false);
            if (!runtime.foreground) { runtime.abandonFocus(); runtime.web.onPause(); }
            if (!runtime.attached) runtime.destroy();
        }
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
