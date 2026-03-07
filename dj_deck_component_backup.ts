     1	import {
     2	  Component,
     3	  ChangeDetectionStrategy,
     4	  signal,
     5	  input,
     6	  computed,
     7	  inject,
     8	  OnInit,
     9	  OnDestroy,
    10	  ViewChild,
    11	  ElementRef,
    12	  AfterViewInit
    13	} from '@angular/core';
    14	import { CommonModule, TitleCasePipe, DecimalPipe } from '@angular/common';
    15	import { AppTheme } from '../../services/user-context.service';
    16	import { FileLoaderService } from '../../services/file-loader.service';
    17	import { ExportService } from '../../services/export.service';
    18	import { LibraryService } from '../../services/library.service';
    19	import { FormsModule } from '@angular/forms';
    20	import { DeckService } from '../../services/deck.service';
    21	import { AudioEngineService } from '../../services/audio-engine.service';
    22	import { UIService } from '../../services/ui.service';
    23
    24	@Component({
    25	  selector: 'app-dj-deck',
    26	  templateUrl: './dj-deck.component.html',
    27	  changeDetection: ChangeDetectionStrategy.OnPush,
    28	  standalone: true,
    29	  imports: [CommonModule, FormsModule, TitleCasePipe, DecimalPipe],
    30	})
    31	export class DjDeckComponent implements OnInit, OnDestroy, AfterViewInit {
    32	  @ViewChild('waveformA') waveformA!: ElementRef<HTMLCanvasElement>;
    33	  @ViewChild('waveformB') waveformB!: ElementRef<HTMLCanvasElement>;
    34	  @ViewChild('meterA') meterA!: ElementRef<HTMLCanvasElement>;
    35	  @ViewChild('meterB') meterB!: ElementRef<HTMLCanvasElement>;
    36
    37	  theme = input<AppTheme>(inject(UIService).activeTheme());
    38
    39	  midiEnabled = signal(false);
    40	  phantomPowerEnabled = signal(false);
    41	  showSampleLibrary = signal(false);
    42
    43	  private recorder: MediaRecorder | null = null;
    44	  recording = signal(false);
    45
    46	  private animFrame: number | null = null;
    47	  private syncInterval: any = null;
    48	  performanceMode = signal<"cue" | "roll" | "sampler">("cue");
    49	  private tapTimes: { [key: string]: number[] } = { A: [], B: [] };
    50
    51	  pitchAPercentage = computed(
    52	    () => `${(this.deckService.deckA().playbackRate * 100).toFixed(1)}%`
    53	  );
    54	  pitchBPercentage = computed(
    55	    () => `${(this.deckService.deckB().playbackRate * 100).toFixed(1)}%`
    56	  );
    57
    58	  constructor(
    59	    private fileLoader: FileLoaderService,
    60	    private exportService: ExportService,
    61	    public library: LibraryService,
    62	    public deckService: DeckService,
    63	    private engine: AudioEngineService
    64	  ) {}
    65
    66	  ngOnInit() {
    67	    this.syncInterval = setInterval(() => {
    68	      this.deckService.syncProgress();
    69	    }, 50);
    70	  }
    71
    72	  ngAfterViewInit() {
    73	    this.startAnimationLoop();
    74	  }
    75
    76	  ngOnDestroy() {
    77	    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    78	    if (this.syncInterval) clearInterval(this.syncInterval);
    79	  }
    80
    81	  private startAnimationLoop() {
    82	    const loop = () => {
    83	      this.drawWaveforms();
    84	      this.drawMeters();
    85	      this.animFrame = requestAnimationFrame(loop);
    86	    };
    87	    loop();
    88	  }
    89
    90	  private drawWaveforms() {
    91	    this.drawDeckWaveform('A', this.waveformA?.nativeElement);
    92	    this.drawDeckWaveform('B', this.waveformB?.nativeElement);
    93	  }
    94
    95	  private drawDeckWaveform(id: 'A' | 'B', canvas: HTMLCanvasElement) {
    96	    if (!canvas) return;
    97	    const ctx = canvas.getContext('2d');
    98	    if (!ctx) return;
    99
   100	    const deck = id === 'A' ? this.deckService.deckA() : this.deckService.deckB();
   101	    const data = this.engine.getDeckWaveformData(id);
   102
   103	    ctx.clearRect(0, 0, canvas.width, canvas.height);
   104	    if (data.length === 0) {
   105	      ctx.strokeStyle = '#1e293b';
   106	      ctx.beginPath();
   107	      ctx.moveTo(0, canvas.height / 2);
   108	      ctx.lineTo(canvas.width, canvas.height / 2);
   109	      ctx.stroke();
   110	      return;
   111	    }
   112
   113	    // Pro Scrolling Waveform Logic
   114	    const sampleRate = this.engine.getContext().sampleRate || 44100;
   115	    const windowSize = 4; // 4 seconds visible
   116	    const samplesInWindow = windowSize * sampleRate;
   117	    const step = samplesInWindow / canvas.width;
   118	    const currentSample = deck.progress * sampleRate;
   119	    const startSample = Math.floor(currentSample - (samplesInWindow / 2));
   120	    const amp = canvas.height / 2;
   121
   122	    ctx.strokeStyle = id === 'A' ? '#10b981' : '#f59e0b';
   123	    ctx.lineWidth = 2;
   124	    ctx.beginPath();
   125	    for (let i = 0; i < canvas.width; i++) {
   126	        const idx = Math.floor(startSample + i * step);
   127	        if (idx >= 0 && idx < data.length) {
   128	            const val = data[idx];
   129	            ctx.moveTo(i, amp - val * amp);
   130	            ctx.lineTo(i, amp + val * amp);
   131	        }
   132	    }
   133	    ctx.stroke();
   134
   135	    // Playhead fixed in center
   136	    ctx.strokeStyle = '#f43f5e';
   137	    ctx.lineWidth = 3;
   138	    ctx.beginPath();
   139	    ctx.moveTo(canvas.width / 2, 0);
   140	    ctx.lineTo(canvas.width / 2, canvas.height);
   141	    ctx.stroke();
   142	  }
   143
   144	    // Pro Scrolling Waveform Logic
   145	    const sampleRate = this.engine.getContext().sampleRate;
   146	    const windowSize = 4; // 4 seconds visible
   147	    const samplesInWindow = windowSize * sampleRate;
   148	    const step = samplesInWindow / canvas.width;
   149	    const currentSample = deck.progress * sampleRate;
   150	    const startSample = Math.floor(currentSample - (samplesInWindow / 2));
   151	    const amp = canvas.height / 2;
   152
   153	    ctx.strokeStyle = id === 'A' ? '#10b981' : '#f59e0b';
   154	    ctx.lineWidth = 2;
   155	    ctx.beginPath();
   156	    for (let i = 0; i < canvas.width; i++) {
   157	        const idx = Math.floor(startSample + i * step);
   158	        if (idx >= 0 && idx < data.length) {
   159	            const val = data[idx];
   160	            ctx.moveTo(i, amp - val * amp);
   161	            ctx.lineTo(i, amp + val * amp);
   162	        }
   163	    }
   164	    ctx.stroke();
   165
   166	    // Playhead fixed in center
   167	    ctx.strokeStyle = '#f43f5e';
   168	    ctx.lineWidth = 3;
   169	    ctx.beginPath();
   170	    ctx.moveTo(canvas.width / 2, 0);
   171	    ctx.lineTo(canvas.width / 2, canvas.height);
   172	    ctx.stroke();
   173	  }
   174
   175	    const step = Math.ceil(data.length / canvas.width);
   176	    const amp = canvas.height / 2;
   177
   178	    ctx.strokeStyle = id === 'A' ? '#10b981' : '#f59e0b';
   179	    ctx.lineWidth = 1;
   180	    ctx.beginPath();
   181
   182	    for (let i = 0; i < canvas.width; i++) {
   183	      let min = 1.0;
   184	      let max = -1.0;
   185	      for (let j = 0; j < step; j++) {
   186	        const datum = data[i * step + j];
   187	        if (datum < min) min = datum;
   188	        if (datum > max) max = datum;
   189	      }
   190	      ctx.moveTo(i, (1 + min) * amp);
   191	      ctx.lineTo(i, (1 + max) * amp);
   192	    }
   193	    ctx.stroke();
   194
   195	    // Playhead
   196	    const progress = deck.progress / (deck.duration || 1);
   197	    const x = progress * canvas.width;
   198	    ctx.strokeStyle = '#f43f5e';
   199	    ctx.lineWidth = 2;
   200	    ctx.beginPath();
   201	    ctx.moveTo(x, 0);
   202	    ctx.lineTo(x, canvas.height);
   203	    ctx.stroke();
   204	  }
   205
   206	  private drawMeters() {
   207	    this.drawMeter('A', this.meterA?.nativeElement);
   208	    this.drawMeter('B', this.meterB?.nativeElement);
   209	  }
   210
   211	  private drawMeter(id: 'A' | 'B', canvas: HTMLCanvasElement) {
   212	    if (!canvas) return;
   213	    const ctx = canvas.getContext('2d');
   214	    if (!ctx) return;
   215
   216	    const level = this.engine.getDeckLevel(id);
   217	    ctx.clearRect(0, 0, canvas.width, canvas.height);
   218
   219	    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
   220	    gradient.addColorStop(0, '#10b981');
   221	    gradient.addColorStop(0.7, '#fbbf24');
   222	    gradient.addColorStop(1, '#ef4444');
   223
   224	    ctx.fillStyle = '#020617';
   225	    ctx.fillRect(0, 0, canvas.width, canvas.height);
   226
   227	    ctx.fillStyle = gradient;
   228	    const h = level * canvas.height;
   229	    ctx.fillRect(0, canvas.height - h, canvas.width, h);
   230	  }
   231
   232	  async loadTrackFor(deck: 'A' | 'B') {
   233	    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
   234	    if (!files?.length) return;
   235	    const file = files[0];
   236	    const buffer = await this.fileLoader.decodeToAudioBuffer(
   237	      this.engine.getContext(),
   238	      file
   239	    );
   240	    this.deckService.loadDeckBuffer(deck, buffer, file.name);
   241	  }
   242
   243	  tapBpm(deck: 'A' | 'B') {
   244	    const now = Date.now();
   245	    if (!this.tapTimes[deck]) this.tapTimes[deck] = [];
   246	    this.tapTimes[deck].push(now);
   247	    if (this.tapTimes[deck].length > 4) this.tapTimes[deck].shift();
   248	    if (this.tapTimes[deck].length > 1) {
   249	      const diffs = [];
   250	      for (let i = 1; i < this.tapTimes[deck].length; i++) {
   251	        diffs.push(this.tapTimes[deck][i] - this.tapTimes[deck][i - 1]);
   252	      }
   253	      const avg = diffs.reduce((a, b) => a + b) / diffs.length;
   254	      const bpm = Math.round(60000 / avg);
   255	      this.deckService.setBpm(deck, bpm);
   256	    }
   257	  }
   258
   259	  handlePadPress(deck: 'A' | 'B', index: number) {
   260	    const mode = this.performanceMode();
   261	    if (mode === 'cue') {
   262	      const d = deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
   263	      if (d.hotCues[index] === null) this.deckService.setHotCue(deck, index);
   264	      else this.deckService.jumpToHotCue(deck, index);
   265	    } else if (mode === 'roll') {
   266	      const rollLengths = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8];
   267	      console.log(`Roll active: ${rollLengths[index]} beats on Deck ${deck}`);
   268	    } else if (mode === 'sampler') {
   269	      console.log(`Trigger Sample ${index + 1} on Deck ${deck}`);
   270	    }
   271	  }
   272
   273	  setPlaybackRate(deck: 'A' | 'B', rate: any) {
   274	    const r = parseFloat(rate);
   275	    if (deck === 'A') this.deckService.deckA.update(d => ({ ...d, playbackRate: r }));
   276	    else this.deckService.deckB.update(d => ({ ...d, playbackRate: r }));
   277	  }
   278
   279	  setEq(deck: 'A' | 'B', band: 'high' | 'mid' | 'low', val: any) {
   280	    const v = parseFloat(val);
   281	    const d = deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
   282	    let { eqHigh, eqMid, eqLow } = d;
   283	    if (band === 'high') eqHigh = v;
   284	    if (band === 'mid') eqMid = v;
   285	    if (band === 'low') eqLow = v;
   286	    this.deckService.setDeckEq(deck, eqHigh, eqMid, eqLow);
   287	  }
   288
   289	  setFilter(deck: 'A' | 'B', val: any) {
   290	    this.deckService.setDeckFilter(deck, parseFloat(val));
   291	  }
   292
   293	  setGain(deck: 'A' | 'B', val: any) {
   294	    this.deckService.setDeckGain(deck, parseFloat(val));
   295	  }
   296
   297	  startStopRecording() {
   298	    if (this.recording()) {
   299	      this.recorder?.stop();
   300	      this.recording.set(false);
   301	      this.recorder = null;
   302	      return;
   303	    }
   304	    const { recorder, result } = this.exportService.startLiveRecording();
   305	    this.recorder = recorder;
   306	    this.recording.set(true);
   307	    result.then((blob) => {
   308	      const url = URL.createObjectURL(blob);
   309	      const a = document.createElement('a');
   310	      a.href = url;
   311	      a.download = `mix-${Date.now()}.webm`;
   312	      a.click();
   313	    });
   314	  }
   315
   316	  sync(deck: 'A' | 'B') {
   317	    this.deckService.sync(deck);
   318	  }
   319	}
