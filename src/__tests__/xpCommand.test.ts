import { describe, expect, it, vi } from 'vitest';
import { execute } from '../commands/xp';

describe('xp claim command validation', () => {
  it('rejects invalid discord message links before sending to adapter', async () => {
    const reply = vi.fn();
    const adapter = {
      submitClaim: vi.fn(),
    };

    const interaction = {
      id: 'interaction-1',
      user: { id: 'user-1' },
      guildId: 'guild-1',
      options: {
        getSubcommand: vi.fn(() => 'claim'),
        getString: vi.fn((name: string) => {
          const values: Record<string, string> = {
            character: 'Alice',
            play_period: 'Night 1',
            category: 'posted_once',
            link: 'https://example.com/not-a-discord-link',
          };
          return values[name];
        }),
      },
      reply,
    } as any;

    await execute(interaction, { adapter });

    expect(adapter.submitClaim).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content:
        'Invalid Discord message link. Expected format: https://discord.com/channels/<guild>/<channel>/<message>',
      ephemeral: true,
    });
  });
});
