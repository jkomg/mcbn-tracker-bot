import { SlashCommandBuilder } from 'discord.js';
import { calculateXpCost } from '../xpRules';

export const data = new SlashCommandBuilder()
  .setName('xp')
  .setDescription('XP workflow bridge commands')
  .addSubcommand((s) =>
    s
      .setName('summary')
      .setDescription('Get XP summary for a character from the web-app adapter')
      .addStringOption((o) => o.setName('character').setDescription('Character name').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('claim')
      .setDescription('Submit a simple XP claim via adapter')
      .addStringOption((o) => o.setName('character').setDescription('Character name').setRequired(true))
      .addStringOption((o) => o.setName('play_period').setDescription('Period label').setRequired(true))
      .addStringOption((o) => o.setName('category').setDescription('Category key').setRequired(true))
      .addStringOption((o) => o.setName('link').setDescription('Discord post link').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('spend')
      .setDescription('Submit an XP spend request via adapter')
      .addStringOption((o) => o.setName('character').setDescription('Character name').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Spend category')
          .setRequired(true)
          .addChoices(
            { name: 'Attribute', value: 'Attribute' },
            { name: 'Skill', value: 'Skill' },
            { name: 'New Skill', value: 'New Skill' },
            { name: 'Discipline (In-Clan)', value: 'Discipline (In-Clan)' },
            { name: 'Discipline (Out-of-Clan)', value: 'Discipline (Out-of-Clan)' },
            { name: 'Caitiff Discipline', value: 'Caitiff Discipline' },
            { name: 'Blood Sorcery Ritual', value: 'Blood Sorcery Ritual' },
            { name: 'Thin-Blood Alchemy Formula', value: 'Thin-Blood Alchemy Formula' },
            { name: 'Advantage (Merit/Background)', value: 'Advantage (Merit/Background)' },
          ),
      )
      .addStringOption((o) => o.setName('trait').setDescription('Trait name').setRequired(true))
      .addIntegerOption((o) => o.setName('current_dots').setDescription('Current dots').setRequired(true))
      .addIntegerOption((o) => o.setName('new_dots').setDescription('New dots').setRequired(true))
      .addStringOption((o) => o.setName('justification').setDescription('RP rationale').setRequired(true))
      .addBooleanOption((o) => o.setName('is_in_clan').setDescription('In-clan discipline?').setRequired(false)),
  )
  .addSubcommand((s) =>
    s
      .setName('spend-cost')
      .setDescription('Compute V5 XP cost for a spend request')
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Spend category')
          .setRequired(true)
          .addChoices(
            { name: 'Attribute', value: 'Attribute' },
            { name: 'Skill', value: 'Skill' },
            { name: 'New Skill', value: 'New Skill' },
            { name: 'Discipline (In-Clan)', value: 'Discipline (In-Clan)' },
            { name: 'Discipline (Out-of-Clan)', value: 'Discipline (Out-of-Clan)' },
            { name: 'Caitiff Discipline', value: 'Caitiff Discipline' },
            { name: 'Blood Sorcery Ritual', value: 'Blood Sorcery Ritual' },
            { name: 'Thin-Blood Alchemy Formula', value: 'Thin-Blood Alchemy Formula' },
            { name: 'Advantage (Merit/Background)', value: 'Advantage (Merit/Background)' },
          ),
      )
      .addIntegerOption((o) => o.setName('current_dots').setDescription('Current dots').setRequired(true))
      .addIntegerOption((o) => o.setName('new_dots').setDescription('New dots').setRequired(true)),
  );

export const name = 'xp';

export async function execute(interaction: any, { adapter }: any) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'summary') {
    const character = interaction.options.getString('character', true);
    const summary = await adapter.getSummary(character);
    if (!summary) {
      await interaction.reply({ content: `No summary found for ${character}.`, ephemeral: true });
      return;
    }

    await interaction.reply({
      content: [
        `**${summary.characterName}**`,
        `Earned XP: ${summary.earnedXp}`,
        `Total XP: ${summary.totalXp}`,
        `Total Spends: ${summary.totalSpends}`,
        `Available XP: ${summary.availableXp}`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  if (sub === 'claim') {
    const character = interaction.options.getString('character', true);
    const playPeriod = interaction.options.getString('play_period', true);
    const category = interaction.options.getString('category', true);
    const link = interaction.options.getString('link', true);

    const result = await adapter.submitClaim({
      characterName: character,
      playPeriod,
      categories: {
        [category]: link,
      },
    });

    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  if (sub === 'spend') {
    const character = interaction.options.getString('character', true);
    const spendCategory = interaction.options.getString('category', true);
    const traitName = interaction.options.getString('trait', true);
    const currentDots = interaction.options.getInteger('current_dots', true);
    const newDots = interaction.options.getInteger('new_dots', true);
    const isInClan = interaction.options.getBoolean('is_in_clan') ?? false;
    const justification = interaction.options.getString('justification', true);

    const result = await adapter.submitSpend({
      characterName: character,
      spendCategory: spendCategory as any,
      traitName,
      currentDots,
      newDots,
      isInClan,
      justification,
    });

    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  if (sub === 'spend-cost') {
    const category = interaction.options.getString('category', true);
    const currentDots = interaction.options.getInteger('current_dots', true);
    const newDots = interaction.options.getInteger('new_dots', true);

    try {
      const cost = calculateXpCost(category as any, currentDots, newDots);
      await interaction.reply({ content: `Calculated cost: **${cost} XP**`, ephemeral: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request.';
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}
