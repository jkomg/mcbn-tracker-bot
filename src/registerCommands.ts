import { Client, Collection, REST, Routes } from 'discord.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

export async function registerCommands(client: Client) {
  const commands: any[] = [];
  const commandsPath = path.join(__dirname, 'commands');

  for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) {
      continue;
    }

    const mod = require(path.join(commandsPath, file));
    if (mod.data) {
      commands.push(mod.data.toJSON());
    }
    if (mod.name && mod.execute) {
      (client as any).commands.set(mod.name, mod);
    }
  }

  const token = process.env.BOT_TOKEN as string | undefined;
  const clientId = process.env.CLIENT_ID as string | undefined;
  const guildId = process.env.TEST_GUILD_ID as string | undefined;

  if (!token || !clientId) {
    console.log('BOT_TOKEN and CLIENT_ID are required for command registration.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Registered ${commands.length} command(s) to guild ${guildId}`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`Registered ${commands.length} global command(s)`);
}

export function initClientCommandCollection(client: Client) {
  (client as any).commands = new Collection();
}
