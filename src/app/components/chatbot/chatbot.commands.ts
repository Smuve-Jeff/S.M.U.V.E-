import { signal } from '@angular/core';

// This is a simplified interface for the ChatbotComponent to avoid 'any' and circular dependencies.
interface CommandComponentContext {
  sendGoogleSearchQuery(query: string): Promise<void>;
  sendDeepQuery(query: string): Promise<void>;
  startAudioTranscription(): Promise<void>;
  sendGoogleMapsQuery(location: string): Promise<void>;
  analyzeImage(url: string, prompt: string): void;
  analyzeVideo(track: string, prompt: string): void;
  studyTrack(trackId: string): Promise<void>;
  researchArtist(artistName: string): Promise<void>;
  mimicStyle(styleId: string): Promise<void>;
  viewKnowledgeBase(): void;
  updateCoreTrends(): Promise<void>;
  appCommand: {
    emit(command: {
      action: string;
      parameters: { [key: string]: unknown };
    }): void;
  };
}

export interface Command {
  name: string;
  description: string;
  params?: { name: string; description: string }[];
  execute: (
    params: { [key: string]: string },
    component: CommandComponentContext
  ) => Promise<void>;
}

export const isExecutingCommand = signal(false);

export const COMMANDS: Command[] = [
  {
    name: 'SEARCH',
    description: 'Performs a Google search.',
    params: [{ name: 'query', description: 'The search query.' }],
    execute: async (params, component) => {
      await component.sendGoogleSearchQuery(params.query);
    },
  },
  {
    name: 'DEEP',
    description: 'Performs a deep, thoughtful query.',
    params: [{ name: 'query', description: 'The query for the deep search.' }],
    execute: async (params, component) => {
      await component.sendDeepQuery(params.query);
    },
  },
  {
    name: 'TRANSCRIBE',
    description: 'Starts or stops audio transcription.',
    execute: async (params, component) => {
      await component.startAudioTranscription();
    },
  },
  {
    name: 'MAP',
    description: 'Finds a location on Google Maps.',
    params: [{ name: 'location', description: 'The location to find.' }],
    execute: async (params, component) => {
      await component.sendGoogleMapsQuery(params.location);
    },
  },
  {
    name: 'FIND_ON_MAP',
    description: 'Alias for MAP.',
    params: [{ name: 'location', description: 'The location to find.' }],
    execute: async (params, component) => {
      await component.sendGoogleMapsQuery(params.location);
    },
  },
  {
    name: 'SET_THEME',
    description: 'Sets the application theme.',
    params: [
      { name: 'themeName', description: 'The name of the theme to set.' },
    ],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'SET_THEME',
        parameters: { themeName: params.themeName },
      });
    },
  },
  {
    name: 'GENERATE_IMAGE',
    description: 'Generates an image.',
    params: [
      { name: 'prompt', description: 'The prompt for image generation.' },
    ],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'GENERATE_IMAGE',
        parameters: { prompt: params.prompt },
      });
    },
  },
  {
    name: 'GENERATE_VIDEO',
    description: 'Generates a video.',
    params: [
      { name: 'prompt', description: 'The prompt for video generation.' },
    ],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'GENERATE_VIDEO',
        parameters: { prompt: params.prompt },
      });
    },
  },
  {
    name: 'ANALYZE_IMAGE',
    description: 'Analyzes an image.',
    params: [{ name: 'url', description: 'The URL of the image to analyze.' }],
    execute: async (params, component) => {
      component.analyzeImage(
        params.url,
        'Describe this image for a music video concept.'
      );
    },
  },
  {
    name: 'ANALYZE_VIDEO',
    description: 'Analyzes a video.',
    params: [
      { name: 'track', description: 'The track to analyze.' },
      { name: 'prompt', description: 'The prompt for video analysis.' },
    ],
    execute: async (params, component) => {
      component.analyzeVideo(params.track, params.prompt);
    },
  },
  {
    name: 'FIND_ARTISTS',
    description: 'Finds artists based on a query.',
    params: [{ name: 'query', description: 'The query to find artists.' }],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'FIND_ARTISTS',
        parameters: { query: params.query },
      });
    },
  },
  {
    name: 'VIEW_ARTIST_PROFILE',
    description: 'Views an artist profile.',
    params: [
      {
        name: 'name',
        description: "The name of the artist's profile to view.",
      },
    ],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'VIEW_ARTIST_PROFILE',
        parameters: { name: params.name },
      });
    },
  },
  {
    name: 'ENTER_HUB',
    description: 'Enters the main hub.',
    execute: async (params, component) => {
      component.appCommand.emit({ action: 'ENTER_HUB', parameters: {} });
    },
  },
  {
    name: 'LAUNCH_GAME',
    description: 'Launches a game.',
    params: [{ name: 'gameId', description: 'The ID of the game to launch.' }],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'LAUNCH_GAME',
        parameters: { gameId: params.gameId },
      });
    },
  },
  {
    name: 'PLAYER_CONTROL',
    description: 'Controls the music player.',
    params: [
      {
        name: 'action',
        description: 'The action to perform (e.g., play, pause).',
      },
    ],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'PLAYER_CONTROL',
        parameters: { action: params.action },
      });
    },
  },
  {
    name: 'TOGGLE_STUDIO_TOOL',
    description: 'Toggles a studio tool.',
    params: [{ name: 'tool', description: 'The name of the tool to toggle.' }],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'TOGGLE_STUDIO_TOOL',
        parameters: { tool: params.tool },
      });
    },
  },
  {
    name: 'VIEW_STRATEGY',
    description:
      'Opens the Strategy Hub for rollout plans and marketing tools.',
    execute: async (params, component) => {
      component.appCommand.emit({ action: 'VIEW_STRATEGY', parameters: {} });
    },
  },
  {
    name: 'SET_DISTRIBUTION',
    description: 'Updates distribution status.',
    params: [{ name: 'status', description: 'The new status.' }],
    execute: async (params, component) => {
      component.appCommand.emit({
        action: 'SET_DISTRIBUTION',
        parameters: { status: params.status },
      });
    },
  },
  {
    name: 'STUDY',
    description: 'Analyzes a track from your library to learn its style.',
    params: [{ name: 'trackId', description: 'The ID of the track to study.' }],
    execute: async (params, component) => {
      await component.studyTrack(params.trackId);
    },
  },
  {
    name: 'RESEARCH',
    description: 'Researches an artist to learn their production secrets.',
    params: [{ name: 'artist', description: 'The name of the artist.' }],
    execute: async (params, component) => {
      await component.researchArtist(params.artist);
    },
  },
  {
    name: 'MIMIC',
    description:
      "Shifts S.M.U.V.E's persona and studio settings to mimic a learned style.",
    params: [{ name: 'style', description: 'The name or ID of the style.' }],
    execute: async (params, component) => {
      await component.mimicStyle(params.style);
    },
  },
  {
    name: 'KNOWLEDGE',
    description: 'Displays your current Artist Knowledge Base.',
    execute: async (params, component) => {
      component.viewKnowledgeBase();
    },
  },
  {
    name: 'TRENDS',
    description: 'Updates core industry trends and applies recommendations.',
    execute: async (params, component) => {
      await component.updateCoreTrends();
    },
  },
];
