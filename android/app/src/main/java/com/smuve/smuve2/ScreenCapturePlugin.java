package com.smuve.smuve2;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native screen capture for S.M.U.V.E Live.
 *
 * `getDisplayMedia` does not exist in the Android WebView, so this plugin asks
 * for a MediaProjection grant, hands it to ScreenCaptureService and forwards
 * the service's JPEG frames to the page as `frame` events. The web layer turns
 * those into a video track through a canvas, which the normal host pipeline
 * then publishes like any other screen share.
 *
 * Game audio arrives the same way as `audio` events (PCM16 mono 24 kHz) and is
 * rebuilt into a WebAudio track that rides the broadcast's system-audio slot.
 *
 * Lifecycle: the consent prompt is a system dialog, so `start()` resolves only
 * after the host approves; a denial rejects with SCREEN_CAPTURE_DENIED so the
 * UI can say why nothing changed.
 */
@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin implements ScreenCaptureHub.Listener {

    @Override
    public void load() {
        ScreenCaptureHub.attach(this);
    }

    @Override
    protected void handleOnDestroy() {
        ScreenCaptureHub.detach(this);
        stopCapture();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        MediaProjectionManager manager =
                (MediaProjectionManager) context.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("SCREEN_CAPTURE_UNAVAILABLE");
            return;
        }
        if (ScreenCaptureService.isRunning()) {
            JSObject already = new JSObject();
            already.put("width", ScreenCaptureHub.width());
            already.put("height", ScreenCaptureHub.height());
            call.resolve(already);
            return;
        }
        try {
            Intent consent = manager.createScreenCaptureIntent();
            startActivityForResult(call, consent, "captureResult");
        } catch (RuntimeException refused) {
            call.reject("SCREEN_CAPTURE_UNAVAILABLE");
        }
    }

    @ActivityCallback
    @SuppressWarnings("unused")
    private void captureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null
                || result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("SCREEN_CAPTURE_DENIED");
            return;
        }
        Intent resultData = result.getData();
        Intent service = new Intent(getContext(), ScreenCaptureService.class);
        service.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        service.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, resultData);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(service);
        } else {
            getContext().startService(service);
        }
        JSObject started = new JSObject();
        started.put("width", ScreenCaptureHub.width());
        started.put("height", ScreenCaptureHub.height());
        call.resolve(started);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopCapture();
        call.resolve();
    }

    private void stopCapture() {
        try {
            getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
        } catch (RuntimeException ignored) {
            // The service is already gone.
        }
    }

    @Override
    public void onFrame(String base64Jpeg) {
        if (getBridge() == null) return;
        final JSObject payload = new JSObject();
        payload.put("data", base64Jpeg);
        payload.put("width", ScreenCaptureHub.width());
        payload.put("height", ScreenCaptureHub.height());
        // Frames are produced on the capture thread; the bridge is not.
        getBridge().executeOnMainThread(() -> notifyListeners("frame", payload));
    }

    @Override
    public void onAudio(String base64Pcm) {
        if (getBridge() == null) return;
        final JSObject payload = new JSObject();
        payload.put("data", base64Pcm);
        payload.put("sampleRate", 24_000);
        payload.put("channels", 1);
        getBridge().executeOnMainThread(() -> notifyListeners("audio", payload));
    }

    @Override
    public void onEnded() {
        if (getBridge() == null) return;
        getBridge().executeOnMainThread(() -> notifyListeners("ended", new JSObject()));
    }
}
