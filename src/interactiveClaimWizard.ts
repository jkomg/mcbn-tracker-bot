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

const PAGE_SIZE = 25;
const SESSION_TTL_MS = 30 * 60 * 1000;

const CHARACTER_MENU_ID = 'xp:submit:character';
const PERIOD_MENU_ID = 'xp:submit:period';
const CATEGORIES_MENU_ID = 'xp:submit:categories';
const CHARACTER_PREV_ID = 'xp:submit:character-prev';
const CHARACTER_NEXT_ID = 'xp:submit:character-next';
const PERIOD_PREV_ID = 'xp:submit:period-prev';
const PERIOD_NEXT_ID = 'xp:submit:period-next';
const LINKS_BUTTON_ID = 'xp:submit:links';
const SUBMIT_BUTTON_ID = 'xp:submit:confirm';
const CANCEL_BUTTON_ID = 'xp:submit:cancel';
const LINKS_MODAL_ID = 'xp:submit:links-modal';
const LINKS_INPUT_ID = 'links';

type ClaimDraft = {
  characterName?: string;
  playPeriod?: string;
  availableCharacters: string[];
  openPeriods: string[];
  currentNight: string | null;
  characterPage: number;
  periodPage: number;
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

function truncateLabel(value: string, max = 100): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
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

function pageCount(values: string[]): number {
  return Math.max(1, Math.ceil(values.length / PAGE_SIZE));
}

function pageSlice(values: string[], page: number): string[] {
  const start = page * PAGE_SIZE;
  return values.slice(start, start + PAGE_SIZE);
}

function clampPage(page: number, values: string[]): number {
  const maxPage = pageCount(values) - 1;
  return Math.max(0, Math.min(page, maxPage));
}

function pageForValue(values: string[], value?: string): number {
  if (!value) {
    return 0;
  }
  const idx = values.indexOf(value);
  if (idx < 0) {
    return 0;
  }
  return Math.floor(idx / PAGE_SIZE);
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
    `Character: **${draft.characterName ?? 'not selected'}**`,
    `Play period: **${draft.playPeriod ?? 'not selected'}**`,
    draft.currentNight ? `Current night: **${draft.currentNight}**` : 'Current night: unavailable',
    '',
    '**Selected categories**',
    selected,
    '',
    '**Link status**',
    linksSummary,
    '',
    'Link entry format: `category_key=https://discord.com/channels/...`',
    'After selecting categories, click **Add / Update Links (Required)**.',
    '',
    !draft.characterName || !draft.playPeriod
      ? 'Status: Select character and play period to continue.'
      : missingLinks.length
        ? `Status: Missing links for ${missingLinks.length} selected categor${missingLinks.length === 1 ? 'y' : 'ies'}.`
        : draft.categories.length
          ? 'Status: Ready to submit.'
          : 'Status: Select one or more categories.',
  ].join('\n');
}

