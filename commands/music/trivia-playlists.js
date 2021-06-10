const fs = require('fs');
const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');
const { prefix, spotifySecret, spotifyClientId } = require('../../config.json');

const Spotify = require('spotify-api.js');
const spotifyClient = new Spotify.Client();

const playlists_json = require('../../trivia-playlists.json');

module.exports = class ListTriviaPlaylistsCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'trivia-playlists',
      aliases: [
        'list-tp',
        'list-trivia-playlists',
        'lstp'
      ],
      memberName: 'trivia-playlists',
      group: 'music',
      description: 'Get a list with good trivia playlists',
      guildOnly: false,
    });
  }

  async run(message) {
    let playlistsEmbeds = [];
    let description = '';
    const playlists = playlists_json.playlists
    const playlists_count = playlists.length;
    const playlists_count_length = playlists_count.toString().length;
    const zeroPad = (num, places, padWith) => String(num).padStart(places, padWith)

    let seven_days_ago = new Date();
    seven_days_ago.setDate(seven_days_ago.getDate() - 7);
    let last_update = new Date(playlists_json.last_update);

    if (seven_days_ago > last_update) {
      await spotifyClient.login(spotifyClientId, spotifySecret);
      const playlistRegex = /\/playlist\/(.+)\?/;

      for (let i in playlists) {
        i = Number(i);
        let spotifyPlaylist = playlists[i].link.match(playlistRegex);
        if (!spotifyPlaylist) {
          console.log(`Invalid link for playlist:\n${playlists[i]}`);
          continue;
        }

        spotifyPlaylist = spotifyPlaylist[1];
        spotifyPlaylist = await spotifyClient.playlists.get(spotifyPlaylist);
        let name = spotifyPlaylist.name;
        let length = spotifyPlaylist.tracks.total;

        playlists[i].name = name;
        playlists[i].songCount = length;

        let description_temp = `\n${zeroPad(i + 1, playlists_count_length, 0)} - [${name}](${playlists[i].link})\n\`Song count: ${length}\`\n\`${prefix}music-trivia 25 ${playlists[i].link}\`\n`;

        if (description.length + description_temp.length > 2048) {
          playlistsEmbeds.push(description);
          description = '';
        }
        description += description_temp;
      }
      last_update = new Date();
      playlists_json.last_update = last_update;

      fs.writeFile('trivia-playlists.json', JSON.stringify(playlists_json), (err => {
        if (err) {
          throw err;
        }
        console.log('Updated trivia-playlists.json');
      }));
    } else {
      for (let i in playlists) {
        i = Number(i);
        let description_temp = `\n${zeroPad(i + 1, playlists_count_length, 0)} - [${playlists[i].name}](${playlists[i].link})\n\`Song count: ${playlists[i].songCount}\`\n\`${prefix}music-trivia 25 ${playlists[i].link}\`\n`;

        if (description.length + description_temp.length > 2048) {
          playlistsEmbeds.push(description);
          description = '';
        }
        description += description_temp;
      }
    }

    let helpMessage = `\n\n\*\*Start a music trivia with this command:\*\*\n${prefix}music-trivia \*numberOfSongs\* \*playlistLink\*`;
    if (description.length + helpMessage.length > 2048) {
      playlistsEmbeds.push(description);
      description = '';
    }
    description += helpMessage;
    playlistsEmbeds.push(description);

    helpMessage = `\n\n\*\*Start a music trivia with a randomly selected playlist:\*\*\n${prefix}music-trivia \*numberOfSongs\* \*random\*`;
    if (description.length + helpMessage.length > 2048) {
      playlistsEmbeds.push(description);
      description = '';
    }
    description += helpMessage;
    playlistsEmbeds.push(description);

    let last_update_formatted = `${zeroPad(last_update.getDate(), 2, 0)}.${zeroPad(last_update.getMonth() + 1, 2, 0)}.${last_update.getFullYear()} ${last_update.getHours()}:${last_update.getMinutes()}:${last_update.getSeconds()}`;

    for (let y in playlistsEmbeds) {
      const playlistsEmbed = new MessageEmbed()
        .setColor('#44f1e1')
        .setTitle(':notes: Good trivia playlists')
        .setDescription(playlistsEmbeds[y])
        .setFooter(`Last Update: ${last_update_formatted}`);
        await message.channel.send(playlistsEmbed);
    }
  }
};
