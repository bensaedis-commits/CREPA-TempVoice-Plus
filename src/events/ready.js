const { ActivityType } = require('discord.js');
const db = require('../database');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag} | ID: ${client.user.id}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guild(s)`);

    // Pre-load guild configs with CREPA JTC mapping
    for (const guild of client.guilds.cache.values()) {
      db.getGuild(guild.id); // ensures CREPA voices are registered
      const temps = db.getTempsByGuild(guild.id);
      for (const t of temps) {
        const ch = guild.channels.cache.get(t.channelId);
        if (!ch) {
          db.deleteTemp(t.channelId);
          console.log(`[cleanup] removed stale DB entry ${t.channelId}`);
        }
      }
      const g = db.getGuild(guild.id);
      console.log(`[config] ${guild.name}: JTCs ${g.jtcChannels.join(', ')} | Categories ${JSON.stringify(g.jtcCategories)}`);
    }

    client.user.setPresence({
      activities: [{ name: 'CREPA • 9 Buttons | /help', type: ActivityType.Watching }],
      status: 'online'
    });
    console.log('🚀 CREPA Temp Voice (Plus Clone) ready! 9 buttons • Neon Red • English');
    console.log('🔊 JTC Mapping: 1549444850800140379 → 1549444775785140254 | 1548720642143162489 → 1547674387283714070');
  }
};
