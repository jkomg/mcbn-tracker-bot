import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { initClientCommandCollection, registerCommands } from './registerCommands';
import { WebAppAdapter } from './services/adapter';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('Missing BOT_TOKEN. Add it to .env');
}

const webAppBaseUrl = process.env.WEB_APP_BASE_URL ?? 'http://127.0.0.1:5001';
const webAppToken = process.env.WEB_APP_API_TOKEN;
const adapter = new WebAppAdapter(webAppBaseUrl, webAppToken);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

initClientCommandCollection(client);

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user?.tag}`);
  await registerCommands(client);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const cmd = (client as any).commands.get(interaction.commandName);
  if (!cmd) {
    return;
  }

  try {
    await cmd.execute(interaction, { client, adapter });
  } catch (error) {
    console.error('Command failure', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Command failed.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: 'Command failed.', ephemeral: true });
  }
});

client.login(token);
