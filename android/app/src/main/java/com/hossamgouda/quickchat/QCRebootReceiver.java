package com.hossamgouda.quickchat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Re-post a reminder after the phone reboots.
 *
 * Capacitor's LocalNotifications schedule OS alarms, and Android wipes all
 * scheduled alarms on reboot. The app stores its follow-ups in the WebView's
 * IndexedDB, which native code cannot read, so instead of guessing we post one
 * heads-up notification telling the user to open QuickChat — the app's own
 * boot sequence (initNotify -> capSchedule) then re-creates every reminder.
 */
public class QCRebootReceiver extends BroadcastReceiver {

    private static final String CH = "followups";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            nm.createNotificationChannel(new NotificationChannel(CH, "Follow-ups", NotificationManager.IMPORTANCE_HIGH));
            int icon = ctx.getResources().getIdentifier("ic_stat_notify", "drawable", ctx.getPackageName());
            if (icon == 0) icon = ctx.getApplicationInfo().icon;
            Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            PendingIntent pi = open == null ? null : PendingIntent.getActivity(
                    ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = new Notification.Builder(ctx, CH)
                    .setSmallIcon(icon)
                    .setContentTitle("QuickChat")
                    .setContentText(ctx.getString(R.string.app_name) + " — " +
                            "open QuickChat to refresh your follow-up reminders")
                    .setAutoCancel(true);
            if (pi != null) b.setContentIntent(pi);
            nm.notify(424243, b.build());
        } catch (Exception ignored) {
            /* A missed boot nudge must never crash the boot path. */
        }
    }
}
