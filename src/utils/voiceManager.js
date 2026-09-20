const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const config = require('../config');
const { renderTemplate } = require('./template');

async function createTempChannel(member, jtcChannel, guild) {
  const guildSettings = db.getGuild(guild.id);
  // Per-JTC category mapping: voice1 -> category1, voice2 -> category2
  const categoryId = db.getCategoryForJTC(guild.id, jtcChannel.id) || jtcChannel.parentId || guildSettings.categoryId;

  // Enforce max per user
  const owned = db.getTempsByOwner(guild.id, member.id);
  if (owned.length >= (guildSettings.maxChannelsPerUser || 5)) {
    const existingId = owned[0].channelId;
    const existing = guild.channels.cache.get(existingId);
    if (existing) {
      try { await member.voice.setChannel(existing); } catch {}
      return null;
    }
  }

  const counter = db.getTempsByGuild(guild.id).length + 1;
  // Use saved name if exists
  const saved = db.getSavedConfig(guild.id, member.id);
  let nameTemplate = saved?.name || guildSettings.channelName || config.defaultSettings.channelName;
  const name = renderTemplate(nameTemplate, member, jtcChannel, guild, { counter, count: counter });

  // Saved limit or default
  const limit = saved?.limit ?? guildSettings.userLimit ?? 0;

  // Build overwrites
  const overwrites = [
    {
      id: member.id,
      allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Stream, PermissionFlagsBits.UseVAD, PermissionFlagsBits.ManageChannels],
    },
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Speak],
    },
  ];

  // Apply saved locks/hides/soundboard
  const locked = !!saved?.locked;
  const hidden = !!saved?.hidden;
  const sbDisabled = !!saved?.soundboardDisabled;
  if (locked) {
    overwrites[1].deny = [PermissionFlagsBits.Connect];
    overwrites[1].allow = overwrites[1].allow.filter(p => p !== PermissionFlagsBits.Connect);
  }
  if (hidden) {
    if (!overwrites[1].deny) overwrites[1].deny = [];
    overwrites[1].deny.push(PermissionFlagsBits.ViewChannel);
    overwrites[1].allow = overwrites[1].allow.filter(p => p !== PermissionFlagsBits.ViewChannel);
  }
  if (sbDisabled) {
    const UseSoundboard = PermissionFlagsBits.UseSoundboard || (1n << 42n);
    if (!overwrites[1].deny) overwrites[1].deny = [];
    overwrites[1].deny.push(UseSoundboard);
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: categoryId || null,
    userLimit: limit,
    bitrate: guildSettings.bitrate || 64000,
    permissionOverwrites: overwrites,
  });

  db.createTemp(channel.id, guild.id, member.id, jtcChannel.id);
  if (saved) {
    db.updateTemp(channel.id, { locked, hidden, soundboardDisabled: sbDisabled });
  }
  if (saved?.limit !== undefined) {
    db.updateTemp(channel.id, { savedLimit: saved.limit });
  }

  // Move member
  try { await member.voice.setChannel(channel); } catch (e) { console.warn('[voiceManager] move failed', e.message); }

  try { await sendControlPanel(channel, member, guild); } catch (e) { console.warn('[voiceManager] panel failed', e.message); }
  try { await logCreate(guild, member, channel, jtcChannel); } catch {}

  return channel;
}

async function sendControlPanel(tempChannel, ownerMember, guild) {
  const guildSettings = db.getGuild(guild.id);
  if (!guildSettings.interfaceEnabled) return;
  const { panelEmbed } = require('./embeds');
  const { getControlRows } = require('./components');
  const temp = db.getTemp(tempChannel.id);
  const embed = panelEmbed(guild, tempChannel, ownerMember);
  const rows = getControlRows(guild.id, temp);

  const fs = require('fs');
  const path = require('path');
  const bannerPath = path.join(__dirname, '..', '..', 'assets', 'banner.png');
  const hasBanner = fs.existsSync(bannerPath);
  const files = hasBanner ? [{ attachment: bannerPath, name: 'banner.png' }] : [];

  // Mention owner before embed as requested
  const content = `${ownerMember} — Your channel is ready!`;

  let target = null;
  if (guildSettings.controlChannelId) target = guild.channels.cache.get(guildSettings.controlChannelId);
  if (!target) target = tempChannel;

  if (!target || !target.send) return;
  try {
    const msg = await target.send({ content, embeds: [embed], components: rows, files });
    // Store panel message for future updates (Plus-style live panel)
    try { db.setPanel(tempChannel.id, msg.id, target.id); } catch {}
  } catch (e) {
    if (guildSettings.controlChannelId && target.id !== guildSettings.controlChannelId) {
      const alt = guild.channels.cache.get(guildSettings.controlChannelId);
      if (alt?.send) {
        const msg2 = await alt.send({ content, embeds: [embed], components: rows, files });
        try { db.setPanel(tempChannel.id, msg2.id, alt.id); } catch {}
      }
    } else throw e;
  }
}

