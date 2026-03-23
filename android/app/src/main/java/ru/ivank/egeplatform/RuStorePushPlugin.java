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
    private static final String MSG_MISSING_PROJECT_ID = "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d RUSTORE_PUSH_PROJECT_ID \u0434\u043b\u044f Android-\u0441\u0431\u043e\u0440\u043a\u0438.";
    private static final String MSG_PUSH_UNAVAILABLE = "RuStore Push \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u043d\u0430 \u044d\u0442\u043e\u043c Android-\u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435.";
    private static final String MSG_PUSH_NOT_CONFIGURED = "RuStore Push \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d \u0434\u043b\u044f \u044d\u0442\u043e\u0439 Android-\u0441\u0431\u043e\u0440\u043a\u0438.";
    private static final String MSG_PERMISSION_NOT_GRANTED = "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u043d\u0430 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043d\u0435 \u0432\u044b\u0434\u0430\u043d\u043e.";
    private static final String MSG_TOKEN_FETCH_FAILED = "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c RuStore push-\u0442\u043e\u043a\u0435\u043d.";
    private static final String MSG_TOKEN_DELETE_FAILED = "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c push-\u0442\u043e\u043a\u0435\u043d \u0432 RuStore SDK.";
    private static final String MSG_AVAILABILITY_EMPTY = "RuStore Push \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b \u0441\u0442\u0430\u0442\u0443\u0441\u043e\u043c \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0441\u0442\u0438.";

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
            payload.put("reason", MSG_MISSING_PROJECT_ID);
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
                payload.put("reason", normalizeThrowableMessage(error, MSG_PUSH_UNAVAILABLE));
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
            call.reject(MSG_PUSH_NOT_CONFIGURED);
            return;
        }
        if (!"granted".equals(getNotificationPermissionState())) {
            call.reject(MSG_PERMISSION_NOT_GRANTED);
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
                    .addOnFailureListener(error -> call.reject(normalizeThrowableMessage(error, MSG_TOKEN_FETCH_FAILED)));
            })
            .addOnFailureListener(error -> call.reject(normalizeThrowableMessage(error, MSG_PUSH_UNAVAILABLE)));
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
                payload.put("warning", normalizeThrowableMessage(error, MSG_TOKEN_DELETE_FAILED));
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
            return MSG_AVAILABILITY_EMPTY;
        }
        if (isAvailabilityResultAvailable(result)) {
            return "";
        }
        try {
            Object cause = result.getClass().getMethod("getCause").invoke(result);
            if (cause == null) {
                return MSG_PUSH_UNAVAILABLE;
            }
            String message = String.valueOf(cause);
            return message == null || message.trim().isEmpty()
                ? MSG_PUSH_UNAVAILABLE
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
