package com.smuve.smuve2;

/**
 * Carries captured frames and game audio from ScreenCaptureService to
 * ScreenCapturePlugin.
 *
 * The service runs on its own, with no bound client, and the plugin is the only
 * thing that can talk to the WebView, so the two meet here instead of through a
 * ServiceConnection.
 */
final class ScreenCaptureHub {
    interface Listener {
        void onFrame(String base64Jpeg);

        void onAudio(String base64Pcm);

        void onEnded();
    }

    private static Listener listener;
    private static int width;
    private static int height;

    private ScreenCaptureHub() {}

    static synchronized void attach(Listener target) {
        listener = target;
    }

    static synchronized void detach(Listener target) {
        if (listener == target) listener = null;
    }

    static synchronized void describe(int capturedWidth, int capturedHeight) {
        width = capturedWidth;
        height = capturedHeight;
    }

    static synchronized int width() {
        return width;
    }

    static synchronized int height() {
        return height;
    }

    static synchronized void publishFrame(String base64Jpeg) {
        if (listener != null) listener.onFrame(base64Jpeg);
    }

    static synchronized void publishAudio(String base64Pcm) {
        if (listener != null) listener.onAudio(base64Pcm);
    }

    static synchronized void publishEnded() {
        if (listener != null) listener.onEnded();
    }
}
