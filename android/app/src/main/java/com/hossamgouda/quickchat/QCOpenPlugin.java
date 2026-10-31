package com.hossamgouda.quickchat;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens intent:// and https:// URLs from the WebView.
 *
 * Capacitor's Bridge.launchIntent() blindly ACTION_VIEWs the raw URL string,
 * so intent:// URIs (needed to target com.whatsapp vs com.whatsapp.w4b) die
 * silently. Intent.parseUri with URI_INTENT_SCHEME reconstructs the real
 * intent — scheme data, target package, and browser_fallback_url extra.
 */
@CapacitorPlugin(name = "QCOpen")
public class QCOpenPlugin extends Plugin {

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent("android.settings.APP_NOTIFICATION_SETTINGS")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra("android.provider.extra.APP_PACKAGE", getActivity().getPackageName());
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        try {
            Intent intent = url.startsWith("intent:")
                    ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("not_found");
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
