import { Injectable } from '@angular/core';
import { UserProfile, ProfileAuditLog } from '../types/profile.types';

@Injectable({
  providedIn: 'root',
})
export class AiAuditService {
  calculateStrategicHealth(profile: UserProfile): ProfileAuditLog {
    const deficits: string[] = [];
    const recommendations: string[] = [];
    let score = 85;

    if (profile.catalog.length === 0) {
      score -= 30;
      deficits.push(
        'CRITICAL DEFICIT: CATALOG VACUUM. ZERO ASSETS DETECTED. YOU ARE INVISIBLE.'
      );
      recommendations.push('IMPORT A MASTER IMMEDIATELY. STOP STALLING.');
    } else if (profile.catalog.length < 5) {
      score -= 10;
      deficits.push('INVENTORY DEPTH: SHALLOW. YOUR RELEASE CYCLE IS FRAGILE.');
      recommendations.push(
        'GENERATE 5 MASTERS MINIMUM. SUSTAIN THE ONSLAUGHT.'
      );
    }

    if (!profile.proName || !profile.proIpi) {
      score -= 15;
      deficits.push(
        'LEGAL INVISIBILITY DETECTED. YOU ARE LEAKING ROYALTIES TO THE VOID.'
      );
      recommendations.push('AFFILIATE WITH A PRO. NOW.');
    }

    if (!profile.website) {
      score -= 5;
      deficits.push('BRANDING VOID: OFFICIAL DOMAIN NOT FOUND.');
      recommendations.push('CLAIM YOUR TERRITORY. BUILD THE WEBSITE.');
    }

    if (profile.financials.accounts.length === 0) {
      score -= 10;
      deficits.push('FINANCIAL ANOMALY: PAYOUT CHANNELS SEVERED.');
      recommendations.push('LINK YOUR ACCOUNTS. COLLECT YOUR TRIBUTE.');
    }

    if (
      profile.financials.splitSheets.length === 0 &&
      profile.catalog.length > 3
    ) {
      score -= 5;
      deficits.push(
        'LEGAL VULNERABILITY: UNPROTECTED COLLABORATIONS DETECTED.'
      );
      recommendations.push('EXECUTE SPLIT SHEETS. PROTECT THE EQUITY.');
    }

    if (profile.team.length === 0) {
      score -= 5;
      deficits.push('ISOLATION DETECTED. YOU ARE RUNNING A GHOST SHIP.');
      recommendations.push('RECRUIT ELITES. EXPAND YOUR SQUAD.');
    }

    if (profile.artistIdentity.fingerprint.trustScore < 60) {
      score -= 10;
      deficits.push('IDENTITY FRAGILITY: YOUR FINGERPRINT IS WEAK.');
      recommendations.push('HARDEN YOUR SURFACES. SYNC THE GRAPH.');
    }

    return {
      timestamp: Date.now(),
      score: Math.max(0, Math.min(100, score)),
      deficits,
      recommendations,
      status: score >= 90 ? 'FORTIFIED' : 'VULNERABLE',
      alerts: [],
    };
  }
}
