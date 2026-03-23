package ru.ivank.egeplatform;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

import ru.rustore.sdk.pushclient.RuStorePushClient;
import ru.rustore.sdk.pushclient.common.logger.DefaultLogger;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        final String projectId = RuStorePushPlugin.getConfiguredProjectId(this);
        if (projectId.isEmpty()) {
            return;
        }

        RuStorePushClient.INSTANCE.init(this, projectId, new DefaultLogger("RuStorePush"));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        final String channelId = getString(R.string.rustore_push_notification_channel_id).trim();
        if (channelId.isEmpty()) {
            return;
        }

        final NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(channelId) != null) {
            return;
        }

        final NotificationChannel channel = new NotificationChannel(
            channelId,
            "\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Push-\u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f");
        manager.createNotificationChannel(channel);
    }
}
