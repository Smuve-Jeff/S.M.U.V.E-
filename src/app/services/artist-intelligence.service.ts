import { Injectable } from '@angular/core';
import type { UserProfile } from './user-profile.service';

export interface ArtistIntelligenceReport {
  genreContext: string;
  strengths: string[];
  weaknesses: string[];
  evidence: string[];
  nextBestMoves: string[];
  differentiationScore: number;
}

@Injectable({ providedIn: 'root' })
export class ArtistIntelligenceService {
  analyze(profile: UserProfile): ArtistIntelligenceReport {
    const p: any = profile || {};
    const journey: any = p.musicalJourney || {};
    const blueprint: any = journey.musicBlueprint || {};
    const present = (value: any) => value !== undefined && value !== null && value !== '' &&
      !(Array.isArray(value) && value.length === 0);
    const count = (values: any[]) => values.filter(present).length;
    const percent = (value: number, total: number) => Math.round((value / total) * 100);
    const genre = p.primaryGenre || 'Unspecified';
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const evidence: string[] = [];
    const nextBestMoves: string[] = [];

    const identity = count([p.artistName, journey.artistNameMeaning, journey.originStory,
      journey.firstSong, journey.breakthroughMoment, blueprint.signatureTension,
      blueprint.livedWorldDetails]);
    const sonic = count([genre, journey.subgenres, journey.musicalInfluences,
      journey.signatureSound, blueprint.vocalDelivery, blueprint.rhythmicFeel,
      blueprint.harmonicLanguage, blueprint.arrangementApproach,
      blueprint.sonicNonNegotiables]);
    const execution = count([journey.productionPhilosophy, journey.songwritingProcess,
      blueprint.recordingPriorities, blueprint.mixingPriorities,
      journey.preferredBpmRange, journey.signatureGear]);
    const audience = count([blueprint.audienceProfile, blueprint.artisticIntent,
      blueprint.recognitionCue, p.brandVoices, journey.visualAesthetic,
      journey.contentStrategy]);
    const business = count([p.strategicGoals, journey.incomeStreams,
      journey.releaseVelocity, journey.primarySuccessMetric, journey.currentFocus,
      journey.collaborationGoals]);

    if (percent(identity, 7) >= 70) {
      strengths.push('A traceable musical journey with personal origin and turning-point evidence.');
      evidence.push('Origin, first-song, breakthrough, and point-of-view signals are connected.');
    } else {
      weaknesses.push('The personal journey is too thin to distinguish the artist from peers in the same genre.');
      nextBestMoves.push('Document one specific origin detail and one moment that changed the artist’s trajectory.');
    }
    if (percent(sonic, 9) >= 70) {
      strengths.push(`A defined ${genre} foundation supported by personal sonic choices.`);
      evidence.push('Genre is treated as a starting context, supported by delivery, groove, harmony, arrangement, or sonic rules.');
    } else {
      weaknesses.push('Genre is present, but the sonic fingerprint lacks enough specific choices for reliable production interpretation.');
      nextBestMoves.push('Define the signature sound, rhythmic pocket, lead delivery, and one sonic non-negotiable.');
    }
    if (percent(execution, 6) >= 70) strengths.push('A repeatable creative process and technical direction are visible.');
    else {
      weaknesses.push('Production preferences are not specific enough to turn taste into repeatable studio decisions.');
      nextBestMoves.push('Choose recording and mixing priorities S.M.U.V.E. must preserve in every session.');
    }
    if (percent(audience, 6) >= 70) {
      strengths.push('The artist has a clear emotional job and listener context for the music.');
      evidence.push('Audience, intent, brand, or recognition-cue language can drive content and promotion.');
    } else {
      weaknesses.push('Audience and recognition signals are underdefined, so promotion risks generic genre language.');
      nextBestMoves.push('Describe who needs this music, when they need it, and what they should recognize in ten seconds.');
    }
    if (percent(business, 6) >= 70) strengths.push('The profile connects creative direction to a practical career path.');
    else {
      weaknesses.push('The operating plan is incomplete: management and marketing lack a current mission or success metric.');
      nextBestMoves.push('Select one current mission, one success metric, and the income streams worth building next.');
    }

    const differentiationScore = percent(count([journey.signatureSound, blueprint.signatureTension,
      blueprint.livedWorldDetails, blueprint.sonicNonNegotiables, blueprint.recognitionCue,
      blueprint.artisticIntent]), 6);
    if (differentiationScore >= 67) strengths.push('A distinctiveness core is present: sound, point of view, world, rules, or recognition cues.');
    else {
      weaknesses.push('The profile describes what the artist does, but not yet why only this artist can do it.');
      nextBestMoves.push('Complete at least two differentiation anchors: tension, lived-world detail, sonic rule, or recognition cue.');
    }

    return {
      genreContext: `${genre} is a reference frame, not an identity verdict. Interpret every recommendation through the artist's own evidence.`,
      strengths,
      weaknesses,
      evidence,
      nextBestMoves: [...new Set(nextBestMoves)].slice(0, 5),
      differentiationScore,
    };
  }
}
