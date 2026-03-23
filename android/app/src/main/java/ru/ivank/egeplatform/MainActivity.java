package ru.ivank.egeplatform;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RuStorePushPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
