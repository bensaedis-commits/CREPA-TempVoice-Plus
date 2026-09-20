const db = require('../database');
const { createTempChannel, deleteIfEmpty, notifyOwnerLeft, cleanupEmptyTemps } = require('../utils/voiceManager');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member) return;

    // Joining a JTC -> create temp in mapped category (voice1->cat1, voice2->cat2)
    if (newState.channelId && db.isJTC(guild.id, newState.channelId)) {
      // Prevent double trigger if already in JTC
      if (oldState.channelId === newState.channelId) return;
      const jtcChannel = guild.channels.cache.get(newState.channelId);
      if (!jtcChannel) return;
      try {
        await createTempChannel(member, jtcChannel, guild);
      } catch (e) {
        console.error('[voiceStateUpdate] createTemp failed', e);
      }
      return;
    }

    // Handle leaving/moving - check old channel for emptiness
    if (oldState.channelId) {
      const leftId = oldState.channelId;
      // Don't clean JTC channels
      if (!db.isJTC(guild.id, leftId) && db.isTemp(leftId)) {
        const leftChannel = guild.channels.cache.get(leftId);
        // If channel still cached, check if empty now
        if (leftChannel) {
          // Small delay to let cache update (Plus does instant but with slight debounce)
          setTimeout(async () => {
            const fresh = guild.channels.cache.get(leftId);
            if (fresh && fresh.members.size === 0) {
              await deleteIfEmpty(fresh, guild);
            } else if (fresh && fresh.members.size > 0) {
              // Check if owner left -> notify claim
              const temp = db.getTemp(leftId);
              if (temp && temp.ownerId === oldState.id) {
                const stillHasOwner = fresh.members.has(temp.ownerId);
                if (!stillHasOwner) {
                  try { await notifyOwnerLeft(guild, fresh, temp.ownerId); } catch {}
                }
              }
            }
          }, 300);
        } else {
          // Channel not in cache, try fetch
          try {
            const fetched = await guild.channels.fetch(leftId).catch(()=>null);
            if (!fetched) {
              db.deleteTemp(leftId);
            } else if (fetched.members.size === 0) {
              await deleteIfEmpty(fetched, guild);
            }
          } catch { db.deleteTemp(leftId); }
        }
      }
    }

    // Also handle moving to a new temp channel (someone joins existing temp) - no action needed

    // Periodic sweep: clean any empty temps in this guild (catches missed events)
    // Debounced to avoid spam
    if (guild._cleanupTimeout) clearTimeout(guild._cleanupTimeout);
    guild._cleanupTimeout = setTimeout(() => {
      cleanupEmptyTemps(guild).catch(()=>{});
    }, 1500);
  }
};