function buildRows(draft: ClaimDraft, disabled = false) {
  draft.characterPage = clampPage(draft.characterPage, draft.availableCharacters);
  draft.periodPage = clampPage(draft.periodPage, draft.openPeriods);

  const characterTotalPages = pageCount(draft.availableCharacters);
  const periodTotalPages = pageCount(draft.openPeriods);

  const characterPageValues = pageSlice(draft.availableCharacters, draft.characterPage);
  const periodPageValues = pageSlice(draft.openPeriods, draft.periodPage);

  const characterOptions = characterPageValues.map((name) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateLabel(name))
      .setValue(name)
      .setDefault(draft.characterName === name),
  );

  const periodOptions = periodPageValues.map((label) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateLabel(label))
      .setValue(label)
      .setDefault(draft.playPeriod === label),
  );

  const characterSelect = new StringSelectMenuBuilder()
    .setCustomId(CHARACTER_MENU_ID)
    .setPlaceholder(characterOptions.length ? `Select character (page ${draft.characterPage + 1}/${characterTotalPages})` : 'No active characters available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || characterOptions.length === 0)
    .addOptions(characterOptions.length ? characterOptions : [new StringSelectMenuOptionBuilder().setLabel('No characters').setValue('__none__')]);

  const periodSelect = new StringSelectMenuBuilder()
    .setCustomId(PERIOD_MENU_ID)
    .setPlaceholder(periodOptions.length ? `Select play period (page ${draft.periodPage + 1}/${periodTotalPages})` : 'No open periods available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || periodOptions.length === 0)
    .addOptions(periodOptions.length ? periodOptions : [new StringSelectMenuOptionBuilder().setLabel('No periods').setValue('__none__')]);

  const categoriesEnabled = !!draft.characterName && !!draft.playPeriod;
  const categoriesSelect = new StringSelectMenuBuilder()
    .setCustomId(CATEGORIES_MENU_ID)
    .setPlaceholder('Select claimed categories')
    .setMinValues(1)
    .setMaxValues(CATEGORY_OPTIONS.length)
    .setDisabled(disabled || !categoriesEnabled)
    .addOptions(
      CATEGORY_OPTIONS.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setValue(c.key)
          .setDefault(draft.categories.includes(c.key)),
      ),
    );

  const pagerButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CHARACTER_PREV_ID).setLabel('Char ◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.characterPage <= 0),
    new ButtonBuilder().setCustomId(CHARACTER_NEXT_ID).setLabel('Char ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.characterPage >= characterTotalPages - 1),
    new ButtonBuilder().setCustomId(PERIOD_PREV_ID).setLabel('Period ◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.periodPage <= 0),
    new ButtonBuilder().setCustomId(PERIOD_NEXT_ID).setLabel('Period ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.periodPage >= periodTotalPages - 1),
  );

  const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LINKS_BUTTON_ID).setLabel('Add / Update Links (Required)').setStyle(ButtonStyle.Secondary).setDisabled(disabled || !categoriesEnabled),
    new ButtonBuilder().setCustomId(SUBMIT_BUTTON_ID).setLabel('Submit Claim').setStyle(ButtonStyle.Success).setDisabled(disabled || !categoriesEnabled),
    new ButtonBuilder().setCustomId(CANCEL_BUTTON_ID).setLabel('Cancel').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(characterSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(periodSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categoriesSelect),
    pagerButtons,
    actionButtons,
  ];
}

export async function startClaimWizard(
  interaction: any,
  adapter: TrackerAdapter,
  initialCharacter?: string,
  initialPlayPeriod?: string,
) {
  cleanupExpiredDrafts();

  const context = await adapter.getClaimContext();

  const characterName = initialCharacter && context.activeCharacters.includes(initialCharacter)
    ? initialCharacter
    : undefined;

  const playPeriod = initialPlayPeriod && context.openPeriods.includes(initialPlayPeriod)
    ? initialPlayPeriod
    : context.currentNight ?? undefined;

  const draft: ClaimDraft = {
    characterName,
    playPeriod,
    availableCharacters: context.activeCharacters,
    openPeriods: context.openPeriods,
    currentNight: context.currentNight,
    characterPage: pageForValue(context.activeCharacters, characterName),
    periodPage: pageForValue(context.openPeriods, playPeriod),
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
  if (!interaction.customId.startsWith('xp:submit:')) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  if (interaction.customId === CHARACTER_MENU_ID) {
    const value = interaction.values[0];
    draft.characterName = value === '__none__' ? undefined : value;
    draft.characterPage = pageForValue(draft.availableCharacters, draft.characterName);
  }

  if (interaction.customId === PERIOD_MENU_ID) {
    const value = interaction.values[0];
    draft.playPeriod = value === '__none__' ? undefined : value;
    draft.periodPage = pageForValue(draft.openPeriods, draft.playPeriod);
  }

  if (interaction.customId === CATEGORIES_MENU_ID) {
    draft.categories = [...interaction.values];
  }

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

  if (interaction.customId === CHARACTER_PREV_ID) {
    draft.characterPage = clampPage(draft.characterPage - 1, draft.availableCharacters);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === CHARACTER_NEXT_ID) {
    draft.characterPage = clampPage(draft.characterPage + 1, draft.availableCharacters);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === PERIOD_PREV_ID) {
    draft.periodPage = clampPage(draft.periodPage - 1, draft.openPeriods);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === PERIOD_NEXT_ID) {
    draft.periodPage = clampPage(draft.periodPage + 1, draft.openPeriods);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === LINKS_BUTTON_ID) {
    if (!draft.characterName || !draft.playPeriod) {
      await interaction.reply({ content: 'Select character and play period first.', ephemeral: true });
      return true;
    }

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
    if (!draft.characterName || !draft.playPeriod) {
      await interaction.reply({ content: 'Select character and play period first.', ephemeral: true });
      return true;
    }

    if (draft.categories.length === 0) {
      await interaction.reply({ content: 'Select at least one category first.', ephemeral: true });
      return true;
    }

    const missing = draft.categories.filter((k) => !draft.links[k]);
    if (missing.length > 0) {
      await interaction.reply({
        content: `Missing links for: ${missing.map((k) => `\`${k}\``).join(', ')}. Click Add / Update Links (Required) first.`,
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