async function deleteIfEmpty(channel, guild) {
  try {
    if (!channel) return;
    // Fetch fresh channel to ensure accurate member count (cache may lag)
    let fresh = guild.channels.cache.get(channel.id);
    if (!fresh) {
      try { fresh = await guild.channels.fetch(channel.id); } catch { db.deleteTemp(channel.id); return; }
    }
    if (!fresh || fresh.type !== 2) return; // 2 = GuildVoice
    if (db.isJTC(guild.id, fresh.id)) return;
    if (!db.isTemp(fresh.id)) return;
    // Robust empty check: fetch members
    const memberCount = fresh.members ? fresh.members.size : 0;
    // Also check via guild members if needed
    if (memberCount > 0) {
      // Double check: if members cache is stale, fetch via guild
      // If still >0, keep channel
      return;
    }
    // Empty - delete immediately (Plus behavior)
    await fresh.delete('Temp Voice - empty channel auto-cleanup').catch(async (e) => {
      // Fallback: try fetch and delete again
      try {
        const fetched = await guild.channels.fetch(fresh.id);
        if (fetched) await fetched.delete('Temp Voice - cleanup retry').catch(()=>{});
      } catch {}
    });
    db.deleteTemp(fresh.id);
    await logDelete(guild, fresh);
  } catch (e) { console.warn('[voiceManager] deleteIfEmpty', e.message); }
}

async function cleanupEmptyTemps(guild) {
  try {
    const temps = db.getTempsByGuild(guild.id);
    for (const t of temps) {
      const ch = guild.channels.cache.get(t.channelId);
      if (!ch) {
        // Channel not in cache, try fetch
        try {
          const fetched = await guild.channels.fetch(t.channelId).catch(()=>null);
          if (!fetched) { db.deleteTemp(t.channelId); continue; }
          if (fetched.members.size === 0) {
            await fetched.delete('Temp Voice - stale cleanup').catch(()=>{});
            db.deleteTemp(t.channelId);
            await logDelete(guild, fetched);
          }
        } catch { db.deleteTemp(t.channelId); }
        continue;
      }
      if (ch.members.size === 0) {
        await ch.delete('Temp Voice - periodic empty cleanup').catch(()=>{});
        db.deleteTemp(t.channelId);
        await logDelete(guild, ch);
      }
    }
  } catch (e) { console.warn('[cleanupEmptyTemps]', e.message); }
}

async function updatePanel(guild, channel) {
  try {
    const temp = db.getTemp(channel.id);
    if (!temp || !temp.panelMessageId || !temp.panelChannelId) return;
    const ch = guild.channels.cache.get(temp.panelChannelId);
    if (!ch || !ch.send) return;
    try {
      const msg = await ch.messages.fetch(temp.panelMessageId).catch(()=>null);
      if (!msg) return;
      const { panelEmbed } = require('./embeds');
      const { getControlRows } = require('./components');
      // Fetch current owner member for thumbnail
      let ownerMember = null;
      try { ownerMember = await guild.members.fetch(temp.ownerId); } catch {}
      if (!ownerMember) ownerMember = msg.mentions?.members?.first() || guild.members.cache.get(temp.ownerId);
      if (!ownerMember) return;
      const embed = panelEmbed(guild, channel, ownerMember);
      const rows = getControlRows(guild.id, temp);
      await msg.edit({ content: `${ownerMember} — Your channel is ready!`, embeds: [embed], components: rows }).catch(()=>{});
    } catch {}
  } catch (e) { console.warn('[updatePanel]', e.message); }
}

