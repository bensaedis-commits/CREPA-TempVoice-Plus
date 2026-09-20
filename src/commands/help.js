const { SlashCommandBuilder } = require('discord.js');
const { helpEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Show CREPA Temp Voice help'),
  async execute(interaction) {
    await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
  }
};
