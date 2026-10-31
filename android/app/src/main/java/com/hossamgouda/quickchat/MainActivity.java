package com.hossamgouda.quickchat;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QCOpenPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
