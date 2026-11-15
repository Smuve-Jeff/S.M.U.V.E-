package com.smuve.smuve2;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * Screen capture for S.M.U.V.E Live on Android.
 *
 * Android's WebView has no `getDisplayMedia`, so a host could never broadcast a
 * game from the app. This foreground service owns the MediaProjection grant,
 * mirrors the display into an ImageReader and hands JPEG frames to
 * ScreenCaptureHub, whose listener in the plugin pushes them into the page
 * where a canvas turns them into a real video track.
 *
 * The frames are re-encoded at a capped size and rate because they cross the
 * JS bridge: this is a watch-me-play feed, not a lossless mirror.
 *
 * Game sound rides the same projection through AudioPlaybackCapture: the app's
 * own playback is read as PCM, sent on the bridge and rebuilt into a WebAudio
 * track on the other side, which rides as the broadcast's system-audio slot.
 * Audio playback capture is API 29+, and it silently yields nothing when the
 * app is not playing anything, so the page treats an empty track as the normal
 * "no game audio" case.
 *
 * Android 14 requires the projection to be held by a running foreground
 * service declared with the `mediaProjection` type, started before
 * getMediaProjection() is called; the consent result arrives with the start
 * intent for exactly that reason.
 */
public class ScreenCaptureService extends Service {
    static final String EXTRA_RESULT_CODE = "smuveResultCode";
    static final String EXTRA_RESULT_DATA = "smuveResultData";
    static final String CHANNEL_ID = "smuve_live_capture";
    static final int NOTIFICATION_ID = 4312;

    /** Long edge of the captured surface; the stream itself is re-scaled by WebRTC. */
    private static final int MAX_LONG_EDGE = 1280;
    /** ~9 fps: the bridge serialises every frame as base64. */
    private static final long MIN_FRAME_INTERVAL_MS = 110L;
    private static final int JPEG_QUALITY = 55;
    /** Mono 24 kHz: Opus downgrades to mono anyway, and this keeps the bridge small. */
    private static final int AUDIO_SAMPLE_RATE = 24_000;
    /** ~100 ms of PCM16 mono per bridge message. */
    private static final int AUDIO_CHUNK_BYTES = AUDIO_SAMPLE_RATE / 10 * 2;

    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader reader;
    private HandlerThread worker;
    private Handler workerHandler;
    private long lastFrameAt;
    private AudioRecord audioRecord;
    private Thread audioThread;
    private volatile boolean capturingAudio;

    @Nullable
    private static volatile Boolean running;

    static boolean isRunning() {
        return Boolean.TRUE.equals(running);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = Boolean.TRUE;
        if (!promoteToForeground()) {
            shutdown();
            return START_NOT_STICKY;
        }
        if (intent == null) {
            shutdown();
            return START_NOT_STICKY;
        }
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        if (resultCode != Activity.RESULT_OK || resultData == null) {
            shutdown();
            return START_NOT_STICKY;
        }
        startCapture(resultCode, resultData);
        return START_NOT_STICKY;
    }

