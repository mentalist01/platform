package ru.ivank.egeplatform;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Map;

import ru.rustore.sdk.pushclient.RuStorePushClient;

@CapacitorPlugin(
    name = "RuStorePush",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class RuStorePushPlugin extends Plugin {
    private static final String PREFS_NAME = "rustore_push_prefs";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_LAST_ERROR = "last_error";
    private static final String KEY_LAST_MESSAGE = "last_message";
    private static final String KEY_LAUNCH_URL = "launch_url";

    @PluginMethod
    public void getStatus(PluginCall call) {
        final Context context = getContext();
        final JSObject payload = new JSObject();
        final String token = readStoredToken(context);
        final String projectId = getConfiguredProjectId(context);

        payload.put("supported", true);
        payload.put("configured", !projectId.isEmpty());
        payload.put("permission", getNotificationPermissionState());
        payload.put("token", token);
        payload.put("lastError", readString(context, KEY_LAST_ERROR));
        payload.put("messageData", readJsonObject(context, KEY_LAST_MESSAGE));
        payload.put("launchUrl", readString(context, KEY_LAUNCH_URL));

        if (projectId.isEmpty()) {
            payload.put("available", false);
            payload.put("reason", "Не указан RUSTORE_PUSH_PROJECT_ID для Android-сборки.");
            call.resolve(payload);
            return;
        }

        RuStorePushClient.INSTANCE.checkPushAvailability()
            .addOnSuccessListener(result -> {
                payload.put("available", isAvailabilityResultAvailable(result));
                payload.put("reason", describeAvailabilityResult(result));
                call.resolve(payload);
            })
            .addOnFailureListener(error -> {
                payload.put("available", false);
                payload.put("reason", normalizeThrowableMessage(error, "RuStore Push недоступен на этом устройстве."));
                call.resolve(payload);
            });
    }

    @PluginMethod
    public void consumeLaunchUrl(PluginCall call) {
        final Context context = getContext();
        final String launchUrl = readString(context, KEY_LAUNCH_URL);
        writeString(context, KEY_LAUNCH_URL, "");

        JSObject payload = new JSObject();
        payload.put("url", launchUrl);
        call.resolve(payload);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("permission", "granted");
            call.resolve(result);
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("permission", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("permission", getNotificationPermissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        final Context context = getContext();
        final String projectId = getConfiguredProjectId(context);
        if (projectId.isEmpty()) {
            call.reject("RuStore Push не настроен для этой Android-сборки.");
            return;
        }
        if (!"granted".equals(getNotificationPermissionState())) {
            call.reject("Разрешение на уведомления не выдано.");
            return;
        }

        RuStorePushClient.INSTANCE.checkPushAvailability()
            .addOnSuccessListener(result -> {
                if (!isAvailabilityResultAvailable(result)) {
                    call.reject(describeAvailabilityResult(result));
                    return;
                }
                RuStorePushClient.INSTANCE.getToken()
                    .addOnSuccessListener(token -> {
                        final String normalized = normalizeToken(token);
                        persistToken(context, normalized);
                        JSObject payload = new JSObject();
                        payload.put("token", normalized);
                        payload.put("permission", getNotificationPermissionState());
                        call.resolve(payload);
                    })
                    .addOnFailureListener(error -> call.reject(normalizeThrowableMessage(error, "Не удалось получить RuStore push-токен.")));
            })
            .addOnFailureListener(error -> call.reject(normalizeThrowableMessage(error, "RuStore Push недоступен на этом устройстве.")));
    }

    @PluginMethod
    public void disable(PluginCall call) {
        final Context context = getContext();
        final String previousToken = readStoredToken(context);

        RuStorePushClient.INSTANCE.deleteToken()
            .addOnSuccessListener(result -> {
                persistToken(context, "");
                JSObject payload = new JSObject();
                payload.put("token", "");
                payload.put("previousToken", previousToken);
                call.resolve(payload);
            })
            .addOnFailureListener(error -> {
                persistToken(context, "");
                JSObject payload = new JSObject();
                payload.put("token", "");
                payload.put("previousToken", previousToken);
                payload.put("warning", normalizeThrowableMessage(error, "Не удалось удалить push-токен в RuStore SDK."));
                call.resolve(payload);
            });
    }

    public static String getConfiguredProjectId(@NonNull Context context) {
        return context.getString(R.string.rustore_push_project_id).trim();
    }

    public static String getCustomUrlScheme(@NonNull Context context) {
        return context.getString(R.string.custom_url_scheme).trim();
    }

    public static void persistToken(@NonNull Context context, String token) {
        writeString(context, KEY_TOKEN, normalizeToken(token));
    }

    public static void persistLastError(@NonNull Context context, String message) {
        writeString(context, KEY_LAST_ERROR, String.valueOf(message == null ? "" : message).trim());
    }

    public static void persistLastMessage(@NonNull Context context, Map<String, String> data) {
        JSONObject json = new JSONObject();
        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                try {
                    json.put(String.valueOf(entry.getKey()), String.valueOf(entry.getValue()));
                } catch (JSONException ignored) {
                    // Ignore malformed key/value pairs.
                }
            }
        }
        writeString(context, KEY_LAST_MESSAGE, json.toString());
    }

    public static void persistLaunchUrl(@NonNull Context context, String url) {
        writeString(context, KEY_LAUNCH_URL, String.valueOf(url == null ? "" : url).trim());
    }

    public static void captureIntent(@NonNull Context context, Intent intent) {
        if (intent == null) {
            return;
        }

        final Uri data = intent.getData();
        if (data == null) {
            return;
        }

        final String expectedScheme = getCustomUrlScheme(context);
        final String actualScheme = String.valueOf(data.getScheme() == null ? "" : data.getScheme()).trim();
        if (!expectedScheme.isEmpty() && !expectedScheme.equalsIgnoreCase(actualScheme)) {
            return;
        }

        persistLaunchUrl(context, data.toString());
    }

    private static String readStoredToken(Context context) {
        return readString(context, KEY_TOKEN);
    }

    private static void writeString(Context context, String key, String value) {
        getPreferences(context).edit().putString(key, value == null ? "" : value).apply();
    }

    private static String readString(Context context, String key) {
        return getPreferences(context).getString(key, "");
    }

    private static JSObject readJsonObject(Context context, String key) {
        String raw = readString(context, key);
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        try {
            JSONObject json = new JSONObject(raw);
            JSObject object = new JSObject();
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String itemKey = keys.next();
                object.put(itemKey, String.valueOf(json.opt(itemKey)));
            }
            return object;
        } catch (JSONException error) {
            return null;
        }
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String getNotificationPermissionState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "granted";
        }
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            ? "granted"
            : "default";
    }

    private boolean isAvailabilityResultAvailable(Object result) {
        return result != null && "Available".equals(result.getClass().getSimpleName());
    }

    private String describeAvailabilityResult(Object result) {
        if (result == null) {
            return "RuStore Push не ответил статусом доступности.";
        }
        if (isAvailabilityResultAvailable(result)) {
            return "";
        }
        try {
            Object cause = result.getClass().getMethod("getCause").invoke(result);
            if (cause == null) {
                return "RuStore Push недоступен на этом устройстве.";
            }
            String message = String.valueOf(cause);
            return message == null || message.trim().isEmpty()
                ? "RuStore Push недоступен на этом устройстве."
                : message.trim();
        } catch (Exception error) {
            return String.valueOf(result).trim();
        }
    }

    private static String normalizeThrowableMessage(Throwable error, String fallback) {
        if (error == null) {
            return fallback;
        }
        String message = String.valueOf(error.getMessage() == null ? "" : error.getMessage()).trim();
        return message.isEmpty() ? fallback : message;
    }

    private static String normalizeToken(String value) {
        String token = String.valueOf(value == null ? "" : value).trim();
        if (token.length() > 4096) {
            token = token.substring(0, 4096);
        }
        return token;
    }
}
