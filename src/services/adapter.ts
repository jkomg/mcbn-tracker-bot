import { z } from 'zod';
import type { ClaimPayload, SpendPayload, XpSummary } from '../types';

export interface TrackerAdapter {
  getSummary(characterName: string): Promise<XpSummary | null>;
  submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }>;
  submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }>;
}

const summarySchema = z.object({
  characterName: z.string(),
  earnedXp: z.number(),
  totalXp: z.number(),
  totalSpends: z.number(),
  availableXp: z.number(),
});

export class WebAppAdapter implements TrackerAdapter {
  constructor(private readonly baseUrl: string, private readonly apiToken?: string) {}

  async getSummary(characterName: string): Promise<XpSummary | null> {
    const url = `${this.baseUrl}/api/characters/${encodeURIComponent(characterName)}/summary`;
    const resp = await fetch(url, {
      headers: this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {},
    }).catch(() => null);

    if (!resp || resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      throw new Error(`Web app summary API failed (${resp.status})`);
    }

    const raw = await resp.json();
    return summarySchema.parse(raw);
  }

  async submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }> {
    return this.post('/api/claims', payload, 'Claim submitted to web app API.');
  }

  async submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }> {
    return this.post('/api/spends', payload, 'Spend request submitted to web app API.');
  }

  private async post(path: string, body: unknown, successMessage: string) {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, message: 'Unable to reach web app API.' };
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => 'Unknown API error.');
      return { ok: false, message: `API error ${resp.status}: ${text}` };
    }

    return { ok: true, message: successMessage };
  }
}
