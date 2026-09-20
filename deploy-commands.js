require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Set DISCORD_TOKEN and CLIENT_ID in .env');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data) {
      commands.push(cmd.data.toJSON());
      console.log(`[deploy] queued /${cmd.data.name}`);
    }
  } catch (e) {
    console.error(`[deploy] failed ${file}:`, e.message);
  }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🚀 Deploying ${commands.length} commands...`);
    let data;
    if (GUILD_ID) {
      console.log(`📍 Guild deploy to ${GUILD_ID} (instant)`);
      data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } else {
      console.log('🌐 Global deploy (may take up to 1 hour)');
      data = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    }
    console.log(`✅ Deployed ${data.length} commands successfully!`);
    data.forEach(c => console.log(` - /${c.name} (${c.id})`));
    console.log(`\n🔊 JTC Mapping pre-configured:`);
    console.log(`   1549444850800140379 → 1549444775785140254`);
    console.log(`   1548720642143162489 → 1547674387283714070`);
  } catch (e) {
    console.error('❌ Deploy failed:', e);
    process.exit(1);
  }
})();
