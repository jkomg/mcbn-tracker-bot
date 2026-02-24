import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { initClientCommandCollection, registerCommands } from './registerCommands';
import { WebAppAdapter } from './services/adapter';
import {
  handleClaimWizardButton,
  handleClaimWizardModal,
  handleClaimWizardSelect,
} from './interactiveClaimWizard';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('Missing BOT_TOKEN. Add it to .env');
}

const webAppBaseUrl = process.env.WEB_APP_BASE_URL ?? 'http://127.0.0.1:5001';
const webAppToken = process.env.WEB_APP_API_TOKEN;
const adapter = new WebAppAdapter(webAppBaseUrl, webAppToken);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

initClientCommandCollection(client);

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user?.tag}`);
  await registerCommands(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      const handled = await handleClaimWizardSelect(interaction);
      if (handled) {
        return;
      }
    }

    if (interaction.isButton()) {
      const handled = await handleClaimWizardButton(interaction, adapter);
      if (handled) {
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const handled = await handleClaimWizardModal(interaction);
      if (handled) {
        return;
      }
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const cmd = (client as any).commands.get(interaction.commandName);
    if (!cmd) {
      return;
    }

    await cmd.execute(interaction, { client, adapter });
  } catch (error: any) {
    const code = error?.code;
    // 40060 means another process/handler already acknowledged this interaction.
    if (code === 40060) {
      console.warn('Ignoring already-acknowledged interaction (code 40060).');
      return;
    }

    console.error('Command failure', error);
    if (!interaction.isRepliable()) {
      return;
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Command failed.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: 'Command failed.', ephemeral: true });
  }
});

client.login(token);
