package com.smuve.smuve2;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiInputPort;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Native Android bridge for USB/Bluetooth MIDI and Studio capture lifetime.
 *
 * Web MIDI is unavailable in most Android WebViews, so this plugin exposes the
 * platform MIDI API directly. Incoming bytes are forwarded on the same
 * `midiMessage` event shape the web layer already handles.
 */
@CapacitorPlugin(name = "StudioNative")
public class StudioNativePlugin extends Plugin {
    private MidiManager midiManager;
    private final Map<String, OpenedOutput> outputs = new HashMap<>();
    private final Map<String, OpenedInput> inputs = new HashMap<>();

    @Override
    public void load() {
        midiManager = (MidiManager) getContext().getSystemService(Context.MIDI_SERVICE);
    }

    @PluginMethod
    public void listMidiDevices(PluginCall call) {
        if (midiManager == null) {
            call.reject("Android MIDI is unavailable on this device.");
            return;
        }
        JSArray devices = new JSArray();
        for (MidiDeviceInfo info : midiManager.getDevices()) {
            JSObject device = new JSObject();
            device.put("id", String.valueOf(info.getId()));
            device.put("name", info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME));
            device.put("manufacturer", info.getProperties().getString(MidiDeviceInfo.PROPERTY_MANUFACTURER));
            JSArray sendPorts = new JSArray();
            JSArray receivePorts = new JSArray();
            for (MidiDeviceInfo.PortInfo port : info.getPorts()) {
                if (port.getType() == MidiDeviceInfo.PortInfo.TYPE_INPUT) {
                    sendPorts.put(port.getPortNumber());
                } else if (port.getType() == MidiDeviceInfo.PortInfo.TYPE_OUTPUT) {
                    receivePorts.put(port.getPortNumber());
                }
            }
            device.put("sendPorts", sendPorts);
            device.put("receivePorts", receivePorts);
            devices.put(device);
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    /**
     * Open a device's Android output port so the host receives its MIDI.
     * The JS name is `openSource` because, from the app's point of view, it is
     * opening a controller/input source.
     */
    @PluginMethod
    public void openSource(PluginCall call) {
        String deviceId = call.getString("deviceId");
        Integer portNumber = call.getInt("portNumber");
        if (midiManager == null || deviceId == null || portNumber == null) {
            call.reject("A MIDI device and output port are required.");
            return;
        }
        String key = deviceId + ":" + portNumber;
        if (outputs.containsKey(key)) {
            call.resolve();
            return;
        }
        MidiDeviceInfo info = findDevice(deviceId);
        if (info == null) {
            call.reject("That MIDI device is no longer connected.");
            return;
        }
        midiManager.openDevice(info, device -> {
            if (device == null) {
                call.reject("Android could not open that MIDI device.");
                return;
            }
            MidiOutputPort port = device.openOutputPort(portNumber);
            if (port == null) {
                closeQuietly(device);
                call.reject("That MIDI output port is unavailable.");
                return;
            }
            port.connect(new MidiReceiver() {
                @Override
                public void onSend(byte[] msg, int offset, int count, long timestamp) {
                    if (count <= 0) return;
                    JSArray data = new JSArray();
                    for (int i = offset; i < offset + count; i++) {
                        data.put(msg[i] & 0xff);
                    }
                    JSObject event = new JSObject();
                    event.put("deviceId", deviceId);
                    event.put("portNumber", portNumber);
                    event.put("data", data);
                    event.put("timestamp", timestamp);
                    getBridge().executeOnMainThread(() -> notifyListeners("midiMessage", event));
                }
            });
            outputs.put(key, new OpenedOutput(device, port));
            call.resolve();
        }, new Handler(Looper.getMainLooper()));
    }

    /** Send bytes to a device's Android input port (host → synth). */
    @PluginMethod
    public void sendMidi(PluginCall call) {
        String deviceId = call.getString("deviceId");
        Integer portNumber = call.getInt("portNumber");
        JSArray data = call.getArray("data");
        if (midiManager == null || deviceId == null || portNumber == null || data == null) {
            call.reject("A MIDI device, input port and data bytes are required.");
            return;
        }
        byte[] bytes = new byte[data.length()];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) data.optInt(i, 0);
        }
        String key = deviceId + ":" + portNumber;
        OpenedInput opened = inputs.get(key);
        if (opened != null) {
            sendBytes(opened, bytes, call);
            return;
        }
        MidiDeviceInfo info = findDevice(deviceId);
        if (info == null) {
            call.reject("That MIDI device is no longer connected.");
            return;
        }
        midiManager.openDevice(info, device -> {
            if (device == null) {
                call.reject("Android could not open that MIDI device.");
                return;
            }
            MidiInputPort port = device.openInputPort(portNumber);
            if (port == null) {
                closeQuietly(device);
                call.reject("That MIDI input port is unavailable.");
                return;
            }
            OpenedInput next = new OpenedInput(device, port);
            inputs.put(key, next);
            sendBytes(next, bytes, call);
        }, new Handler(Looper.getMainLooper()));
    }

    private void sendBytes(OpenedInput opened, byte[] bytes, PluginCall call) {
        try {
            opened.port.send(bytes, 0, bytes.length, System.nanoTime());
            call.resolve();
        } catch (IOException error) {
            call.reject("MIDI send failed: " + error.getMessage());
        }
    }

    @PluginMethod
    public void closeMidi(PluginCall call) {
        closeAllMidi();
        call.resolve();
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECORD_AUDIO
        ) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Microphone permission is required before starting capture.");
            return;
        }
        Intent intent = new Intent(getContext(), StudioCaptureService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        getContext().stopService(new Intent(getContext(), StudioCaptureService.class));
        call.resolve();
    }

    private MidiDeviceInfo findDevice(String id) {
        for (MidiDeviceInfo info : midiManager.getDevices()) {
            if (String.valueOf(info.getId()).equals(id)) return info;
        }
        return null;
    }

    private void closeAllMidi() {
        for (OpenedOutput output : outputs.values()) {
            try {
                output.port.close();
            } catch (IOException ignored) {
            }
            closeQuietly(output.device);
        }
        outputs.clear();
        for (OpenedInput input : inputs.values()) {
            try {
                input.port.close();
            } catch (IOException ignored) {
            }
            closeQuietly(input.device);
        }
        inputs.clear();
    }

    private static void closeQuietly(MidiDevice device) {
        try {
            device.close();
        } catch (IOException ignored) {
        }
    }

    @Override
    protected void handleOnDestroy() {
        closeAllMidi();
        super.handleOnDestroy();
    }

    private static final class OpenedOutput {
        final MidiDevice device;
        final MidiOutputPort port;

        OpenedOutput(MidiDevice device, MidiOutputPort port) {
            this.device = device;
            this.port = port;
        }
    }

    private static final class OpenedInput {
        final MidiDevice device;
        final MidiInputPort port;

        OpenedInput(MidiDevice device, MidiInputPort port) {
            this.device = device;
            this.port = port;
        }
    }
}
