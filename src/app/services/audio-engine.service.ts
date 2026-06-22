import { LoggingService } from './logging.service';
import { Injectable, signal, inject, Injector } from '@angular/core';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';
import { InstrumentRegistryService } from '../studio/instrument-registry.service';

export type DeckId = 'A' | 'B';

@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  public cueMaster!: GainNode;
  public headphoneGain = signal(0.7);

  private static readonly INTEGER_TRACK_ID_PATTERN = /^-?\d+$/;
  private static readonly STEM_ORDER: (keyof Stems)[] = [
    'vocals',
    'drums',
    'bass',
    'instrumental',
    'other',
  ];

  public outputMode = signal<'speakers' | 'headphones'>('speakers');
  public performanceTier = signal<'ultra' | 'performance'>('ultra');
  public sidechainEnabled = signal(false);
  public tempo = signal(124);
  public recordingLatency = signal(0);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);
  public isRecording = signal(false);
  public isPlaying = signal(false);
  public visualStep = signal(0);
  public onScheduleStep:
    | ((step: number, when: number, stepDuration: number) => void)
    | null = null;

  public logger = inject(LoggingService);
  private injector = inject(Injector);
  private stemSeparationService = inject(StemSeparationService);

  public ctx: AudioContext;
  public masterGain!: GainNode;
  public masterAnalyser!: AnalyserNode;
  public compressor!: DynamicsCompressorNode;
  public limiter!: DynamicsCompressorNode;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.setupMasterChain();
  }

  private setupMasterChain() {
    this.masterGain = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.limiter = this.ctx.createDynamicsCompressor();

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
  }

  getTrackOutput(id: any): GainNode {
    return this.masterGain;
  }

  triggerAttack(trackId: any, freq: number, time: number, velocity: number, duration: number, gain: number, pan: number, sendA: number, sendB: number, synthParams: any) {
    const registry = this.injector.get(InstrumentRegistryService);
    const inst = registry.getInstrument(trackId, synthParams?.instrumentType);

    if (synthParams) {
      if (inst.setOscillatorType && synthParams.type) inst.setOscillatorType(synthParams.type);
      if (inst.setFilterCutoff && synthParams.cutoff) inst.setFilterCutoff(synthParams.cutoff);
      if (inst.setSampleMap && synthParams.sampleMap) inst.setSampleMap(synthParams.sampleMap);
    }

    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    inst.play(midi, velocity);

    if (duration > 0) {
      setTimeout(() => {
        inst.stop(midi);
      }, duration * 1000);
    }
  }

  setMasterOutputLevel(val: number) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
    }
  }
}
