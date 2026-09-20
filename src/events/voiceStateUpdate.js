const db = require('../database');
const { createTempChannel, deleteIfEmpty, notifyOwnerLeft } = require('../utils/voiceManager');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member) return;

    // Joining a JTC channel -> create temp channel in its mapped category
    if (newState.channelId && db.isJTC(guild.id, newState.channelId)) {
      const jtcChannel = guild.channels.cache.get(newState.channelId);
      if (!jtcChannel) return;
      // Prevent rapid double creation
      if (member.voice.channelId !== newState.channelId) return;
      try {
        await createTempChannel(member, jtcChannel, guild);
      } catch (e) {
        console.error('[voiceStateUpdate] createTemp failed', e);
      }
      return;
    }

    // Leaving a temp channel
    if (oldState.channelId) {
      const leftChannel = guild.channels.cache.get(oldState.channelId) || oldState.channel;
      if (leftChannel && db.isTemp(leftChannel.id)) {
        const temp = db.getTemp(leftChannel.id);
        const fresh = guild.channels.cache.get(leftChannel.id);
        if (fresh) {
          if (fresh.members.size === 0) {
            const gSettings = db.getGuild(guild.id);
            const delay = gSettings.deleteDelayMs || 0;
            if (delay > 0) setTimeout(() => deleteIfEmpty(guild.channels.cache.get(leftChannel.id), guild), delay);
            else await deleteIfEmpty(fresh, guild);
          } else {
            // Owner left but channel still has members -> notify Claim available
            if (temp && temp.ownerId === oldState.id) {
              try { await notifyOwnerLeft(guild, fresh, temp.ownerId); } catch {}
            }
          }
        } else {
          db.deleteTemp(leftChannel.id);
        }
      }
    }
  }
};
