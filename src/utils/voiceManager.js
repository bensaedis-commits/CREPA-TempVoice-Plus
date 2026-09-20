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
    await target.send({ content, embeds: [embed], components: rows, files });
  } catch (e) {
    if (guildSettings.controlChannelId && target.id !== guildSettings.controlChannelId) {
      const alt = guild.channels.cache.get(guildSettings.controlChannelId);
      if (alt?.send) await alt.send({ content, embeds: [embed], components: rows, files });
    } else throw e;
  }
}

async function deleteIfEmpty(channel, guild) {
  try {
    if (!channel) return;
    if (channel.members.size > 0) return;
    if (db.isJTC(guild.id, channel.id)) return;
    if (!db.isTemp(channel.id)) return;
    await channel.delete('Temp Voice - empty channel cleanup').catch(()=>{});
    db.deleteTemp(channel.id);
    await logDelete(guild, channel);
  } catch (e) { console.warn('[voiceManager] deleteIfEmpty', e.message); }
}

async function notifyOwnerLeft(guild, channel, oldOwnerId) {
  try {
    if (!db.isTemp(channel.id)) return;
    if (channel.members.size === 0) return;
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

module.exports = { createTempChannel, sendControlPanel, deleteIfEmpty, notifyOwnerLeft };
