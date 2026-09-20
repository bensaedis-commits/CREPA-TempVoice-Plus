const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const config = require('../config');

function requireOwner(interaction) {
  const vc = interaction.member.voice.channel;
  if (!vc) return { error: 'You must be inside a temporary voice channel you own.' };
  if (!db.isTemp(vc.id)) return { error: 'This is not a temporary voice channel. Join your private channel first.' };
  const temp = db.getTemp(vc.id);
  if (temp.ownerId !== interaction.user.id) {
    return { error: `Only the voice owner (<@${temp.ownerId}>) can use this. Normal members cannot control the channel.` };
  }
  return { vc, temp };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Control your temporary voice channel - CREPA')
    .addSubcommand(s => s.setName('lock').setDescription('Lock channel (block new joins)'))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock channel'))
    .addSubcommand(s => s.setName('hide').setDescription('Hide channel'))
    .addSubcommand(s => s.setName('show').setDescription('Show channel'))
    .addSubcommand(s => s.setName('ghost').setDescription('Ghost - hide completely'))
    .addSubcommand(s => s.setName('unghost').setDescription('Unghost - make visible'))
    .addSubcommand(s => s.setName('rename').setDescription('Rename channel').addStringOption(o=>o.setName('name').setDescription('New name').setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName('limit').setDescription('Set user limit').addIntegerOption(o=>o.setName('count').setDescription('0 = unlimited').setMinValue(0).setMaxValue(99).setRequired(true)))
    .addSubcommand(s => s.setName('bitrate').setDescription('Change voice quality').addIntegerOption(o=>o.setName('kbps').setDescription('8-96').setMinValue(8).setMaxValue(384).setRequired(true)))
    .addSubcommand(s => s.setName('permit').setDescription('Allow user to join').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('reject').setDescription('Block user from joining').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('kick').setDescription('Kick user from channel').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('claim').setDescription('Claim channel if owner left'))
    .addSubcommand(s => s.setName('transfer').setDescription('Transfer ownership').addUserOption(o=>o.setName('user').setDescription('New owner').setRequired(true)))
    .addSubcommand(s => s.setName('info').setDescription('Show channel info'))
    .addSubcommand(s => s.setName('invite').setDescription('Invite user to channel').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('reset').setDescription('Reset channel permissions'))
    .addSubcommand(s => s.setName('panel').setDescription('Send control panel'))
    .addSubcommand(s => s.setName('delete').setDescription('Delete channel')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'info') {
      const vc = interaction.member.voice.channel;
      if (!vc || !db.isTemp(vc.id)) {
        await interaction.reply({ content: `${config.emojis.error} You must be inside a temporary voice channel.`, ephemeral: true }); return;
      }
      const temp = db.getTemp(vc.id);
      const owner = await interaction.guild.members.fetch(temp.ownerId).catch(()=>null);
      const embed = new EmbedBuilder()
        .setColor(parseInt(config.colors.primary.replace('#',''),16))
        .setTitle(`ℹ️ Channel Info`)
        .setDescription(
          `**Channel:** ${vc} \`${vc.name}\` (\`${vc.id}\`)\n` +
          `**Owner:** ${owner ? `${owner} (${owner.user.tag})` : `<@${temp.ownerId}>`}\n` +
          `**Status:** ${temp.locked ? '🔒 Locked' : '🔓 Open'} | ${temp.hidden ? '🙈 Hidden' : '👁️ Visible'}\n` +
          `**Limit:** ${vc.userLimit || 'Unlimited'} | **Bitrate:** ${vc.bitrate/1000}kbps\n` +
          `**Members:** ${vc.members.size} - ${vc.members.map(m=>m.displayName).join(', ') || 'None'}\n` +
          `**Created:** <t:${Math.floor(temp.createdAt/1000)}:R>\n` +
          `**JTC:** <#${temp.jtcId}>`
        ).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true }); return;
    }

    if (sub === 'claim') {
      const vc = interaction.member.voice.channel;
      if (!vc) { await interaction.reply({ content: `${config.emojis.error} You must be inside a temporary voice channel.`, ephemeral: true}); return; }
      if (!db.isTemp(vc.id)) { await interaction.reply({ content: `${config.emojis.error} This is not a temporary channel.`, ephemeral: true}); return; }
      const temp = db.getTemp(vc.id);
      if (temp.ownerId === interaction.user.id) { await interaction.reply({ content: `${config.emojis.error} You are already the owner!`, ephemeral: true}); return; }
      const ownerInChannel = vc.members.has(temp.ownerId);
      if (ownerInChannel) { await interaction.reply({ content: `${config.emojis.error} The owner is still inside (<@${temp.ownerId}>) - cannot claim.`, ephemeral: true}); return; }
      db.setOwner(vc.id, interaction.user.id);
      try {
        await vc.permissionOverwrites.edit(interaction.user.id, { Connect: true, ViewChannel: true, Speak: true, ManageChannels: true });
      } catch {}
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(parseInt(config.colors.success.replace('#',''),16)).setDescription(`${config.emojis.success} You are now the owner of ${vc}!`)], ephemeral: false });
      return;
    }

    if (sub === 'panel') {
      const vc = interaction.member.voice.channel;
      if (!vc || !db.isTemp(vc.id)) { await interaction.reply({ content: `${config.emojis.error} You must be inside your temporary channel.`, ephemeral: true}); return; }
      const { panelEmbed } = require('../utils/embeds');
      const { getControlRows } = require('../utils/components');
      const embed = panelEmbed(interaction.guild, vc, interaction.member);
      const rows = getControlRows(interaction.guild.id, db.getTemp(vc.id));
      const fs = require('fs'); const path = require('path');
      const bannerPath = path.join(__dirname, '..', '..', 'assets', 'banner.png');
      const files = fs.existsSync(bannerPath) ? [{ attachment: bannerPath, name: 'banner.png' }] : [];
      await interaction.reply({ content: `${interaction.member}`, embeds: [embed], components: rows, files, ephemeral: false });
      return;
    }

    const req = requireOwner(interaction);
    if (req.error) { await interaction.reply({ content: `${config.emojis.error} ${req.error}`, ephemeral: true}); return; }
    const { vc, temp } = req;

    if (sub === 'lock') {
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false });
        db.updateTemp(vc.id, { locked: true });
        const g = db.getGuild(interaction.guild.id);
        if (g.channelNameLocked) {
          const { renderTemplate } = require('../utils/template');
          const newName = renderTemplate(g.channelNameLocked, interaction.member, vc, interaction.guild);
          if (newName !== vc.name) await vc.setName(newName).catch(()=>{});
        }
        await interaction.reply({ content: `🔒 Channel locked - no new users can join.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'unlock') {
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true, ViewChannel: true });
        db.updateTemp(vc.id, { locked: false });
        const g = db.getGuild(interaction.guild.id);
        if (g.channelName) {
          const { renderTemplate } = require('../utils/template');
          const newName = renderTemplate(g.channelName, interaction.member, vc, interaction.guild);
          if (newName !== vc.name) await vc.setName(newName).catch(()=>{});
        }
        await interaction.reply({ content: `🔓 Channel unlocked.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'hide' || sub === 'ghost') {
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: false });
        db.updateTemp(vc.id, { hidden: true });
        await interaction.reply({ content: `🙈 Channel hidden - only allowed users can see it.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'show' || sub === 'unghost') {
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: true });
        db.updateTemp(vc.id, { hidden: false });
        await interaction.reply({ content: `👁️ Channel visible to everyone.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'rename') {
      const name = interaction.options.getString('name');
      try {
        await vc.setName(name);
        await interaction.reply({ content: `✏️ Renamed to \`${name}\``, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'limit') {
      const count = interaction.options.getInteger('count');
      try { await vc.setUserLimit(count); await interaction.reply({ content: `👥 Limit set to **${count === 0 ? 'Unlimited' : count}**`, ephemeral: false });}
      catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'bitrate') {
      const kbps = interaction.options.getInteger('kbps');
      try { await vc.setBitrate(kbps*1000); await interaction.reply({ content: `🎵 Bitrate set to **${kbps}kbps**`, ephemeral: false });}
      catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed (bitrate not allowed): ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'permit') {
      const user = interaction.options.getUser('user');
      try {
        await vc.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true, Speak: true });
        await interaction.reply({ content: `✅ Allowed ${user} to join.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'reject') {
      const user = interaction.options.getUser('user');
      try {
        await vc.permissionOverwrites.edit(user.id, { Connect: false, ViewChannel: false });
        const m = vc.members.get(user.id);
        if (m) try { await m.voice.disconnect('Rejected by owner'); } catch {}
        await interaction.reply({ content: `🚫 Blocked ${user} and kicked if inside.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'kick') {
      const user = interaction.options.getUser('user');
      const m = vc.members.get(user.id);
      if (!m) { await interaction.reply({ content: `${config.emojis.error} ${user} is not inside the channel.`, ephemeral: true}); return; }
      try { await m.voice.disconnect('Kicked by owner'); await interaction.reply({ content: `👢 Kicked ${user}`, ephemeral: false});}
      catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'transfer') {
      const user = interaction.options.getUser('user');
      const m = vc.members.get(user.id);
      if (!m) { await interaction.reply({ content: `${config.emojis.error} New owner must be inside the channel.`, ephemeral: true}); return; }
      db.setOwner(vc.id, user.id);
      try { await vc.permissionOverwrites.edit(user.id, { ManageChannels: true, Connect: true, ViewChannel: true }); } catch {}
      await interaction.reply({ content: `👑 Transferred ownership to ${user}`, ephemeral: false });
      return;
    }
    if (sub === 'invite') {
      const user = interaction.options.getUser('user');
      try {
        await vc.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true });
        await interaction.reply({ content: `✅ Invited ${user} to ${vc} - they can now join.`, ephemeral: false });
        try { const dm = await user.createDM(); await dm.send(`📨 You were invited to voice channel **${vc.name}** in **${interaction.guild.name}** by ${interaction.user.tag}`); } catch {}
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'reset') {
      try {
        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true, ViewChannel: true });
        for (const [id, ow] of vc.permissionOverwrites.cache) {
          if (id !== vc.guild.roles.everyone.id && id !== vc.guildId && id !== db.getTemp(vc.id).ownerId && id !== interaction.client.user.id) {
            await ow.delete().catch(()=>{});
          }
        }
        await vc.setUserLimit(db.getGuild(interaction.guild.id).userLimit || 0).catch(()=>{});
        db.updateTemp(vc.id, { locked: false, hidden: false });
        await interaction.reply({ content: `✅ Permissions reset.`, ephemeral: false });
      } catch (e) { await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}); }
      return;
    }
    if (sub === 'delete') {
      try {
        await interaction.reply({ content: `🗑️ Deleting channel...`, ephemeral: false });
        await vc.delete('Deleted by owner via /voice delete');
        db.deleteTemp(vc.id);
      } catch (e) { await interaction.followUp({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}).catch(()=>{}); }
      return;
    }
  }
};
