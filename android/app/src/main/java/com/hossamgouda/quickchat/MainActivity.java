package com.hossamgouda.quickchat;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /* App shortcuts (res/xml/shortcuts.xml) deliver a "qcnav" extra naming the
       tab to open. Surface it as a quickchat://nav/<tab> data URI so the web
       layer picks it up via the App plugin (getLaunchUrl / appUrlOpen). */
    private static void exposeNav(Intent i) {
        if (i == null) return;
        String nav = i.getStringExtra("qcnav");
        if (nav != null && !nav.isEmpty()) i.setData(Uri.parse("quickchat://nav/" + nav));
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QCOpenPlugin.class);
        registerPlugin(QCContactsPlugin.class);
        exposeNav(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        exposeNav(intent);
        super.onNewIntent(intent);
    }
}
