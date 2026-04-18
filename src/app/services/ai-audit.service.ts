import { Injectable, inject } from '@angular/core';
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
        'CRITICAL: Empty Catalog. No assets detected for distribution.'
      );
      recommendations.push(
        'Initialize catalog by importing your first master recording or demo.'
      );
    } else if (profile.catalog.length < 5) {
      score -= 10;
      deficits.push('Low Catalog Depth. Limited inventory for release cycles.');
      recommendations.push(
        'Aim for a minimum of 5 completed tracks to sustain a 6-month release strategy.'
      );
    }

    if (!profile.proName || !profile.proIpi) {
      score -= 15;
      deficits.push('Legal Invisibility: Missing PRO identifiers (IPI/Name).');
      recommendations.push(
        'Register with a Performance Rights Organization (ASCAP, BMI, SESAC) immediately.'
      );
    }

    if (!profile.website) {
      score -= 5;
      deficits.push('Branding Deficit: Missing official website.');
      recommendations.push(
        'Establish a canonical website to anchor your digital identity.'
      );
    }

    if (profile.financials.accounts.length === 0) {
      score -= 10;
      deficits.push('Financial Disconnect: No payout accounts linked.');
      recommendations.push(
        'Link your DistroKid, PayPal, or Stripe account to enable revenue tracking.'
      );
    }

    if (
      profile.financials.splitSheets.length === 0 &&
      profile.catalog.length > 3
    ) {
      score -= 5;
      deficits.push('Legal Risk: Missing split sheets for catalog items.');
      recommendations.push(
        'Generate and sign split sheets for all collaborative works.'
      );
    }

    if (profile.team.length === 0) {
      score -= 5;
      deficits.push('Isolation Alert: No team members identified.');
      recommendations.push(
        'Consider adding your manager, lawyer, or key collaborators to your professional circle.'
      );
    }

    if (profile.artistIdentity.fingerprint.trustScore < 60) {
      score -= 10;
      deficits.push('Identity Fragility: Low trust score in identity graph.');
      recommendations.push(
        'Verify your social surfaces and sync your Spotify for Artist profile.'
      );
    }

    return {
      timestamp: Date.now(),
      score: Math.max(0, Math.min(100, score)),
      deficits,
      recommendations,
      auditType: 'Strategic',
    };
  }
}
