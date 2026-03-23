package ru.ivank.egeplatform;

import java.util.List;

import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException;
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage;
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService;

public class RuStorePushMessagingService extends RuStoreMessagingService {
    @Override
    public void onNewToken(String token) {
        RuStorePushPlugin.persistToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        if (message == null) {
            return;
        }
        if (message.getData() != null && !message.getData().isEmpty()) {
            RuStorePushPlugin.persistLastMessage(this, message.getData());
        }
    }

    @Override
    public void onDeletedMessages() {
        // No-op: app syncs state on next launch.
    }

    @Override
    public void onError(List<? extends RuStorePushClientException> errors) {
        RuStorePushPlugin.persistLastError(this, errors == null ? "" : errors.toString());
    }
}
