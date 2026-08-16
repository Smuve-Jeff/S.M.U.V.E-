import { createInitialArtistIdentity } from './artist-identity.types';
export const initialProfile: UserProfile = {
  settings: {
    ui: {
      theme: 'Dark',
      performanceMode: false,
      showScanlines: false,
      animationsEnabled: true,
      autoPianoRoll: false,
      beginnerMode: true,
    },
    audio: {
      masterVolume: 0.8,
      autoSaveEnabled: true,
      sampleRate: 48000,
      bufferSize: 256,
      defaultExportFormat: 'wav',
    },
    ai: {
      kbWriteAccess: true,
      // Default commander persona changed to the platform's ominous persona
      // so the S.M.U.V.E voice uses the intended character unless the user
      // explicitly changes it in Settings. Profanity and intensity are
      // enabled by default to match the requested behavior; voice
      // shape-shifting remains enabled.
      commanderPersona: 'Ominous Dominator',
      aiMimicEnabled: false,
      aiProfanityEnabled: true,
      aiPersonaIntensityEnabled: true,
      autoAuditEnabled: false,
      aiTotalControlEnabled: false,
      aiConversationalTier: 'Standard',
      aiVoiceShapeShiftEnabled: true,
    },
    studio: {
      defaultQuantize: '1/16',
      autoMixEnabled: false,
      latencyCompensation: 0,
      highFidelityExport: true,
      stageFxEnabled: true,
    },
    dj: {
      crossfaderCurve: 'linear',
      hamsterMode: false,
      vinylMode: true,
      visualCuePoints: true,
    },
    security: {
      twoFactorEnabled: false,
      endToEndEncryption: false,
    },
  },
  // ...rest of the profile object unchanged (trimmed for brevity)
} as any;
