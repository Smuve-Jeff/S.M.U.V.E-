export type WavBitDepth = 16 | 24 | 32;
export type WavFormat = 'wav-16' | 'wav-32' | 'wav-32-float';

export class WavEncoder {
  static encode(
    buffer: Float32Array[],
    numChannels: number,
    sampleRate: number
  ): Blob {
    return WavEncoder.encodeInternal(buffer, numChannels, sampleRate, 16, false);
  }

  /**
   * Encode multi-channel audio to WAV with selectable bit depth.
   * Supports 16-bit PCM, 32-bit PCM, and 32-bit float IEEE 754.
   */
  static encodeMultiChannel(
    channels: Float32Array[],
    format: WavFormat,
    sampleRate: number
  ): Blob {
    const numChannels = channels.length;
    switch (format) {
      case 'wav-16':
        return WavEncoder.encodeInternal(channels, numChannels, sampleRate, 16, false);
      case 'wav-32':
        return WavEncoder.encodeInternal(channels, numChannels, sampleRate, 32, false);
      case 'wav-32-float':
        return WavEncoder.encodeInternal(channels, numChannels, sampleRate, 32, true);
    }
  }

  /** Encode 32-bit float WAV (professional mastering format) */
  static encode32BitFloat(
    channels: Float32Array[],
    sampleRate: number
  ): Blob {
    return WavEncoder.encodeInternal(channels, channels.length, sampleRate, 32, true);
  }

  private static encodeInternal(
    channels: Float32Array[],
    numChannels: number,
    sampleRate: number,
    bitDepth: WavBitDepth,
    isFloat: boolean
  ): Blob {
    const bytesPerSample = bitDepth / 8;
    const numFrames = channels[0].length;
    const dataLength = numFrames * numChannels * bytesPerSample;

    // Use WAVEFORMATEXTENSIBLE for 32-bit float (fmt chunk = 40 bytes)
    const fmtChunkSize = isFloat ? 40 : 16;
    const headerLength = 44 + (isFloat ? 24 : 0);
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // RIFF
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, fmtChunkSize, true); // chunk size

    if (isFloat) {
      // WAVEFORMATEXTENSIBLE for float
      view.setUint16(20, 0xfffe, true); // WAVE_FORMAT_EXTENSIBLE
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
      view.setUint16(32, numChannels * bytesPerSample, true);
      view.setUint16(34, bitDepth, true);
      view.setUint16(36, 22, true); // extension size
      view.setUint16(38, bitDepth, true); // validBitsPerSample
      view.setUint32(40, numChannels === 2 ? 3 : 4, true); // channel mask
      // SubFormat GUID: KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
      this.writeString(view, 44, '\u0003\u0000\u0000\u0000');
      this.writeGuid(view, 48);
      // data chunk
      this.writeString(view, 64, 'data');
      view.setUint32(68, dataLength, true);

      let offset = 72;
      for (let f = 0; f < numFrames; f++) {
        for (let ch = 0; ch < numChannels; ch++) {
          view.setFloat32(offset, channels[ch][f], true);
          offset += 4;
        }
      }
    } else if (bitDepth === 32) {
      // 32-bit PCM
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
      view.setUint16(32, numChannels * bytesPerSample, true);
      view.setUint16(34, bitDepth, true);
      this.writeString(view, 36, 'data');
      view.setUint32(40, dataLength, true);

      let offset = 44;
      for (let f = 0; f < numFrames; f++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const sample = Math.max(-1, Math.min(1, channels[ch][f]));
          view.setInt32(offset, sample * 0x7fffffff, true);
          offset += 4;
        }
      }
    } else {
      // 16-bit PCM (original)
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
      view.setUint16(32, numChannels * bytesPerSample, true);
      view.setUint16(34, bitDepth, true);
      this.writeString(view, 36, 'data');
      view.setUint32(40, dataLength, true);

      let offset = 44;
      for (let f = 0; f < numFrames; f++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const sample = Math.max(-1, Math.min(1, channels[ch][f]));
          const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          view.setInt16(offset, intSample, true);
          offset += 2;
        }
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private static writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  private static writeGuid(view: DataView, offset: number) {
    // KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: 00000003-0000-0010-8000-00aa00389b71
    const guid = new Uint8Array([
      0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00,
      0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
    ]);
    for (let i = 0; i < 16; i++) {
      view.setUint8(offset + i, guid[i]);
    }
  }
}
