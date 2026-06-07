import re

with open('src/app/services/music-manager.service.ts', 'r') as f:
    content = f.read()

# Define the missing/broken methods
methods = [
    "toggleMute", "toggleSolo", "setInstrument", "updateSynthParams",
    "setSidechain", "quantizeTrack", "humanizeTrack", "arpeggiateTrack",
    "strumTrack", "setNoteParam", "duplicateNotes", "recordLiveNote",
    "midiToFreq", "setActivePatternSlot", "playStep", "importAudioTrack"
]

# We need to find the place where the file got corrupted (likely around the splitClip or duplicate methods)
# and clean it up.

# Let's just rewrite the whole bottom of the class from a known good point.
# I'll find 'addClipToTrack' as the last definitely good method.

split_point = content.find('addClipToTrack(trackId: number, clip: Partial<TrackClip> = {}) {')
if split_point != -1:
    # Find the next '}' that closes this method
    end_of_add = content.find('  }', split_point) + 3
    base_content = content[:end_of_add]

    rest = \"\"\"
  updateClip(trackId: number, clipId: string, patch: Partial<TrackClip>) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, ...patch } : clip
          ),
        };
      })
    );
  }

  moveClip(fromTrackId: number, toTrackId: number, clipId: string, patch: Partial<TrackClip>) {
    let movingClip: TrackClip | null = null;
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id === fromTrackId) {
        const clip = t.clips.find(c => c.id === clipId);
        if (clip) {
          movingClip = { ...clip, ...patch };
          return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
        }
      }
      return t;
    }));
    if (movingClip) {
      this.tracks.update(tracks => tracks.map(t => {
        if (t.id === toTrackId) return { ...t, clips: [...t.clips, movingClip!] };
        return t;
      }));
    }
  }

  splitClip(trackId: number, clipId: string, splitBar: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const clipIndex = t.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return t;
      const clip = t.clips[clipIndex];
      if (splitBar <= clip.start || splitBar >= clip.start + clip.length) return t;
      const firstPart = { ...clip, length: splitBar - clip.start };
      const secondPart = {
        ...clip, id: `clip-${trackId}-${Date.now()}`,
        start: splitBar, length: clip.length - (splitBar - clip.start)
      };
      const nextClips = [...t.clips];
      nextClips.splice(clipIndex, 1, firstPart, secondPart);
      return { ...t, clips: nextClips };
    }));
  }

  toggleMute(trackId: number) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, mute: !t.mute } : t));
  }

  toggleSolo(trackId: number) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t));
  }

  setInstrument(trackId: number, instrumentId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instrumentId);
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, instrumentId, name: preset?.name || t.name, synthParams: preset?.synth || t.synthParams };
    }));
  }

  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, synthParams: { ...t.synthParams, ...params } } : t));
  }

  setSidechain(trackId: number, targetId: string | null) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, sidechainTargetTrackId: targetId } : t));
    if (targetId) this.engine.connectSidechain(`${trackId}`, targetId);
  }

  quantizeTrack(trackId: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({ ...t, notes: t.notes.map(n => ({ ...n, step: Math.round(n.step) })) });
    }));
  }

  humanizeTrack(trackId: number, intensity: number = 0.08) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({
        ...t,
        notes: t.notes.map(n => ({
          ...n,
          step: n.step + (Math.random() - 0.5) * intensity,
          velocity: Math.max(0.1, Math.min(1.2, n.velocity + (Math.random() - 0.5) * intensity * 2)),
          offset: (n.offset || 0) + (Math.random() - 0.5) * 0.02
        }))
      });
    }));
  }

  arpeggiateTrack(trackId: number, pattern: number[] = [0, 4, 7, 12]) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const sortedNotes = [...t.notes].sort((a, b) => a.step - b.step);
      if (sortedNotes.length === 0) return t;
      const nextNotes: TrackNote[] = [];
      sortedNotes.forEach(note => {
        pattern.forEach((interval, j) => {
          nextNotes.push({ ...note, id: `arp-${note.id}-${j}`, midi: note.midi + interval, step: note.step + (j * 0.25), length: 0.2 });
        });
      });
      return this.persistActivePattern({ ...t, notes: nextNotes });
    }));
  }

  strumTrack(trackId: number, strength: number = 0.05) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const grouped = new Map<number, TrackNote[]>();
      t.notes.forEach(n => {
        if (!grouped.has(n.step)) grouped.set(n.step, []);
        grouped.get(n.step)!.push(n);
      });
      return this.persistActivePattern({
        ...t,
        notes: t.notes.map(n => {
          const chord = grouped.get(n.step) || [];
          if (chord.length <= 1) return n;
          const index = [...chord].sort((a, b) => a.midi - b.midi).findIndex(c => c.id === n.id);
          return { ...n, step: n.step + index * strength };
        })
      });
    }));
  }

  setNoteParam(trackId: number, noteId: string, param: string, value: any) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({ ...t, notes: t.notes.map(n => n.id === noteId ? { ...n, [param]: value } : n) });
    }));
  }

  duplicateNotes(trackId: number, noteIds: string[], stepOffset: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const notesToDuplicate = t.notes.filter(n => noteIds.includes(n.id));
      return this.persistActivePattern({
        ...t,
        notes: [...t.notes, ...notesToDuplicate.map(n => ({ ...n, id: `note-${Date.now()}-${Math.random()}`, step: n.step + stepOffset }))]
      });
    }));
  }

  recordLiveNote(midi: number, velocity: number): string | undefined {
    const selectedId = this.selectedTrackId();
    if (!selectedId || !this.audioSession.isRecording()) return undefined;
    const currentStepValue = Math.floor(this.engine.currentBeat() * this.engine.stepsPerBeat()) % MusicManagerService.PATTERN_STEPS;
    const noteId = `note-${Date.now()}-${Math.random()}`;
    this.addNoteToTrack(selectedId, { id: noteId, midi, step: currentStepValue, length: 0.1, velocity });
    return noteId;
  }

  midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setActivePatternSlot(trackId: number, slotId: string) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId || !track.patternSlots?.length) return track;
        const persistedTrack = this.persistActivePattern(track);
        const nextVersion = this.getActivePatternVersion(persistedTrack.patternSlots, slotId);
        if (!nextVersion) return persistedTrack;
        return {
          ...persistedTrack,
          activePatternSlotId: slotId,
          notes: this.cloneNotes(nextVersion.notes),
          steps: [...nextVersion.steps],
        };
      })
    );
  }

  playStep(step: number, time: number, duration: number, customCtx?: BaseAudioContext) {
    this.currentStep.set(step);
    const hasSoloTrack = this.tracks().some((track) => track.solo);
    this.tracks().forEach((track) => {
      if (track.mute || (hasSoloTrack && !track.solo)) return;
      const clips = track.clips.length ? track.clips : [
        this.createDefaultClip(track.id, this.getSlotName(track, track.activePatternSlotId || track.patternSlots?.[0]?.id || 'slot-0'), track.color, track.activePatternSlotId || track.patternSlots?.[0]?.id || 'slot-0')
      ];
      const slotLookups = new Map<string, Map<number, TrackNote[]>>();
      const notesToPlay: TrackNote[] = [];
      clips.forEach((clip) => {
        const slotId = clip.slotId || track.activePatternSlotId;
        const version = this.getActivePatternVersion(track.patternSlots, slotId);
        if (!version) return;
        const lookupKey = slotId || 'active-slot';
        let noteLookup = slotLookups.get(lookupKey);
        if (!noteLookup) {
          noteLookup = new Map<number, TrackNote[]>();
          version.notes.forEach((note) => {
            const noteStep = Math.floor(note.step);
            const bucket = noteLookup?.get(noteStep) || [];
            bucket.push(note);
            noteLookup?.set(noteStep, bucket);
          });
          slotLookups.set(lookupKey, noteLookup);
        }
        const clipStartStep = Math.round(clip.start * MusicManagerService.STEPS_PER_BAR);
        const clipLengthSteps = Math.max(1, Math.round(clip.length * MusicManagerService.STEPS_PER_BAR));
        const clipRelativeStep = step - clipStartStep;
        if (clipRelativeStep >= 0 && clipRelativeStep < clipLengthSteps) {
          (noteLookup.get(clipRelativeStep % MusicManagerService.PATTERN_STEPS) || []).forEach(n => notesToPlay.push(n));
        }
      });
      notesToPlay.forEach((note) => {
        const freq = this.midiToFreq(note.midi);
        const synthParams = { ...(track.synthParams || { type: 'sine' }), ...(note.cutoff ? { cutoff: note.cutoff } : {}) };
        this.engine.triggerAttack(track.id, freq, time, note.velocity, note.length * duration, track.gain, note.pan ?? track.pan, track.sendA, track.sendB, synthParams, 1, customCtx);
      });
    });
  }

  importAudioTrack() { this.logger.info('Importing audio track...'); }
}
\"\"\"
    with open('src/app/services/music-manager.service.ts', 'w') as f:
        f.write(base_content + rest)
    print("MusicManager restored and finalized.")
