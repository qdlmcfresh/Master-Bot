const fs = require('fs');
const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');
const { spotifySecret, spotifyClientId } = require('../../config.json');

const Spotify = require('spotify-api.js');
const spotifyClient = new Spotify.Client();

const playlists_json = require('../../trivia-playlists.json');

module.exports = class ListTriviaPlaylistsCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'add-trivia-playlist',
      aliases: [
        'addtp',
      ],
      memberName: 'add-trivia-playlist',
      group: 'music',
      description: 'Add a playlist to the "Good trivia playlists" list',
      guildOnly: false,
      ownerOnly: true,
      clientPermissions: ['MANAGE_MESSAGES'],
      args: [
        {
          key: 'link',
          prompt: 'The link to the playlist you want to add',
          type: 'string'
        }
      ]
    });
  }

  async run(message, {link}) {
    await spotifyClient.login(spotifyClientId, spotifySecret);
    const playlistRegex = /\/playlist\/(.+)\?/;

    let spotifyPlaylist = link.match(playlistRegex);
    if (!spotifyPlaylist) {
      await message.reply('Invalid playlist!');
      return;
    }

    spotifyPlaylist = spotifyPlaylist[1];
    spotifyPlaylist = await spotifyClient.playlists.get(spotifyPlaylist);
    let name = spotifyPlaylist.name;
    let length = spotifyPlaylist.tracks.total;

    if (playlists_json.playlists.find(o => o.link === link)) {
      await message.reply('The playlist is already in the "Good trivia playlists" list');
      return;
    }

    let already_available = '';
    if (playlists_json.playlists.find(o => o.name === name)) {
      already_available = '**⚠It seems like this playlist already is in the "Good trivia playlists" list**\n\n';
    }

    const confirmationEmbed = new MessageEmbed()
      .setColor('#44f1e1')
      .setTitle('Do you really want to add this playlist?')
      .setDescription(
        `${already_available}[${name}](${link})\n\`Song count: ${length}\`\n\nConfirm by reacting to this message`
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
          await message.reply('Ok, adding the playlist...');
          playlists_json.playlists.push(
            {
              "name": name,
              "link": link,
              "songCount": length
            }
          );
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
          await message.reply('Ok, not adding the playlist.');
        }
      })
      .catch(async () => {
        await message.reply('You didn\'t react, not adding the playlist.');
      });
  }
};
