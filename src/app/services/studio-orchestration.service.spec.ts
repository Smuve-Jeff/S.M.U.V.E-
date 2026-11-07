import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { StudioOrchestrationService } from './studio-orchestration.service';
import { AuthService } from './auth.service';
import { ProjectService } from './project.service';
import { MusicManagerService } from './music-manager.service';
import { CollaborationService } from './collaboration.service';
import { SessionHistoryService } from './session-history.service';
import { SocialNetworkingService } from './social-networking.service';
import { AiProduceService } from './ai-produce.service';
import { AiMixAssistantService } from '../studio/effects/ai-mix-assistant.service';
import { CommandPaletteService } from './command-palette.service';

describe('StudioOrchestrationService · creator handoff packets', () => {
  let sut: StudioOrchestrationService;

  const session = signal<any>(null);
  const canShare = signal(true);
  const handoff = signal<any>(null);
  const user = signal<any>({ id: 'user-1', artistName: 'Tester' });

  const social = {
    sessionSyncState: signal<any>(null),
    onlineUsers: signal<any[]>([]),
    sendAsyncCollaborationPacket: jest.fn(),
    createApprovalRequest: jest.fn(),
  };

  const brief = {
    id: 'handoff_night-code',
    title: 'Night Code',
    genre: 'Trap',
    mood: 'dark',
    bpm: 140,
    key: 'C#m',
    sections: [{ name: 'Intro', bars: 8, energy: 0.3, elements: ['hihat'] }],
    chords: ['i', 'VI'],
    hookLines: ['no sleep tonight'],
    mixNotes: ['Target -10 LUFS.'],
    brief: '# Night Code — creator handoff',
    generatedAt: 1,
  };

  beforeEach(() => {
    session.set(null);
    canShare.set(true);
    handoff.set(null);
    social.sendAsyncCollaborationPacket.mockClear();

    TestBed.configureTestingModule({
      providers: [
        StudioOrchestrationService,
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: ProjectService, useValue: { currentProject: () => null } },
        {
          provide: MusicManagerService,
          useValue: {
            selectedTrackId: signal<string | null>(null),
            selectedTrack: () => null,
            tracks: signal([]),
            projectName: 'Test Project',
            applyGeneratedRecipe: jest.fn(),
            snapshotProject: jest.fn(() => ({})),
          },
        },
        {
          provide: CollaborationService,
          useValue: {
            currentSession: session,
            can: () => canShare(),
            currentRole: signal('host'),
            currentPermissions: signal({}),
            sessionMembers: signal([]),
            pendingConflicts: signal([]),
          },
        },
        {
          provide: SessionHistoryService,
          useValue: {
            activeBranch: () => null,
            checkpoints: () => [],
            setTimelineReviewState: jest.fn(),
            createBranch: jest.fn(),
          },
        },
        { provide: SocialNetworkingService, useValue: social },
        {
          provide: AiProduceService,
          useValue: {
            creatorHandoff: handoff,
            buildStudioActionResults: () => [],
            applyToProject: jest.fn(),
          },
        },
        {
          provide: AiMixAssistantService,
          useValue: {
            buildStudioActionResults: () => [],
            previewSuggestion: jest.fn(),
            applySuggestion: jest.fn(),
            exportSuggestion: jest.fn(),
          },
        },
        {
          provide: CommandPaletteService,
          useValue: { setExtensionActions: jest.fn() },
        },
      ],
    });
    sut = TestBed.inject(StudioOrchestrationService);
  });

  it('records the sent brief in the session packet list for the sender', () => {
    handoff.set(brief);
    session.set({ sessionId: 'sess-1', projectId: 'proj-1' });

    const packet = sut.sendCreatorHandoff('user-2');
    expect(packet).not.toBeNull();
    expect(packet!.sessionId).toBe('sess-1');
    expect(packet!.toUserId).toBe('user-2');
    expect(packet!.packetType).toBe('review_request');

    // Recorded before the socket echo, so the sender sees delivery immediately.
    const listed = sut.sessionAsyncPackets();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(packet!.id);
    const payload = listed[0].payload as any;
    expect(payload.kind).toBe('creator_brief');
    expect(payload.brief).toContain('creator handoff');
    expect(payload.sections).toHaveLength(1);
    expect(sut.pendingAsyncPackets()).toHaveLength(1);
    expect(social.sendAsyncCollaborationPacket).toHaveBeenCalledTimes(1);
  });

  it('does not send outside a session or without share rights', () => {
    handoff.set(brief);

    expect(sut.canSendCreatorHandoff()).toBe(false);
    expect(sut.sendCreatorHandoff()).toBeNull();

    session.set({ sessionId: 'sess-1', projectId: null });
    canShare.set(false);

    expect(sut.canSendCreatorHandoff()).toBe(false);
    expect(sut.sendCreatorHandoff()).toBeNull();
    expect(social.sendAsyncCollaborationPacket).not.toHaveBeenCalled();
    expect(sut.sessionAsyncPackets()).toHaveLength(0);
  });

  it('does not claim delivery until the server echoes the packet', () => {
    handoff.set(brief);
    session.set({ sessionId: 'sess-1', projectId: null });

    const packet = sut.sendCreatorHandoff()!;
    expect(sut.packetDelivery(packet)).toBe('queued');

    // The server assigns its own id but echoes the same handoff, so the
    // optimistic row is replaced by the acknowledged copy.
    sut.reconcilePacketAcks([
      { ...packet, id: 'server-copy', createdAt: packet.createdAt } as any,
    ]);

    expect(sut.sessionAsyncPackets().map((entry) => entry.id)).toEqual([
      'server-copy',
    ]);
    expect(
      sut.packetDelivery({ ...packet, id: 'server-copy' } as any)
    ).toBe('delivered');
  });

  it('leaves a packet queued when the echo belongs to another handoff', () => {
    handoff.set(brief);
    session.set({ sessionId: 'sess-1', projectId: null });
    const packet = sut.sendCreatorHandoff()!;

    sut.reconcilePacketAcks([
      {
        id: 'unrelated',
        sessionId: 'sess-1',
        payload: { kind: 'creator_brief', handoffId: 'handoff_other' },
        createdAt: 1,
      } as any,
    ]);

    expect(sut.packetDelivery(packet)).toBe('queued');
    expect(sut.sessionAsyncPackets().some((entry) => entry.id === packet.id)).toBe(
      true
    );
  });

  it('lists only packets from the active session, newest first', () => {
    session.set({ sessionId: 'sess-1', projectId: null });
    sut.asyncPackets.set([
      { id: 'older', sessionId: 'sess-1', createdAt: 1 },
      { id: 'other', sessionId: 'sess-2', createdAt: 2 },
      { id: 'newer', sessionId: 'sess-1', createdAt: 3 },
    ] as any);

    expect(sut.sessionAsyncPackets().map((packet) => packet.id)).toEqual([
      'newer',
      'older',
    ]);
  });
});
