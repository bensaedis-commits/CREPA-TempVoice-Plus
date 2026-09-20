const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const fs = require('fs');
const path = require('path');

function c(hex) { return parseInt(hex.replace('#',''), 16); }

// CREPA custom emojis for decoration
const EM = {
  lock: '<:Lock:1551300050309877842>',
  hide: '<:Hide:1551299778455801887>',
  kick: '<:Kick:1551299873372905517>',
  rename: '<:Rename:1551300152034201641>',
  limit: '<:Limite:1551299963579793589>',
  claim: '<:download:1551299686739083364>',
  soundboard: '<:SoundboardOff:1551300476337913916>',
  save: '<:Save:1551300270363902033>',
  call: '<:CallStaff:1551299011242364990>',
};

const RED = '#DC2626';
const RED_INT = 14423100; // #DC2626

function hasBannerFile() {
  try {
    return fs.existsSync(path.join(__dirname, '..', '..', 'assets', 'banner.png'));
  } catch { return false; }
}

function successEmbed(title, description) {
  const e = new EmbedBuilder().setColor(c(config.colors.success)).setTitle(`${EM.save} ${title}`).setDescription(description).setTimestamp();
  if (hasBannerFile()) e.setImage('attachment://banner.png');
  return e;
}
function errorEmbed(title, description) {
  const e = new EmbedBuilder().setColor(c(config.colors.error)).setTitle(`❌ ${title}`).setDescription(description).setTimestamp();
  if (hasBannerFile()) e.setImage('attachment://banner.png');
  return e;
}
function infoEmbed(title, description) {
  const e = new EmbedBuilder().setColor(RED_INT).setTitle(`${EM.call} ${title}`).setDescription(description).setTimestamp();
  if (hasBannerFile()) e.setImage('attachment://banner.png');
  return e;
}

// Main Panel Embed - Professional Red Neon with mention + thumbnail + timer + Banner
function panelEmbed(guild, channel, ownerMember) {
  const db = require('../database');
  const temp = db.getTemp(channel.id);
  const hasSaved = temp ? db.hasSavedConfig(guild.id, temp.ownerId) : false;

  const createdAt = temp ? Math.floor(temp.createdAt / 1000) : Math.floor(Date.now()/1000);
  const lockStatus = temp?.locked ? `${EM.lock} Locked` : `${EM.lock} Open`;
  const hideStatus = temp?.hidden ? `${EM.hide} Hidden` : `${EM.hide} Visible`;
  const sbStatus = temp?.soundboardDisabled ? `${EM.soundboard} Disabled` : `${EM.soundboard} Enabled`;
  const saveStatus = hasSaved ? `${EM.save} Saved` : `${EM.save} Not Saved`;

  const memberList = channel.members.map(m => m.toString()).join(', ') || 'No one';
  const memberCount = channel.members.size;

  const embed = new EmbedBuilder()
    .setColor(RED_INT)
    .setAuthor({ name: `Control Panel — ${channel.name}`, iconURL: ownerMember.displayAvatarURL({ extension: 'png', size: 128 }) || guild.iconURL() || undefined })
    .setTitle(`${EM.call} CREPA Voice Panel`)
    .setDescription(
      `Welcome ${ownerMember} — This is your private voice channel!\n` +
      `${ownerMember} You are the owner, control everything with the **9 buttons** below.\n\n` +
      `**${EM.lock} Status:** ${lockStatus} • **${EM.hide} Visibility:** ${hideStatus}\n` +
      `**${EM.limit} Limit:** ${channel.userLimit || '∞ Unlimited'} • **${EM.soundboard} Soundboard:** ${sbStatus}\n` +
      `**${EM.save} Save:** ${saveStatus}\n\n` +
      `**Use the 9 buttons below — each button is emoji only, no text**`
    )
    .addFields(
      { name: `${EM.call} Owner`, value: `<@${temp ? temp.ownerId : ownerMember.id}>`, inline: true },
      { name: `⏱️ Duration`, value: `<t:${createdAt}:R>\n<t:${createdAt}:T>`, inline: true },
      { name: `${EM.limit} Members`, value: `**${memberCount}** / ${channel.userLimit || '∞'}\n${memberList.length > 1024 ? memberList.slice(0,1020)+'...' : memberList}`, inline: false },
      { name: `${EM.kick} Buttons`, value: `${EM.lock} Lock • ${EM.hide} Hide • ${EM.kick} Kick • ${EM.rename} Rename • ${EM.limit} Limit`, inline: false },
      { name: `${EM.claim} More`, value: `${EM.claim} Claim • ${EM.soundboard} Sound • ${EM.save} Save • ${EM.call} Call Admin`, inline: false },
    )
    .setThumbnail(ownerMember.displayAvatarURL({ extension: 'png', size: 256 }) || guild.iconURL() || undefined)
    .setFooter({ text: `CREPA • ${guild.name} • 9 Buttons • Neon Red`, iconURL: guild.iconURL() || undefined })
    .setTimestamp();

  if (hasBannerFile()) {
    embed.setImage('attachment://banner.png');
  } else {
    const db2 = require('../database');
    const guildCfg = db2.getGuild(guild.id);
    const bannerUrl = guildCfg.bannerUrl || config.bannerUrl;
    if (bannerUrl) embed.setImage(bannerUrl);
  }

  return embed;
}

