# Studio Architecture Map — How the Code Becomes Music

One page. Four layers. One data path. If you can follow the trace in §3, you understand the Studio.

---

## 1. The 30-second mental model

```
┌────────────────────────────────────────────────────────────┐
│  LAYER 1 — SURFACES (what you see & touch)                 │
│  studio.component.ts (the shell + rail)                    │
│  studio-surfaces.ts (the catalogue of every view)          │
│  DrumMachine / PianoRoll / Mixer / QuickSession / …        │
└──────────────────────┬─────────────────────────────────────┘
                       │ every surface is just a *different editor*
                       ▼ over the same document
┌────────────────────────────────────────────────────────────┐
│  LAYER 2 — THE SONG DOCUMENT (the musical truth)           │
│  services/music-manager.service.ts                         │
│  tracks() → notes, patterns, scenes, stems                 │
│  Edit = addNoteToTrack / updateNote / removeNotes          │
└──────────────────────┬─────────────────────────────────────┘
                       │ the engine reads this document,
                       ▼ turns it into sound on a clock
┌────────────────────────────────────────────────────────────┐
│  LAYER 3 — THE ENGINE (the clock & the sound)              │
│  services/audio-engine.service.ts                          │
│  scheduler() (lookahead loop) → voices → WebAudio graph    │
│  start/stop, setTempo, count-in, metronome                 │
└──────────────────────┬─────────────────────────────────────┘
                       │ supported by
                       ▼
┌────────────────────────────────────────────────────────────┐
│  LAYER 4 — SUPPORT SERVICES (everything else)              │
│  AudioSessionService (AudioContext start/resume on tap)    │
│  InstrumentsService (patches), ProjectService (save/load)  │
│  HistoryService (undo), ExportService (mixdown/stems)      │
│  AiService (AI Producer, AI band members)                  │
└────────────────────────────────────────────────────────────┘
```

**The one rule that makes everything click:**
No surface owns music. A surface never stores a pattern, never holds a note.
Every tap a surface makes goes through **MusicManagerService**, which mutates the
shared song document; the engine then plays whatever that document says.
That is why the Drum Machine, Piano Roll, Chord Editor and Quick Session always
show the same music — they are four windows onto one document.

---

## 2. Why the Studio *feels* big (and why it needs to)

The Studio is a full DAW, so the surface catalogue (`studio-surfaces.ts`) lists
24 views in four workflow stages:

| Stage (group)         | What a musician does here                  | Key surfaces |
| --------------------- | ------------------------------------------ | ------------ |
| **1. Create & Jam**   | Record takes, program drums, play keys     | Quick Session, Drum Machine, Piano Roll, Vocal Suite, Chords, Sound Pads, Synth, AI Producer |
| **2. Song Builder**   | Turn loops into a song                     | Arrangement, Session View, Channel Rack, Score |
| **3. Mix & Polish**   | Balance, color, master, ship               | Mixer, Effects Rack, Mastering, DJ, Export |
| **4. Sounds & Packs** | Get sounds to play with                    | Sound Browser, Sample Library, Sampler, Plugin Store |

The views are the *same* music from different angles — not separate features.
A pattern you draw in the Drum Machine is the same `tracks()` note data the
Arrangement, the Channel Rack and the Mixer all read.

**For making a beat, only Stage 1 matters.** Quick Session is the deliberate
"small" entry point: one screen with transport, tempo, record and one-tap
starters — its file header says exactly this: *the full Studio is the right
shape once a song exists and the wrong shape when the artist just wants to drop
a beat*.

---

## 3. Trace: tapping one step in the Drum Machine, end to end

This is the whole architecture in one gesture:

1. **You tap a step** in `drum-machine.component.ts`
   → it calls `musicManager.addNoteToTrack(TRACK_DRUMS, { midi, step, velocity })`
   (see the toggle logic there around `getDrumTrack()` / `clearDrumPattern()`).

2. **The document changes** — `music-manager.service.ts` holds
   `tracks = signal<TrackModel[]>([])` (plus pattern slots, scenes, stems in
   `stemAudioCache`). That one function call is the *entire* act of "writing
   music" in this app. Piano rolls, chord editors, MIDI import — they all end at
   this same door.

3. **The engine loops** — `audio-engine.service.ts` runs `scheduler()`: a
   WebAudio lookahead loop that converts each step of the document to sound at
   sample-accurate times, honoring `setTempo()`, the tempo map, count-in and
   loop length. `MusicManagerService.playStep(step, time, duration)` is the
   per-step hand-off from document to voices.

4. **Sound comes out** — through the AudioSession-managed `AudioContext`, the
   master bus, and the meters.

Undo (HistoryService), saving (ProjectService), AI producer (AiService), export
(ExportService) all sit around the same document: **nothing bypasses it**.

---

## 4. Mental model → "how do I make a beat?"

With the architecture in hand, making a beat maps to four moves, not 24 views.
The Studio now hands you this same mental model where you need it:
the rail's **Music Map** button shows the four layers on tap, and it
**auto-opens once** for a brand-new artist's first Studio visit — never on a
restored project, a `?view=` deep link, or a guided `?tour=1` session
(the First Beat Tour's five stations deep-link the artist through the very
moves below: Quick Session → Drum Machine → Piano Roll → Arrangement →
Export).

The four moves:

1. **Open Quick Session** (or Drum Machine if you know you want step-editing).
   AudioContext starts/resumes on your first tap — that is `AudioSessionService`
   doing its one job.
2. **Set tempo & program a pattern** — every pad/step tap mutates
   `MusicManagerService.tracks()`. You are editing the document; that's it.
   AI Producer / one-tap starters do the same thing with more notes at once.
3. **Add melodic layers** — Piano Roll / Chords / Synth write *other tracks* in
   the same document (each instrument channel is a `TrackModel`).
4. **Arrange, mix, export** — Song Builder reorders the patterns into a song;
   Mixer adds faders on the same tracks; Export renders the whole document to
   audio. Your beat never leaves Layer 2 — the later stages only *present* it
   differently.

If the Studio feels overwhelming, it is because all four stages are on one rail.
The music itself is always just that one `tracks()` document plus the engine's
clock. Everything else is bookkeeping for the moment after the beat exists.

---

## 5. Quick reference — which file owns what

| I'm trying to…                      | Look in |
| ----------------------------------- | ------- |
| Add/edit/delete music (notes)       | `services/music-manager.service.ts` |
| Change how/when sound plays         | `services/audio-engine.service.ts` |
| See the list of every view & stage  | `studio/studio-surfaces.ts` |
| Understand the shell/rail           | `studio/studio.component.ts` |
| Fix "no sound on my device"         | `studio/audio-session.service.ts` |
| Instruments & presets               | `services/instruments.service.ts` |
| Save/load/undo/export               | `ProjectService` / `HistoryService` / `ExportService` |
| AI-driven creation                  | `services/ai.service.ts`, `studio/ai-band/`, `components/ai-produce/` |
| The beginner path                   | `studio/quick-session/`, `components/first-beat-tour/`, `services/onboarding.service.ts` (tour steps) |
| Rail "Music Map" + first-visit auto-open | `studio/shared/architecture-map/`, `studio.component.ts` (`shouldAutoOpenMusicMap`, `smuve_music_map_seen`) |
