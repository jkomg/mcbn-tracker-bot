import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { TrackerAdapter } from './services/adapter';

const CATEGORY_OPTIONS = [
  { key: 'posted_once', label: 'Posted at least once' },
  { key: 'hunting_awakening', label: 'Hunting / Awakening scene' },
  { key: 'scene_with_another', label: 'Scene with another character' },
  { key: 'conflict', label: 'Conflict with another character' },
  { key: 'combat', label: 'Combat with another character' },
  { key: 'unmitigated_stain', label: 'Unmitigated stain' },
] as const;

const SESSION_TTL_MS = 30 * 60 * 1000;

const CATEGORIES_MENU_ID = 'xp:submit:categories';
const LINKS_BUTTON_ID = 'xp:submit:links';
const SUBMIT_BUTTON_ID = 'xp:submit:confirm';
const CANCEL_BUTTON_ID = 'xp:submit:cancel';
const LINKS_MODAL_ID = 'xp:submit:links-modal';
const LINKS_INPUT_ID = 'links';

type ClaimDraft = {
  characterName: string;
  playPeriod: string;
  categories: string[];
  links: Record<string, string>;
  createdAt: number;
};

const drafts = new Map<string, ClaimDraft>();

function cleanupExpiredDrafts() {
  const now = Date.now();
  for (const [userId, draft] of drafts.entries()) {
    if (now - draft.createdAt > SESSION_TTL_MS) {
      drafts.delete(userId);
    }
  }
}

function getCategoryLabel(key: string): string {
  return CATEGORY_OPTIONS.find((c) => c.key === key)?.label ?? key;
}

function parseLinkLines(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key || !value) {
      continue;
    }
    map[key] = value;
  }
  return map;
}

function renderDraft(draft: ClaimDraft): string {
  const selected = draft.categories.length
    ? draft.categories.map((k) => `- ${getCategoryLabel(k)} (${k})`).join('\n')
    : '- none selected';

  const missingLinks = draft.categories.filter((k) => !draft.links[k]);
  const linksSummary = draft.categories.length
    ? draft.categories
        .map((k) => `- ${k}: ${draft.links[k] ? 'link set' : 'missing'}`)
        .join('\n')
    : '- no selected categories';

  return [
    '**XP Claim Wizard**',
    `Character: **${draft.characterName}**`,
    `Play period: **${draft.playPeriod}**`,
    '',
    '**Selected categories**',
    selected,
    '',
    '**Link status**',
    linksSummary,
    '',
    missingLinks.length
      ? `Status: Missing links for ${missingLinks.length} selected categor${missingLinks.length === 1 ? 'y' : 'ies'}.`
      : 'Status: Ready to submit.',
  ].join('\n');
}

function buildRows(draft: ClaimDraft, disabled = false) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(CATEGORIES_MENU_ID)
    .setPlaceholder('Select claimed categories')
    .setMinValues(1)
    .setMaxValues(CATEGORY_OPTIONS.length)
    .setDisabled(disabled)
    .addOptions(
      CATEGORY_OPTIONS.map((c) =>
        new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.key).setDefault(draft.categories.includes(c.key)),
      ),
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LINKS_BUTTON_ID).setLabel('Add / Update Links').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(SUBMIT_BUTTON_ID).setLabel('Submit Claim').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(CANCEL_BUTTON_ID).setLabel('Cancel').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}

export async function startClaimWizard(
  interaction: any,
  characterName: string,
  playPeriod: string,
) {
  cleanupExpiredDrafts();

  const draft: ClaimDraft = {
    characterName,
    playPeriod,
    categories: [],
    links: {},
    createdAt: Date.now(),
  };
  drafts.set(interaction.user.id, draft);

  await interaction.reply({
    content: renderDraft(draft),
    components: buildRows(draft),
    ephemeral: true,
  });
}

export async function handleClaimWizardSelect(interaction: StringSelectMenuInteraction) {
  if (interaction.customId !== CATEGORIES_MENU_ID) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  draft.categories = [...interaction.values];

  await interaction.update({
    content: renderDraft(draft),
    components: buildRows(draft),
  });
  return true;
}

export async function handleClaimWizardButton(interaction: ButtonInteraction, adapter: TrackerAdapter) {
  if (!interaction.customId.startsWith('xp:submit:')) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  if (interaction.customId === LINKS_BUTTON_ID) {
    const modal = new ModalBuilder().setCustomId(LINKS_MODAL_ID).setTitle('Set Evidence Links');

    const hint = draft.categories.length
      ? `Use one per line: key=https://discord.com/...\n${draft.categories.map((k) => `- ${k}`).join('\n')}`
      : 'Use one per line: key=https://discord.com/...';

    const input = new TextInputBuilder()
      .setCustomId(LINKS_INPUT_ID)
      .setLabel('category_key=message_link pairs')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder(hint.slice(0, 100))
      .setValue(draft.categories.map((k) => `${k}=${draft.links[k] ?? ''}`).join('\n').slice(0, 3900));

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.customId === CANCEL_BUTTON_ID) {
    drafts.delete(interaction.user.id);
    await interaction.update({
      content: 'XP claim wizard cancelled.',
      components: buildRows(draft, true),
    });
    return true;
  }

  if (interaction.customId === SUBMIT_BUTTON_ID) {
    if (draft.categories.length === 0) {
      await interaction.reply({ content: 'Select at least one category first.', ephemeral: true });
      return true;
    }

    const missing = draft.categories.filter((k) => !draft.links[k]);
    if (missing.length > 0) {
      await interaction.reply({
        content: `Missing links for: ${missing.map((k) => `\`${k}\``).join(', ')}. Click Add / Update Links first.`,
        ephemeral: true,
      });
      return true;
    }

    const payloadCategories: Record<string, string> = {};
    for (const key of draft.categories) {
      payloadCategories[key] = draft.links[key];
    }

    const result = await adapter.submitClaim({
      characterName: draft.characterName,
      playPeriod: draft.playPeriod,
      categories: payloadCategories,
    });

    drafts.delete(interaction.user.id);
    await interaction.update({
      content: `${result.message}\n\nWizard closed.`,
      components: buildRows(draft, true),
    });
    return true;
  }

  return false;
}

export async function handleClaimWizardModal(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== LINKS_MODAL_ID) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  const raw = interaction.fields.getTextInputValue(LINKS_INPUT_ID);
  const parsed = parseLinkLines(raw);
  draft.links = { ...draft.links, ...parsed };

  const matched = draft.categories.filter((k) => parsed[k]).length;
  await interaction.reply({
    content: `Saved link entries. Matched ${matched}/${draft.categories.length} selected categories.`,
    ephemeral: true,
  });
  return true;
}
