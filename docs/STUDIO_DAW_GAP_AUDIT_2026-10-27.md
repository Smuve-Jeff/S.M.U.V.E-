# Studio DAW gap audit — 27 Oct 2026

Component-by-component inspection of the Studio after the live-scene, automation
and session changes. "Verified" means the behaviour exists and is exercised by a
spec or by the real service path, not merely that a control is rendered.

## Project, save/load, templates

| Area | State | Evidence |
| --- | --- | --- |
| New project | Verified | `StudioComponent.newProject()` clears via `MusicManagerService.newProject()` and starts a fresh workspace; lands on Quick Session. |
| Save (local) | Verified | `ProjectWorkspaceService.saveProject/autoSave`, Ctrl+S, header menu, retry banner, dirty/last-persisted status. |
| Load | Verified | `listLocalProjects`, `loadProject`, recovery/autosave records, `.smuve` file import (`loadProjectFile`). |
| Export/import bundle | Verified | `downloadProjectBundle`, `importProjectBundle`, cloud sync queue. |
| Version history | Verified | Stored snapshots (manual/autosave/recovery) listed and restorable. |
| Templates | Verified | `ProjectTemplateService` (4 starters) clears, adds channels on real instrument ids and sets BPM; new spec added. |
| Gap | — | User-authored templates are not saved; templates ship fixed. |

## Mixer

- VCAs, aux sends, per-channel phase invert, stereo width, buses: present.
- Solo-safe, mono-sum monitoring and their saved state are implemented and shown
  in Project Details (closed this cycle).
- Meters and gain staging exist; no solo-in-place isolation mode.

## Mastering / export

- LUFS targets, true-peak reference comparison, delivery formats (WAV/MP3/FLAC),
  stems, MIDI, DAWproject, export presets (new), sample-rate choice: verified.
- Dither on bit-depth reduction is implemented (`dither.util`, used by the
  WAV/FLAC encoders).
- Plugin metering is file-based; no real-time LUFS meter in the transport.

## Piano roll / MIDI editing

- Notes, velocities, sub-grid timing, articulation lengths, probability,
  micro-offset, slide, cross-link to arrangement, external keyboard preview.
- Scale lock/fold is implemented (`scaleLockEnabled`, applied to new and moved
  notes).
- **Gaps: MPE per-note expression** and a fretboard view are absent. CC lanes
  exist in the piano roll but their curves are not yet applied to playback.

## Arrangement

- Slip/trim/move, split at playhead, fades/crossfades, markers, take lanes,
  comping, automation lanes with bezier editing, clip pattern references.
- Fixed this cycle: the "Show automation" clip action armed write instead of
  opening lanes; automation now plays back from the transport and records
  fader/pan writes.
- Automation targets were audited: `cutoff` and `reverb` lanes drew curves that
  reached nothing. `reverb` now drives the aux reverb send (send A) and `cutoff`
  sweeps a new per-channel lowpass; send moves are captured while write is armed
  and `sendA`/`sendB` are offered as lane targets.
- **Gap: automation write does not cover plugin parameters**, and automation is
  live-only — `ExportService.renderProjectOffline` does not apply the curves.

## Channel rack / patterns / scenes

- Pattern slots (create/rename/duplicate/delete with clip re-pointing and undo),
  per-channel scene columns, live scene launch, follow actions, back-to-song.
- Fixed this cycle: launching a scene now changes playback, not just the
  highlighted cells.

## Session View

- Rebuilt on the real channel/pattern projection; scene CRUD maps to the pattern
  rack. Local mock clip store, local autosave and session presets removed.
- Per-cell (clip) launch quantization is implemented on the pattern slot and
  saved with the project; the grid boundary and per-clip overrides are both
  shown in Project Details.
- Per-scene follow rules (loop / advance after its own bar count) are saved with
  the project and keyed to the scene, not its column.

## Score / notation

- Editable score, MusicXML import/export utility with specs.

## Vocal suite / comping

- Pitch/tune, comp sections, take promotion, punch-in, waveform comping.

## DJ deck

- Crossfader curve and hamster mode implemented against `DeckService`; stems,
  hot cues, loops, MIDI mapping for decks.

## Plugins

- WASM plugin inserts, plugin store, per-track plugin chains.
- **Platform limit: no VST/AU hosting** — a browser cannot load native plugin
  binaries. Not fixable in-app.

## External connections

| Connection | State | Notes |
| --- | --- | --- |
| MIDI keyboards / pads | Verified | Web MIDI input; performer note/CC streams feed the piano roll and performer surfaces; device gating and MIDI thru/clock follow exist. |
| Studio-wide MIDI learn (new) | Verified | `StudioMidiLearnService` binds CC/note to master, per-channel volume/pan, transport, record and scenes; persisted; panel in the transport bar. |
| Game controllers (new) | Verified | `GamepadService` already polled for games; transport bar now maps A/B/X/Y/LB/RB/START with rising-edge detection. |
| Microphone / interfaces | Verified | Device enumeration with capability inference, selection, input gain, level meter, recorder integration. |
| Phantom power (+48V), pad, preamp gain | **Not possible in a browser** | No Web API exposes interface preamps. The hardware panel states this and reports label-derived capabilities ("48V capable", "USB interface") instead of faking a toggle. |
| USB audio interfaces | Verified as audio inputs | Appear as `AudioInputDevice` with `usb-interface` capability; no vendor control surface. |

## Remaining candidate work

1. Plugin-parameter automation (write + playback through the effects rack).
2. Apply automation curves in offline export; the current render is live-faithful
   for notes, gain, pan and clip fades but not for automation.
3. CC lane playback (piano-roll CC curves are recorded/edited but silent).
4. MPE per-note expression and a fretboard view in the piano roll.
5. User-authored project templates.
6. `OfflineBounceService.renderArrangement` is a simplified second renderer
   (oscillator + envelope only); the ExportService path is the faithful one and
   the two should be consolidated.