    private boolean promoteToForeground() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("S.M.U.V.E. Live is sharing your screen")
            .setContentText("Viewers receive the game you are playing.")
            .setContentIntent(openApp())
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (RuntimeException denied) {
            // Missing consent, a denied notification, or a background start the
            // platform refuses: report it instead of leaving the host waiting.
            ScreenCaptureHub.publishEnded();
            return false;
        }
    }

    private void startCapture(int resultCode, Intent resultData) {
        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            ScreenCaptureHub.publishEnded();
            shutdown();
            return;
        }
        try {
            projection = manager.getMediaProjection(resultCode, resultData);
        } catch (RuntimeException refused) {
            ScreenCaptureHub.publishEnded();
            shutdown();
            return;
        }
        if (projection == null) {
            ScreenCaptureHub.publishEnded();
            shutdown();
            return;
        }

        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null || windowManager.getDefaultDisplay() == null) {
            ScreenCaptureHub.publishEnded();
            shutdown();
            return;
        }
        windowManager.getDefaultDisplay().getRealMetrics(metrics);
        int width = metrics.widthPixels;
        int height = metrics.heightPixels;
        int longEdge = Math.max(width, height);
        if (longEdge > MAX_LONG_EDGE) {
            double scale = (double) MAX_LONG_EDGE / (double) longEdge;
            width = Math.max(2, (int) Math.round(width * scale));
            height = Math.max(2, (int) Math.round(height * scale));
        }
        width -= width % 2;
        height -= height % 2;

        worker = new HandlerThread("smuve-live-capture");
        worker.start();
        workerHandler = new Handler(worker.getLooper());

        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        reader.setOnImageAvailableListener(this::onImageAvailable, workerHandler);
        ScreenCaptureHub.describe(width, height);

        projectionCallback = new MediaProjection.Callback() {
            @Override
            public void onStop() {
                // The host tapped the system "Stop sharing" control.
                ScreenCaptureHub.publishEnded();
                shutdown();
            }
        };
        projection.registerCallback(projectionCallback, workerHandler);
        virtualDisplay = projection.createVirtualDisplay(
            "smuve-live",
            width,
            height,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.getSurface(),
            null,
            workerHandler
        );
        startAudioCapture();
    }

    private void onImageAvailable(ImageReader source) {
        Image image;
        try {
            image = source.acquireLatestImage();
        } catch (IllegalStateException closed) {
            return;
        }
        if (image == null) return;
        long now = System.currentTimeMillis();
        if (now - lastFrameAt < MIN_FRAME_INTERVAL_MS) {
            image.close();
            return;
        }
        lastFrameAt = now;
        try {
            Image.Plane plane = image.getPlanes()[0];
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            // The reader pads rows; copy into a padded bitmap and crop, or the
            // picture arrives skewed by that padding.
            int rowPadding = rowStride - pixelStride * image.getWidth();
            int paddedWidth = image.getWidth() + rowPadding / pixelStride;
            ByteBuffer buffer = plane.getBuffer();
            buffer.rewind();
            Bitmap padded = Bitmap.createBitmap(paddedWidth, image.getHeight(), Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buffer);
            Bitmap frame = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
            padded.recycle();

            ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
            frame.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpeg);
            frame.recycle();
            ScreenCaptureHub.publishFrame(Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP));
        } catch (RuntimeException dropped) {
            // A single malformed frame must never kill the share.
        } finally {
            image.close();
        }
    }


    /**
     * Reads the app's own playback as PCM. AudioPlaybackCapture needs both a
     * MediaProjection and RECORD_AUDIO, and is unavailable before API 29 — in
     * every one of those cases the share simply goes out with video and mic.
     */
    private void startAudioCapture() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        if (projection == null) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            AudioPlaybackCaptureConfiguration capture =
                    new AudioPlaybackCaptureConfiguration.Builder(projection)
                            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                            .addMatchingUsage(AudioAttributes.USAGE_GAME)
                            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                            .build();
            AudioFormat format = new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(AUDIO_SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build();
            int minimum = AudioRecord.getMinBufferSize(
                    AUDIO_SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT);
            audioRecord = new AudioRecord.Builder()
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(Math.max(minimum, AUDIO_CHUNK_BYTES * 4))
                    .setAudioPlaybackCaptureConfig(capture)
                    .build();
            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                releaseAudio();
                return;
            }
            capturingAudio = true;
            audioRecord.startRecording();
            audioThread = new Thread(this::pumpAudio, "smuve-live-audio");
            audioThread.start();
        } catch (RuntimeException unsupported) {
            // A device or ROM without playback capture still gets the video.
            releaseAudio();
        }
    }

    private void pumpAudio() {
        byte[] buffer = new byte[AUDIO_CHUNK_BYTES];
        while (capturingAudio) {
            AudioRecord record = audioRecord;
            if (record == null) break;
            int read;
            try {
                read = record.read(buffer, 0, buffer.length);
            } catch (RuntimeException stopped) {
                break;
            }
            if (read <= 0) continue;
            byte[] chunk = read == buffer.length ? buffer : Arrays.copyOf(buffer, read);
            ScreenCaptureHub.publishAudio(
                    Base64.encodeToString(chunk, Base64.NO_WRAP));
        }
    }

    private void releaseAudio() {
        capturingAudio = false;
        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (RuntimeException alreadyStopped) {
                // Not recording any more.
            }
            audioRecord.release();
            audioRecord = null;
        }
        if (audioThread != null) {
            audioThread.interrupt();
            audioThread = null;
        }
    }

    private void shutdown() {
        running = Boolean.FALSE;
        releaseAudio();
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (reader != null) {
            reader.setOnImageAvailableListener(null, null);
            reader.close();
            reader = null;
        }
        if (projection != null) {
            if (projectionCallback != null) {
                projection.unregisterCallback(projectionCallback);
                projectionCallback = null;
            }
            projection.stop();
            projection = null;
        }
        if (worker != null) {
            worker.quitSafely();
            worker = null;
            workerHandler = null;
        }
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private PendingIntent openApp() {
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Live screen sharing",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows while S.M.U.V.E. Live is broadcasting your screen.");
        manager.createNotificationChannel(channel);
    }
}