// Secondary Kick selection embed
function kickSelectEmbed(guild, channel) {
  const embed = new EmbedBuilder()
    .setColor(RED_INT)
    .setAuthor({ name: `Kick Member — ${channel.name}`, iconURL: guild.iconURL() || undefined })
    .setTitle(`${EM.kick} Select Member to Kick`)
    .setDescription(
      `Select a member from the menu below to **kick and block them from rejoining**.\n` +
      `${EM.kick} They will be blocked via **Reject** automatically.\n\n` +
      `**${EM.limit} Current Members:**\n${channel.members.filter(m=>!m.user.bot).map(m=>`• ${m} — \`${m.displayName}\``).join('\n') || 'No one'}\n\n` +
      `*Select from the menu and they will be kicked instantly*`
    )
    .setThumbnail(guild.iconURL() || undefined)
    .setFooter({ text: `CREPA • Kick + Block`, iconURL: guild.iconURL() || undefined })
    .setTimestamp();
  if (hasBannerFile()) embed.setImage('attachment://banner.png');
  return embed;
}

// Owner left - Claim available
function ownerLeftEmbed(guild, channel, oldOwnerId) {
  const embed = new EmbedBuilder()
    .setColor(RED_INT)
    .setAuthor({ name: `Owner Left — Claim Available!`, iconURL: guild.iconURL() || undefined })
    .setTitle(`${EM.claim} Claim This Channel Now!`)
    .setDescription(
      `Owner ${EM.claim} <@${oldOwnerId}> left the channel ${channel}.\n\n` +
      `**First person to press** ${EM.claim} will become the new owner and control all 9 buttons!\n` +
      `**Press button 6** ${EM.claim} below to claim instantly.\n\n` +
      `*Channel will stay open until someone claims it — Members remaining: ${channel.members.size}*`
    )
    .setThumbnail(guild.iconURL() || undefined)
    .setFooter({ text: `CREPA • Claim Available`, iconURL: guild.iconURL() || undefined })
    .setTimestamp();
  if (hasBannerFile()) embed.setImage('attachment://banner.png');
  return embed;
}

// Call Admin embed
function callAdminEmbed(guild, channel, callerMember) {
  const db = require('../database');
  const g = db.getGuild(guild.id);
  const roleId = g.staffRoleId || "1548676119249821816";
  const embed = new EmbedBuilder()
    .setColor(RED_INT)
    .setAuthor({ name: `Help Request — Call Admin`, iconURL: callerMember.displayAvatarURL({ extension: 'png', size: 128 }) || guild.iconURL() || undefined })
    .setTitle(`${EM.call} ${callerMember.displayName} Needs Help!`)
    .setDescription(
      `${EM.call} **${callerMember}** requested staff assistance in their voice channel!\n\n` +
      `**${EM.rename} Channel:** ${channel} \`${channel.name}\` (\`${channel.id}\`)\n` +
      `**${EM.claim} Owner:** <@${callerMember.id}>\n` +
      `**${EM.limit} Members:** ${channel.members.map(m=>m.displayName).join(', ') || 'No one'} **(${channel.members.size})**\n\n` +
      `⏱️ <t:${Math.floor(Date.now()/1000)}:R> — Please join the channel and check.`
    )
    .setThumbnail(callerMember.displayAvatarURL({ extension: 'png', size: 256 }) || guild.iconURL() || undefined)
    .setFooter({ text: `CREPA Staff • ${guild.name} • Neon Red`, iconURL: guild.iconURL() || undefined })
    .setTimestamp();
  if (hasBannerFile()) embed.setImage('attachment://banner.png');
  return {
    content: `<@&${roleId}>`,
    embeds: [embed],
    allowedMentions: { roles: [roleId] }
  };
}

function helpEmbed() {
  const embed = new EmbedBuilder()
    .setColor(RED_INT)
    .setTitle(`${EM.call} CREPA Temp Voice — 9 Buttons`)
    .setDescription(
      `Temporary voice channels with **9 neon red buttons** for CREPA.\n\n` +
      `**⚡ How it works:** Join ➕ Join to Create and get your private channel with Panel + 9 buttons (each button **emoji only**).\n\n` +
      `**🎛️ 9 Buttons:**\n` +
      `${EM.lock} **Lock/Unlock** - Lock/Unlock channel\n` +
      `${EM.hide} **Hide/Show** - Hide/Show channel\n` +
      `${EM.kick} **Kick** - Kick + block menu\n` +
      `${EM.rename} **Rename** - Change name via modal\n` +
      `${EM.limit} **Limit** - 0-99\n` +
      `${EM.claim} **Claim** - Claim when owner leaves + auto mention\n` +
      `${EM.soundboard} **Soundboard** - Toggle soundboard\n` +
      `${EM.save} **Save/Reset** - Save settings for next time\n` +
      `${EM.call} **Call Admins** - Mention <@&1548676119249821816>\n\n` +
      `**Admin Commands:**\n` +
      `\`/setup create\` - Create JTC\n` +
      `\`/setup config\` - Show config\n` +
      `\`/setup banner\` - Set banner\n` +
      `\`/voice\` - Alternative commands`
    )
    .setFooter({ text: 'CREPA • 9 Buttons • Neon Red #DC2626' })
    .setTimestamp();
  if (hasBannerFile()) embed.setImage('attachment://banner.png');
  return embed;
}

module.exports = { successEmbed, errorEmbed, infoEmbed, panelEmbed, kickSelectEmbed, ownerLeftEmbed, callAdminEmbed, helpEmbed, c, EM };
