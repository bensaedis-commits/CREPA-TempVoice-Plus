const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup temporary voice system - CREPA Plus Clone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(s => s.setName('create').setDescription('Create a new Join to Create channel')
      .addChannelOption(o => o.setName('category').setDescription('Category for JTC (optional)').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
      .addStringOption(o => o.setName('name').setDescription('JTC channel name (default: ➕ Join to Create)').setRequired(false))
    )
    .addSubcommand(s => s.setName('delete').setDescription('Remove a JTC channel')
      .addChannelOption(o => o.setName('channel').setDescription('JTC channel to remove').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    )
    .addSubcommand(s => s.setName('config').setDescription('Show current configuration'))
    .addSubcommand(s => s.setName('name').setDescription('Change temp channel name template')
      .addStringOption(o => o.setName('template').setDescription('Template e.g. {username} · {game} (supports {username} {tag} {count} {game})').setRequired(true))
    )
    .addSubcommand(s => s.setName('limit').setDescription('Set default user limit')
      .addIntegerOption(o => o.setName('limit').setDescription('0 = unlimited (0-99)').setMinValue(0).setMaxValue(99).setRequired(true))
    )
    .addSubcommand(s => s.setName('bitrate').setDescription('Set default bitrate')
      .addIntegerOption(o => o.setName('bitrate').setDescription('8000 - 96000').setMinValue(8000).setMaxValue(384000).setRequired(true))
    )
    .addSubcommand(s => s.setName('category').setDescription('Set category for temp channels')
      .addChannelOption(o => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    )
    .addSubcommand(s => s.setName('control-channel').setDescription('Set control panel channel')
      .addChannelOption(o => o.setName('channel').setDescription('Text channel for control panel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    )
    .addSubcommand(s => s.setName('logs').setDescription('Set logs channel')
      .addChannelOption(o => o.setName('channel').setDescription('Logs channel (leave empty to disable)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
    )
    .addSubcommand(s => s.setName('interface').setDescription('Enable/disable button panel')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable panel?').setRequired(true))
    )
    .addSubcommand(s => s.setName('banner').setDescription('Set banner image for embeds')
      .addStringOption(o => o.setName('url').setDescription('Image URL (leave empty to remove)').setRequired(false))
      .addAttachmentOption(o => o.setName('image').setDescription('Or upload image directly').setRequired(false))
    )
    .addSubcommand(s => s.setName('staff-role').setDescription('Set Staff role for Call Admins')
      .addRoleOption(o => o.setName('role').setDescription('Staff role').setRequired(true))
    )
    .addSubcommand(s => s.setName('emojis').setDescription('Show current 9 button emojis')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'create') {
      await interaction.deferReply({ ephemeral: true });
      const category = interaction.options.getChannel('category');
      const name = interaction.options.getString('name') || '➕ Join to Create';
      try {
        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildVoice,
          parent: category ? category.id : null,
        });
        db.addJTC(guild.id, channel.id, category ? category.id : null);
        const embed = new EmbedBuilder()
          .setColor(parseInt(config.colors.success.replace('#',''),16))
          .setTitle(`${config.emojis.success} JTC Created`)
          .setDescription(`Created voice channel **${channel}** \`${channel.name}\`\nNow when anyone joins it, a private channel will be created automatically!\n\n**Category:** ${category || 'Same as JTC'}\n**ID:** \`${channel.id}\``)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (e) {
        await interaction.editReply({ content: `${config.emojis.error} Failed: ${e.message}` });
      }
      return;
    }

    if (sub === 'delete') {
      await interaction.deferReply({ ephemeral: true });
      const ch = interaction.options.getChannel('channel');
      if (!db.isJTC(guild.id, ch.id)) {
        await interaction.editReply({ content: `${config.emojis.error} This channel is not a registered JTC. Registered: ${db.getGuild(guild.id).jtcChannels.map(id=>`<#${id}>`).join(', ') || 'None'}` });
        return;
      }
      db.removeJTC(guild.id, ch.id);
      try { await ch.delete('Setup delete JTC'); } catch {}
      await interaction.editReply({ content: `${config.emojis.success} Removed JTC \`${ch.name}\`` });
      return;
    }

    if (sub === 'config') {
      const g = db.getGuild(guild.id);
      const jtcLines = g.jtcChannels.length ? g.jtcChannels.map(id => {
        const cat = g.jtcCategories?.[id] || g.categoryId;
        return `<#${id}> \`${id}\` → <#${cat || 'auto'}> \`${cat || 'auto'}\``;
      }).join('\n') : '❌ None - pre-configured CREPA voices should appear. Use `/setup create`';
      const embed = new EmbedBuilder()
        .setColor(parseInt(config.colors.primary.replace('#',''),16))
        .setTitle(`⚙️ CREPA Temp Voice Config`)
        .setDescription(
          `**JTC Channels (Voice → Category):**\n${jtcLines}\n\n` +
          `**Name Template:** \`${g.channelName}\`\n` +
          `**Default Limit:** ${g.userLimit || 'Unlimited'}\n` +
          `**Bitrate:** ${g.bitrate/1000}kbps\n` +
          `**Global Category:** ${g.categoryId ? `<#${g.categoryId}>` : 'Per-JTC (voice1→category1, voice2→category2)'}\n` +
          `**Control Channel:** ${g.controlChannelId ? `<#${g.controlChannelId}>` : 'Inside voice chat'}\n` +
          `**Logs Channel:** ${g.logChannelId ? `<#${g.logChannelId}>` : 'Disabled'}\n` +
          `**Panel:** ${g.interfaceEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
          `**Banner:** ${g.bannerUrl ? `✅ Set` : (require('fs').existsSync(require('path').join(__dirname,'..','..','assets','banner.png')) ? '✅ assets/banner.png' : 'None')}\n` +
          `**Active Temps:** ${db.getTempsByGuild(guild.id).length}\n\n` +
          `**Pre-configured:**\n` +
          `• <#1549444850800140379> → <#1549444775785140254>\n` +
          `• <#1548720642143162489> → <#1547674387283714070>`
        )
        .setFooter({ text: `CREPA • ${guild.name}`, iconURL: guild.iconURL() || undefined })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'name') {
      const tpl = interaction.options.getString('template');
      db.setGuild(guild.id, { channelName: tpl });
      await interaction.reply({ content: `${config.emojis.success} Name template updated to: \`${tpl}\``, ephemeral: true });
      return;
    }
    if (sub === 'limit') {
      const limit = interaction.options.getInteger('limit');
      db.setGuild(guild.id, { userLimit: limit });
      await interaction.reply({ content: `${config.emojis.success} Default limit now: ${limit === 0 ? 'Unlimited' : limit}`, ephemeral: true });
      return;
    }
    if (sub === 'bitrate') {
      const br = interaction.options.getInteger('bitrate');
      db.setGuild(guild.id, { bitrate: br });
      await interaction.reply({ content: `${config.emojis.success} Default bitrate now: ${br/1000}kbps`, ephemeral: true });
      return;
    }
    if (sub === 'category') {
      const cat = interaction.options.getChannel('category');
      db.setGuild(guild.id, { categoryId: cat.id });
      await interaction.reply({ content: `${config.emojis.success} Global category now: ${cat} (use per-JTC for voice1/voice2)`, ephemeral: true });
      return;
    }
    if (sub === 'control-channel') {
      const ch = interaction.options.getChannel('channel');
      db.setGuild(guild.id, { controlChannelId: ch.id });
      await interaction.reply({ content: `${config.emojis.success} Control channel now: ${ch}`, ephemeral: true });
      return;
    }
    if (sub === 'logs') {
      const ch = interaction.options.getChannel('channel');
      db.setGuild(guild.id, { logChannelId: ch ? ch.id : null });
      await interaction.reply({ content: ch ? `${config.emojis.success} Logs channel: ${ch}` : `${config.emojis.success} Logs disabled`, ephemeral: true });
      return;
    }
    if (sub === 'interface') {
      const en = interaction.options.getBoolean('enabled');
      db.setGuild(guild.id, { interfaceEnabled: en });
      await interaction.reply({ content: `${config.emojis.success} Panel now: ${en ? 'Enabled ✅' : 'Disabled ❌'}`, ephemeral: true });
      return;
    }
    if (sub === 'banner') {
      const url = interaction.options.getString('url');
      const att = interaction.options.getAttachment('image');
      const finalUrl = att ? att.url : url;
      if (!finalUrl) {
        db.setGuild(guild.id, { bannerUrl: null });
        await interaction.reply({ content: `${config.emojis.success} Banner removed`, ephemeral: true }); return;
      }
      if (!finalUrl.startsWith('http')) {
        await interaction.reply({ content: `${config.emojis.error} Invalid URL`, ephemeral: true }); return;
      }
      db.setGuild(guild.id, { bannerUrl: finalUrl });
      const embed = new EmbedBuilder().setColor(parseInt(config.colors.success.replace('#',''),16)).setTitle(`${config.emojis.success} Banner Updated`).setDescription(`This banner will appear in every new voice embed`).setImage(finalUrl).setTimestamp();
      await interaction.reply({ embeds:[embed], ephemeral: true }); return;
    }
    if (sub === 'staff-role') {
      const role = interaction.options.getRole('role');
      db.setGuild(guild.id, { staffRoleId: role.id });
      await interaction.reply({ content: `${config.emojis.success} Staff role now: ${role} (\`${role.id}\`) - will be mentioned on Call Admins`, ephemeral: true }); return;
    }
    if (sub === 'emojis') {
      const g = db.getGuild(guild.id);
      const embed = new EmbedBuilder()
        .setColor(parseInt(config.colors.primary.replace('#',''),16))
        .setTitle(`🎨 9 Button Emojis`)
        .setDescription(
          `**Current (CREPA custom):**\n` +
          `1- Lock: <:Lock:1551300050309877842>\n2- Hide: <:Hide:1551299778455801887>\n3- Kick: <:Kick:1551299873372905517>\n4- Rename: <:Rename:1551300152034201641>\n5- Limit: <:Limite:1551299963579793589>\n6- Claim: <:download:1551299686739083364>\n7- Soundboard: <:SoundboardOff:1551300476337913916>\n8- Save: <:Save:1551300270363902033>\n9- Call Admins: <:CallStaff:1551299011242364990>\n\n` +
          `**All buttons are emoji only, no text.**\n` +
          `Stored in \`config.json\` → \`customEmojis\``
        ).setFooter({ text: `Banner: ${g.bannerUrl ? 'Set ✅' : (require('fs').existsSync(require('path').join(__dirname,'..','..','assets','banner.png')) ? 'assets/banner.png ✅' : 'None')}` }).setTimestamp();
      if (g.bannerUrl) embed.setImage(g.bannerUrl);
      else if (require('fs').existsSync(require('path').join(__dirname,'..','..','assets','banner.png'))) embed.setImage('attachment://banner.png');
      await interaction.reply({ embeds:[embed], ephemeral: true }); return;
    }
  }
};
