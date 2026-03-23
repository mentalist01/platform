package ru.ivank.egeplatform;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RuStorePushPlugin.class);
        super.onCreate(savedInstanceState);
        RuStorePushPlugin.captureIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        RuStorePushPlugin.captureIntent(this, intent);
    }
}
