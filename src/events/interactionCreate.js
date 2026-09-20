const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const config = require('../config');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      try { await cmd.execute(interaction, client); }
      catch (e) {
        console.error('[cmd]', e);
        const reply = { content: `${config.emojis.error} Error: ${e.message}`, ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(()=>{});
        else await interaction.reply(reply).catch(()=>{});
      }
      return;
    }

    // StringSelectMenu - Kick
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'vc_kick_select') {
        const vc = interaction.member.voice.channel;
        if (!vc || !db.isTemp(vc.id)) { await interaction.reply({ content: `${config.emojis.error} You must be inside your temporary voice channel.`, ephemeral: true}); return; }
        const temp = db.getTemp(vc.id);
        if (temp.ownerId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({ content: `${config.emojis.error} You are not the owner.`, ephemeral: true}); return;
        }
        const targetId = interaction.values[0];
        if (targetId === interaction.user.id) { await interaction.reply({ content: `${config.emojis.error} You cannot kick yourself.`, ephemeral: true}); return; }
        const targetMember = vc.members.get(targetId);
        try {
          await vc.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false }).catch(()=>{});
          if (targetMember) {
            try { await targetMember.voice.disconnect('Kicked by owner via Kick button'); } catch {}
          }
          await interaction.reply({ content: `👢 Kicked <@${targetId}> and blocked from rejoining.`, ephemeral: false });
          const g = db.getGuild(interaction.guild.id);
          if (g.logChannelId) {
            const ch = interaction.guild.channels.cache.get(g.logChannelId);
            if (ch?.send) {
              const embed = new EmbedBuilder().setColor(parseInt(config.colors.error.replace('#',''),16)).setTitle(`👢 Kick`).setDescription(`**Owner:** ${interaction.user} kicked **<@${targetId}>** from ${vc} \`${vc.name}\``).setTimestamp();
              ch.send({ embeds:[embed] }).catch(()=>{});
            }
          }
        } catch (e) {
          await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true});
        }
        return;
      }
      return;
    }

    // Buttons - 9 buttons only
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (!id.startsWith('vc_')) return;

      const vc = interaction.member.voice.channel;
      if (!vc || !db.isTemp(vc.id)) {
        await interaction.reply({ content: `${config.emojis.error} You must be inside your temporary voice channel to use the 9 buttons.`, ephemeral: true }); return;
      }
      const temp = db.getTemp(vc.id);
      const isOwner = temp.ownerId === interaction.user.id;
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

      const ownerOnly = ['vc_toggle_lock','vc_toggle_hide','vc_kick','vc_rename','vc_limit','vc_toggle_soundboard','vc_save_reset','vc_call_admins'];
      if (ownerOnly.includes(id) && !isOwner && !isAdmin) {
        await interaction.reply({ content: `${config.emojis.error} This button is only for the owner <@${temp.ownerId}>. Use Claim button if owner left.`, ephemeral: true }); return;
      }

      try {
        switch (id) {
          case 'vc_toggle_lock': {
            const currentlyLocked = !!temp.locked;
            if (currentlyLocked) {
              await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true, ViewChannel: true }).catch(()=>{});
              db.updateTemp(vc.id, { locked: false });
              await interaction.reply({ content: `🔓 Channel **unlocked** - anyone can now join.`, ephemeral: true });
            } else {
              await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false }).catch(async ()=>{
                await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false, ViewChannel: true }).catch(()=>{});
              });
              db.updateTemp(vc.id, { locked: true });
              await interaction.reply({ content: `🔒 Channel **locked** - no new users can join except allowed ones.`, ephemeral: true });
            }
            await refreshPanel(interaction, vc);
            break;
          }

          case 'vc_toggle_hide': {
            const currentlyHidden = !!temp.hidden;
            if (currentlyHidden) {
              await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: true }).catch(()=>{});
              db.updateTemp(vc.id, { hidden: false });
              await interaction.reply({ content: `👁️ Channel **visible** - everyone can see it.`, ephemeral: true });
            } else {
              await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: false }).catch(()=>{});
              db.updateTemp(vc.id, { hidden: true });
              await interaction.reply({ content: `🙈 Channel **hidden** - only allowed users can see it.`, ephemeral: true });
            }
            await refreshPanel(interaction, vc);
            break;
          }

          case 'vc_kick': {
            const members = vc.members.filter(m => m.id !== interaction.user.id && !m.user.bot);
            if (members.size === 0) { await interaction.reply({ content: `${config.emojis.error} No members to kick (only you).`, ephemeral: true}); break; }
            const { kickSelectEmbed } = require('../utils/embeds');
            const { getKickSelectMenu } = require('../utils/components');
            const embed = kickSelectEmbed(interaction.guild, vc);
            const menu = getKickSelectMenu(vc.members, interaction.guild.id);
            if (!menu) { await interaction.reply({ content: `${config.emojis.error} Cannot create menu.`, ephemeral: true}); break; }
            const fs = require('fs'); const path = require('path');
            const bannerPath = path.join(__dirname, '..', '..', 'assets', 'banner.png');
            const files = fs.existsSync(bannerPath) ? [{ attachment: bannerPath, name: 'banner.png' }] : [];
            await interaction.reply({ embeds:[embed], components:[menu], files, ephemeral: true });
            break;
          }

          case 'vc_rename': {
            const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('Rename Channel');
            const input = new TextInputBuilder().setCustomId('new_name').setLabel('New name').setStyle(TextInputStyle.Short).setMaxLength(100).setValue(vc.name).setRequired(true).setPlaceholder('e.g. CREPA Legendary Room');
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal); break;
          }

          case 'vc_limit': {
            const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('Set User Limit');
            const input = new TextInputBuilder().setCustomId('limit_val').setLabel('Limit (0 = unlimited, 1-99)').setStyle(TextInputStyle.Short).setMaxLength(2).setValue(String(vc.userLimit||0)).setRequired(true).setPlaceholder('e.g. 5');
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal); break;
          }

          case 'vc_claim': {
            if (temp.ownerId === interaction.user.id) { await interaction.reply({ content: `${config.emojis.error} You are already the owner!`, ephemeral: true}); break; }
            if (vc.members.has(temp.ownerId)) { await interaction.reply({ content: `${config.emojis.error} Owner <@${temp.ownerId}> is still inside - cannot claim.`, ephemeral: true}); break; }
            db.setOwner(vc.id, interaction.user.id);
            try { await vc.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, Connect: true, ViewChannel: true, Speak: true }).catch(()=>{}); } catch {}
            await interaction.reply({ content: `👑 You are now the owner of ${vc}! Control all 9 buttons.`, ephemeral: false });
            await refreshPanel(interaction, vc);
            break;
          }

          case 'vc_toggle_soundboard': {
            const UseSoundboard = PermissionFlagsBits.UseSoundboard || (1n << 42n);
            const currentlyDisabled = !!temp.soundboardDisabled;
            if (currentlyDisabled) {
              try {
                const ow = vc.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
                if (ow) await ow.delete().catch(async()=>{
                  await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { UseSoundboard: true }).catch(()=>{});
                });
                await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { UseSoundboard: null }).catch(()=>{});
                try { await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true, ViewChannel: true }); } catch {}
              } catch {}
              db.updateTemp(vc.id, { soundboardDisabled: false });
              await interaction.reply({ content: `🔊 Soundboard **enabled** - everyone can now use it.`, ephemeral: true });
            } else {
              await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { UseSoundboard: false }).catch(()=>{});
              try { await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { [PermissionFlagsBits.UseSoundboard ? 'UseSoundboard' : 'Connect']: false }); } catch {}
              await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { UseSoundboard: false }).catch(async()=>{
                const everyone = interaction.guild.roles.everyone;
                await vc.permissionOverwrites.create(everyone, { UseSoundboard: false }).catch(()=>{});
              });
              db.updateTemp(vc.id, { soundboardDisabled: true });
              await interaction.reply({ content: `🔇 Soundboard **disabled** - no one can use it.`, ephemeral: true });
            }
            await refreshPanel(interaction, vc);
            break;
          }

          case 'vc_save_reset': {
            const hasSaved = db.hasSavedConfig(interaction.guild.id, interaction.user.id);
            const currentState = {
              name: vc.name,
              limit: vc.userLimit,
              locked: !!temp.locked,
              hidden: !!temp.hidden,
              soundboardDisabled: !!temp.soundboardDisabled,
            };
            const defaultGuild = db.getGuild(interaction.guild.id);
            const defaults = {
              name: defaultGuild.channelName,
              limit: defaultGuild.userLimit || 0,
              locked: false,
              hidden: false,
              soundboardDisabled: false,
            };
            if (hasSaved) {
              const saved = db.getSavedConfig(interaction.guild.id, interaction.user.id);
              const sameAsSaved = saved && saved.name === currentState.name && saved.limit === currentState.limit && !!saved.locked === currentState.locked && !!saved.hidden === currentState.hidden && !!saved.soundboardDisabled === currentState.soundboardDisabled;
              if (sameAsSaved) {
                db.clearSavedConfig(interaction.guild.id, interaction.user.id);
                await interaction.reply({ content: `🔄 **Reset** - Settings cleared, next channel will be default.`, ephemeral: true });
              } else {
                db.setSavedConfig(interaction.guild.id, interaction.user.id, currentState);
                await interaction.reply({ content: `💾 **Saved** - Updated: Name: ${currentState.name} | Limit: ${currentState.limit} | Lock: ${currentState.locked?'🔒':'🔓'} | Hide: ${currentState.hidden?'🙈':'👁️'} | SB: ${currentState.soundboardDisabled?'🔇':'🔊'}`, ephemeral: true });
              }
            } else {
              db.setSavedConfig(interaction.guild.id, interaction.user.id, currentState);
              await interaction.reply({ content: `💾 **Saved** - Your settings are now saved for every new channel: Name: ${currentState.name} | Limit: ${currentState.limit} | Lock: ${currentState.locked?'🔒':'🔓'} | Hide: ${currentState.hidden?'🙈':'👁️'} | SB: ${currentState.soundboardDisabled?'🔇':'🔊'}`, ephemeral: true });
            }
            await refreshPanel(interaction, vc);
            break;
          }

          case 'vc_call_admins': {
            const now = Date.now();
            const last = temp.lastCallAdminAt || 0;
            const cooldown = 5*60*1000;
            if (now - last < cooldown) {
              const remain = Math.ceil((cooldown - (now-last))/1000);
              await interaction.reply({ content: `${config.emojis.error} You can mention Staff once every 5 minutes. ${remain}s left.`, ephemeral: true}); break;
            }
            db.updateTemp(vc.id, { lastCallAdminAt: now });
            const { callAdminEmbed } = require('../utils/embeds');
            const payload = callAdminEmbed(interaction.guild, vc, interaction.member);
            const fs2 = require('fs'); const path2 = require('path');
            const bannerPath2 = path2.join(__dirname, '..', '..', 'assets', 'banner.png');
            if (fs2.existsSync(bannerPath2)) payload.files = [{ attachment: bannerPath2, name: 'banner.png' }];
            let target = vc;
            const g = db.getGuild(interaction.guild.id);
            if (g.controlChannelId) {
              target = vc;
            }
            try {
              await target.send(payload);
              await interaction.reply({ content: `📞 Mentioned Staff (<@&${g.staffRoleId}>) in voice chat. They will come soon!`, ephemeral: true });
            } catch (e) {
              await interaction.reply(payload);
            }
            const logCh = interaction.guild.channels.cache.get(g.logChannelId);
            if (logCh?.send) {
              logCh.send({ content: `📞 **Call Admins** from ${interaction.user} in ${vc} \`${vc.name}\``, embeds: payload.embeds }).catch(()=>{});
            }
            break;
          }
        }
      } catch (e) {
        console.error('[button 9]', e);
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true }).catch(()=>{});
        else await interaction.followUp({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true }).catch(()=>{});
      }
      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const vc = interaction.member.voice.channel;
      if (!vc || !db.isTemp(vc.id)) { await interaction.reply({ content: `${config.emojis.error} You must be inside your temporary channel.`, ephemeral: true}); return; }
      const temp = db.getTemp(vc.id);
      if (temp.ownerId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ content: `${config.emojis.error} You are not the owner.`, ephemeral: true}); return;
      }
      try {
        switch (interaction.customId) {
          case 'modal_rename': {
            const name = interaction.fields.getTextInputValue('new_name');
            await vc.setName(name);
            await interaction.reply({ content: `✏️ Renamed to \`${name}\``, ephemeral: true });
            await refreshPanel(interaction, vc);
            break;
          }
          case 'modal_limit': {
            const v = parseInt(interaction.fields.getTextInputValue('limit_val'));
            if (isNaN(v) || v<0 || v>99) { await interaction.reply({ content: `${config.emojis.error} Invalid value (0-99)`, ephemeral: true}); break;}
            await vc.setUserLimit(v);
            await interaction.reply({ content: `👥 Limit now: ${v===0?'Unlimited ∞':v}`, ephemeral: true});
            await refreshPanel(interaction, vc);
            break;
          }
        }
      } catch (e) {
        await interaction.reply({ content: `${config.emojis.error} Failed: ${e.message}`, ephemeral: true}).catch(()=>{});
      }
    }
  }
};

function renderName(template, member) {
  try { const { renderTemplate } = require('../utils/template'); return renderTemplate(template, member, null, member.guild); } catch { return template; }
}

async function refreshPanel(interaction, vc) {
  try {
    const { panelEmbed } = require('../utils/embeds');
    const { getControlRows } = require('../utils/components');
    const guild = interaction.guild;
    const ownerMember = guild.members.cache.get(db.getTemp(vc.id).ownerId) || interaction.member;
    const embed = panelEmbed(guild, vc, ownerMember);
    const rows = getControlRows(guild.id, db.getTemp(vc.id));
  } catch {}
}