async function autoTransferOwner(guild, channel) {
  try {
    const temp = db.getTemp(channel.id);
    if (!temp) return;
    if (channel.members.has(temp.ownerId)) return; // owner still inside
    if (channel.members.size === 0) return; // will be deleted
    // Pick the member who has been in channel longest (first in collection)
    const nextOwner = channel.members.first();
    if (!nextOwner || nextOwner.user.bot) {
      // Find first non-bot
      const human = channel.members.filter(m=>!m.user.bot).first();
      if (!human) return;
      db.setOwner(channel.id, human.id);
      try { await channel.permissionOverwrites.edit(human.id, { ManageChannels: true, Connect: true, ViewChannel: true }).catch(()=>{}); } catch {}
      await updatePanel(guild, channel);
      return;
    }
    db.setOwner(channel.id, nextOwner.id);
    try { await channel.permissionOverwrites.edit(nextOwner.id, { ManageChannels: true, Connect: true, ViewChannel: true }).catch(()=>{}); } catch {}
    await updatePanel(guild, channel);
    // Notify in voice chat
    const fs = require('fs'); const path = require('path');
    const bannerPath = path.join(__dirname, '..', '..', 'assets', 'banner.png');
    const hasBanner = fs.existsSync(bannerPath);
    const files = hasBanner ? [{ attachment: bannerPath, name: 'banner.png' }] : [];
    const target = channel;
    await target.send({ content: `👑 Auto-transferred ownership to ${nextOwner} (owner left)`, files }).catch(()=>{});
  } catch (e) { console.warn('[autoTransferOwner]', e.message); }
}

async function notifyOwnerLeft(guild, channel, oldOwnerId) {
  try {
    if (!db.isTemp(channel.id)) return;
    if (channel.members.size === 0) return;
    // First try auto-transfer (Plus does this)
    await autoTransferOwner(guild, channel);
    // Then also send claim notification for manual claim (in case auto failed or for others)
    const tempAfter = db.getTemp(channel.id);
    // If auto-transfer succeeded, temp owner will be different, still show notification but less urgent
    const { ownerLeftEmbed } = require('./embeds');
    const { getControlRows } = require('./components');
    const guildSettings = db.getGuild(guild.id);
    const embed = ownerLeftEmbed(guild, channel, oldOwnerId);
    const rows = getControlRows(guild.id, db.getTemp(channel.id));
    const fs = require('fs');
    const path = require('path');
    const bannerPath = path.join(__dirname, '..', '..', 'assets', 'banner.png');
    const hasBanner = fs.existsSync(bannerPath);
    const files = hasBanner ? [{ attachment: bannerPath, name: 'banner.png' }] : [];
    let target = null;
    if (guildSettings.controlChannelId) target = guild.channels.cache.get(guildSettings.controlChannelId);
    if (!target) target = channel;
    if (!target?.send) return;
    // Only send claim notification if there are still members and auto-transfer happened or not
    // To avoid spam, send only if channel still has members
    await target.send({ embeds: [embed], components: rows, files }).catch(()=>{});
  } catch (e) { console.warn('[notifyOwnerLeft]', e.message); }
}

async function logCreate(guild, member, tempChannel, jtcChannel) {
  const s = db.getGuild(guild.id);
  if (!s.logChannelId) return;
  const ch = guild.channels.cache.get(s.logChannelId);
  if (!ch?.send) return;
  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(parseInt(config.colors.success.replace('#',''),16))
    .setTitle(`${config.emojis.voice} Temporary Channel Created`)
    .setDescription(`**Member:** ${member} (${member.user.tag})\n**Channel:** ${tempChannel} \`${tempChannel.name}\`\n**Via JTC:** ${jtcChannel}`)
    .setTimestamp();
  await ch.send({ embeds: [embed] }).catch(()=>{});
}
async function logDelete(guild, channel) {
  const s = db.getGuild(guild.id);
  if (!s.logChannelId) return;
  const ch = guild.channels.cache.get(s.logChannelId);
  if (!ch?.send) return;
  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(parseInt(config.colors.error.replace('#',''),16))
    .setTitle(`${config.emojis.delete} Temporary Channel Deleted`)
    .setDescription(`**Channel:** \`${channel.name}\` (${channel.id})`)
    .setTimestamp();
  await ch.send({ embeds: [embed] }).catch(()=>{});
}

module.exports = { createTempChannel, sendControlPanel, deleteIfEmpty, notifyOwnerLeft, cleanupEmptyTemps, updatePanel, autoTransferOwner };
