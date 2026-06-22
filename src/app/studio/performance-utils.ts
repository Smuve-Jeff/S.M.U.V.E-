import { Injectable } from '@angular/core';

export class NodePool<T extends AudioNode> {
  private pool: T[] = [];

  constructor(
    private readonly context: BaseAudioContext,
    private readonly factory: (ctx: BaseAudioContext) => T,
    private readonly initialSize: number = 0
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory(this.context));
    }
  }

  get(): T {
    return this.pool.pop() || this.factory(this.context);
  }

  release(node: T) {
    node.disconnect();
    this.pool.push(node);
  }
}

export interface Voice {
  startTime: number;
  stop: () => void;
  note: number;
}

export class VoiceManager {
  private voices: Voice[] = [];

  constructor(private maxVoices: number = 16) {}

  addVoice(voice: Voice) {
    if (this.voices.length >= this.maxVoices) {
      this.stealVoice();
    }
    this.voices.push(voice);
    // Sort by start time to always steal the oldest
    this.voices.sort((a, b) => a.startTime - b.startTime);
  }

  removeVoice(voice: Voice) {
    this.voices = this.voices.filter((v) => v !== voice);
  }

  private stealVoice() {
    const oldestVoice = this.voices.shift();
    if (oldestVoice) {
      oldestVoice.stop();
    }
  }

  clear() {
    this.voices.forEach((v) => v.stop());
    this.voices = [];
  }
}
