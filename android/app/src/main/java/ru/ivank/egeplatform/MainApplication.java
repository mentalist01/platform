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
            "Основные уведомления",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Push-уведомления приложения");
        manager.createNotificationChannel(channel);
    }
}
