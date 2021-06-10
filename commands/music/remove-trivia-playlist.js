const fs = require('fs');
const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');

const playlists_json = require('../../trivia-playlists.json');

module.exports = class ListTriviaPlaylistsCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'remove-trivia-playlist',
      aliases: [
        'remove-tp',
        'rmtp'
      ],
      memberName: 'remove-trivia-playlist',
      group: 'music',
      description: 'Remove a playlist from the "Good trivia playlists" list',
      guildOnly: false,
      ownerOnly: true,
      clientPermissions: ['MANAGE_MESSAGES'],
      args: [
        {
          key: 'index',
          prompt: 'The number of the playlist you want to remove',
          type: 'integer'
        }
      ]
    });
  }

  async run(message, {index}) {
    let playlist;
    const real_index = Number(index) - 1;

    if (playlists_json.playlists.length < index) {
      await message.reply('Invalid index!');
      return;
    }

    playlist = playlists_json.playlists[real_index];

    const confirmationEmbed = new MessageEmbed()
      .setColor('#44f1e1')
      .setTitle('Do you really want to remove this playlist?')
      .setDescription(
        `[${playlist.name}](${playlist.link})\n\`Song count: ${playlist.songCount}\`\n\nConfirm by reacting to this message`
      );
    let confirmationMessage;

    await message.channel.send(confirmationEmbed)
      .then(function(message) {
        confirmationMessage = message;
        confirmationMessage.react("👍");
        confirmationMessage.react("👎");
      })
      .catch(function(error) {
        console.log(error);
      });

    const filter = (reaction, user) => {
      return ['👍', '👎'].includes(reaction.emoji.name) && user.id === message.author.id;
    };
    confirmationMessage.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
      .then(async collected => {
        const reaction = collected.first();

        if (reaction.emoji.name === '👍') {
          await message.reply('Ok, removing the playlist...');
          playlists_json.playlists.splice(real_index, 1);
          playlists_json.last_update = new Date();

          fs.writeFile('trivia-playlists.json', JSON.stringify(playlists_json), (err => {
            if (err) {
              throw err;
            }
            console.log('Updated trivia-playlists.json');
          }));

          confirmationMessage.reactions.removeAll()
            .catch(error => console.error('Failed to clear reactions: ', error))
            .then( async () => {
              await confirmationMessage.react('🇩');
              await confirmationMessage.react('🇴');
              await confirmationMessage.react('🇳');
              await confirmationMessage.react('🇪');
            })
        } else {
          await message.reply('Ok, not removing the playlist.');
        }
      })
      .catch(async () => {
        await message.reply('You didn\'t react, not removing the playlist.');
      });
  }

};
