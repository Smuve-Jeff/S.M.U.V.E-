import { Injectable } from '@angular/core';
import { UserProfile, ProfileAuditLog } from '../types/profile.types';

/**
 * Career record audit.
 *
 * The score is completed record checks divided by applicable checks — it is
 * not a market, streaming or revenue assessment. This service used to start
 * every artist at 85 and subtract penalties with claims like "you are leaking
 * royalties to the void", which presented an invented baseline and causal
 * claims as an audit result. Every point now comes from a field the artist
 * actually filled in, and every missing field is named plainly.
 */
@Injectable({
  providedIn: 'root',
})
export class AiAuditService {
  calculateStrategicHealth(profile: UserProfile): ProfileAuditLog {
    const deficits: string[] = [];
    const recommendations: string[] = [];
    let earned = 0;
    let possible = 0;

    // Catalog depth — five works is the stated depth check.
    possible += 25;
    const works = profile.catalog?.length ?? 0;
    if (works >= 5) {
      earned += 25;
    } else if (works > 0) {
      earned += 15;
      deficits.push(
        `Catalog has ${works} work${works === 1 ? '' : 's'}; the depth check is five.`
      );
      recommendations.push('Add more works to the catalog to reach five.');
    } else {
      deficits.push('No catalog works recorded.');
      recommendations.push('Add a master or work to the catalog.');
    }

    // PRO registration requires both halves to count.
    possible += 20;
    if (profile.proName && profile.proIpi) {
      earned += 20;
    } else {
      deficits.push('PRO registration is incomplete.');
      recommendations.push('Record both your PRO name and IPI number.');
    }

    possible += 10;
    if (profile.website) {
      earned += 10;
    } else {
      deficits.push('No official website recorded.');
      recommendations.push('Add your official website.');
    }

    possible += 15;
    if ((profile.financials?.accounts?.length ?? 0) > 0) {
      earned += 15;
    } else {
      deficits.push('No payout account recorded.');
      recommendations.push('Link a payout account.');
    }

    // Split sheets only count once a catalog exists to collaborate on.
    if (works > 3) {
      possible += 10;
      if ((profile.financials?.splitSheets?.length ?? 0) > 0) {
        earned += 10;
      } else {
        deficits.push(
          `No split sheets recorded for a catalog of ${works} works.`
        );
        recommendations.push('Record split sheets for collaborative works.');
      }
    }

    possible += 5;
    if ((profile.team?.length ?? 0) > 0) {
      earned += 5;
    } else {
      deficits.push('No team contacts recorded.');
      recommendations.push('Add a collaborator or team contact.');
    }

    possible += 15;
    const trust = profile.artistIdentity?.fingerprint?.trustScore ?? 0;
    if (trust >= 60) {
      earned += 15;
    } else {
      deficits.push(
        `Identity fingerprint trust is ${trust}%, below the 60% check.`
      );
      recommendations.push(
        'Complete the identity profile to raise its trust score.'
      );
    }

    const score =
      possible > 0 ? Math.round((earned / possible) * 100) : 0;

    return {
      timestamp: Date.now(),
      score,
      deficits,
      recommendations,
      status: score >= 90 ? 'FORTIFIED' : 'VULNERABLE',
      alerts: [],
    };
  }
}
