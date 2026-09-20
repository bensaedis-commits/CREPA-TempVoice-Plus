require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const db = require('./database');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN missing in .env - copy .env.example to .env and fill your token');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

// Load commands with validation
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
      console.log(`[cmd] loaded /${cmd.data.name}`);
    } else {
      console.warn(`[cmd] skipped ${file} - missing data/execute`);
    }
  } catch (e) {
    console.error(`[cmd] failed to load ${file}:`, e.message);
  }
}

// Load events with validation
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  try {
    const event = require(path.join(eventsPath, file));
    if (!event.name || !event.execute) {
      console.warn(`[event] skipped ${file} - missing name/execute`);
      continue;
    }
    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else client.on(event.name, (...args) => event.execute(...args, client));
    console.log(`[event] loaded ${event.name}`);
  } catch (e) {
    console.error(`[event] failed to load ${file}:`, e.message);
  }
}

// Graceful shutdown with DB flush
process.on('SIGINT', () => { try { db.flush(); console.log('\n[DB] saved, exiting'); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { db.flush(); } catch {} process.exit(0); });
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

client.login(TOKEN).catch(e => {
  console.error('❌ Login failed:', e.message);
  console.log('Check DISCORD_TOKEN in .env is correct');
  process.exit(1);
});
