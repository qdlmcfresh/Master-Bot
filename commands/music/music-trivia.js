const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');
const db = require('quick.db');
let { getPreview } = require('spotify-url-info');
const { prefix, spotifySecret, spotifyClientId, spotifyMarket } = require('../../config.json');
const playlists_json = require('../../trivia-playlists.json');
const Spotify = require('spotify-api.js');
const spotifyClient = new Spotify.Client();
const MAX_DISTANCE = 3; //TODO evtl in cofing verschieben
const REGEX_PARENTHESES = /\(.*\)/;
const REGEX_DASH = /-.*/;
const REGEX_SPECIAL_CHARACTERS = /[^0-9a-zA-Z\s]+/;
const REGEX_WHITESPACE = /\s*/g;

module.exports = class MusicTriviaCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'music-trivia',
      memberName: 'music-trivia',
      aliases: ['music-quiz', 'start-quiz', 'mtrivia'],
      group: 'music',
      description: 'Engage in a music quiz with your friends!',
      guildOnly: true,
      clientPermissions: ['SPEAK', 'CONNECT'],
      throttling: {
        usages: 1,
        duration: 10
      },
      args: [
        {
          key: 'numberOfSongs',
          prompt: 'What is the number of songs you want the quiz to have?',
          type: 'integer',
          min: 1,
          //default: 5,
          max: 50
        },
        {
          key: 'playlist',
          prompt: 'Which playlist to choose from',
          type: 'string'
        }
      ]
    });
  }

  async run(message, { numberOfSongs, playlist }) {
    // check if user is in a voice channel
    let voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      await message.reply(':no_entry: Please join a voice channel and try again!');
      return;
    }
    if (message.guild.musicData.isPlaying === true)
      return message.channel.send(':x: A quiz or a song is already running!');

    let connection = null;
    try {
      connection = await voiceChannel.join();
    } catch (e) {
      console.log('Error Start\n' + e + '\nError End');
      await message.reply('Couldn\'t join your voice channel');
      return;
    }

    if (playlist == 'random') {
      let random = Math.floor(Math.random() * (playlists_json.playlists.length - 0));
      playlist = playlists_json.playlists[random].link;

      const random_result = new MessageEmbed()
        .setColor('#44f1e1')
        .setTitle('The selected playlist')
        .setDescription(`[${playlists_json.playlists[random].name}](${playlists_json.playlists[random].link})`)
      await message.reply(random_result);
    }

    await spotifyClient.login(spotifyClientId, spotifySecret);
    const playlistRegex = /\/playlist\/(.+)\?/;
    playlist = playlist.match(playlistRegex);
    if (!playlist) {
      await message.reply('Invalid playlist!');
      message.guild.me.voice.channel.leave();
      return;
    } else {
      playlist = playlist[1];
      await message.reply('Collecting songs...');
    }


    message.guild.musicData.isPlaying = true;
    message.guild.triviaData.isTriviaRunning = true;
    message.guild.triviaData.triviaQueue = [];
    const spotifyPlaylist = await spotifyClient.playlists.get(playlist);
    let tempTracks = await spotifyPlaylist.getTracks({ offset: 0, market: spotifyMarket });
    let trackItems = tempTracks.items;
    if (tempTracks.total > tempTracks.limit) {
      while (trackItems.length < tempTracks.total) {
        tempTracks = await spotifyPlaylist.getTracks({ offset: trackItems.length });
        trackItems = trackItems.concat(tempTracks.items);
      }
    }

    MusicTriviaCommand.shuffle(trackItems);
    let songMap = new Map();
    for (let track of trackItems) {
      track = track.track;
      if (!track.id || songMap.has(track.id) || track.artists[0].name === null || track.name === null) {
        continue;
      }
      if (track.previewUrl === null) {
        //Try to get preview url via spotify-url-info
        let url = await getPreview(track.externalUrls.spotify);
        track.previewUrl = url.audio;
      }

      let imageLink = track.album.images[0].url;
      const song = {
        url: track.previewUrl,
        singer: track.artists[0].name,
        title: track.name,
        image: imageLink,
        voiceChannel
      };
      songMap.set(track.id, song);
      if (songMap.size == numberOfSongs) {
        break;
      }
    }

    if (songMap.size < numberOfSongs) {
      message.guild.musicData.isPlaying = false;
      message.guild.triviaData.isTriviaRunning = false;
      message.guild.triviaData.triviaQueue = [];
      message.guild.me.voice.channel.leave();
      return message.reply('Couldn\'t get enough tracks with preview, sorry :(');
    }

    message.guild.triviaData.triviaQueue = Array.from(songMap.values());
    const channelInfo = Array.from(
      message.member.voice.channel.members.entries()
    );
    channelInfo.forEach(user => {
      if (user[1].user.bot) return;
      message.guild.triviaData.triviaScore.set(user[1].user.toString(), 0);
    });

    const infoEmbed = new MessageEmbed()
      .setColor('#44f1e1')
      .setTitle(':notes: Starting Music Quiz!')
      .setDescription(
        `:notes: Get ready! There are ${numberOfSongs} songs, you have 30 seconds to guess either the singer/band or the name of the song. Good luck!
            You can end the trivia at any point by using the ${prefix}end-trivia command!`
      );
    await message.channel.send(infoEmbed);
    await MusicTriviaCommand.playQuizSong(
      connection,
      message.guild.triviaData.triviaQueue,
      message,
      [1, numberOfSongs],
      [false, false, null, null]
    );
  }

  static async playQuizSong(connection, queue, message, song_count, point_cache) {
    let classThis = this;

    if (queue.length === 0) {
      if (message.guild.triviaData.wasTriviaEndCalled) {
        message.guild.triviaData.wasTriviaEndCalled = false;
        message.guild.musicData.isPlaying = false;
        message.guild.triviaData.isTriviaRunning = false;
        message.guild.musicData.songDispatcher = null;
        message.guild.me.voice.channel.leave();
        return;
      }
      const sortedScoreMap = new Map(
        [...message.guild.triviaData.triviaScore.entries()].sort(function(
          a,
          b
        ) {
          return b[1] - a[1];
        })
      );
      const embed = new MessageEmbed()
        .setColor('#44f1e1')
        .setTitle(`Music Quiz Results`);
      this.setLeaderboardOnMessage(embed, Array.from(sortedScoreMap.entries()));
      message.channel.send(embed);
      message.guild.musicData.isPlaying = false;
      message.guild.triviaData.isTriviaRunning = false;
      message.guild.triviaData.triviaScore.clear();
      message.guild.musicData.songDispatcher = null;
      message.guild.me.voice.channel.leave();
      message.guild.triviaData.collector.stop();
      return;
    }

      const filter = msg => message.guild.triviaData.triviaScore.has(msg.author.toString());
      const collector = message.channel.createMessageCollector(filter, {
        time: 32000 //Account for time to preload the song file etc etc
      });
      message.guild.triviaData.collector = collector;

      let trackTitle = queue[0].title
        .split('feat.')[0]
        .split('ft.')[0]
        .split('Feat.')[0]
        .toLowerCase()
        .replace(REGEX_DASH, '')
        .replace(REGEX_PARENTHESES, '')
        .replace(REGEX_SPECIAL_CHARACTERS, '')
        .replace(REGEX_WHITESPACE, '')
        .trim();

      let trackArtist = queue[0].singer
        .toLowerCase()
        .replace(REGEX_SPECIAL_CHARACTERS, '')
        .replace(REGEX_WHITESPACE, '');

      let songNameFound = point_cache[0];
      let songSingerFound = point_cache[1];
      let userWhoFoundTitle = point_cache[2];
      let userWhoFoundArtist = point_cache[3];

      const dispatcher = await connection
        .play(queue[0].url, { highWaterMark: 24 }) //preload more of stream for it to be more stable
        .on('start', async function() {
          console.log('Playing: ' + queue[0].singer + ': ' + queue[0].title + ' ' + queue[0].url);
          message.guild.musicData.songDispatcher = dispatcher;
          if (!db.get(`${message.guild.id}.serverSettings.volume`))
            dispatcher.setVolume(message.guild.musicData.volume);
          else
            dispatcher.setVolume(
              db.get(`${message.guild.id}.serverSettings.volume`)
            );
        })
        .on('error', async function(e) {
          message.reply(':x: Could not play that song!');
          console.log(e);
          collector.stop();
        })
        .on('debug', async function(d) {
          console.log(d);
        })
        .on('finish', async function() {
          collector.stop();
        });

      collector.on('collect', async function(msg) {
        if (!message.guild.triviaData.triviaScore.has(msg.author.toString()))
          return;
        if (msg.content.startsWith(prefix)) {
          return;
        }

        let userInput = msg.content.toLowerCase()
          .replace(REGEX_DASH, '')
          .replace(REGEX_PARENTHESES, '')
          .replace(REGEX_SPECIAL_CHARACTERS, '')
          .replace(REGEX_WHITESPACE, '')
          .trim();

        let message_guessed_song = false; //needed for the case that a message is correct for song title and artist, so we can track for which one we gave points etc
        let message_guessed_artist = false; //needed for the case that a message is correct for song title and artist, so we can track for which one we gave points etc
        let react_with = '❌'; //needed so we don't react more than once to a message

        // if user guessed song name
        if ((userInput === trackTitle || MusicTriviaCommand.levenshtein(userInput, trackTitle) <= MAX_DISTANCE)) {
          if (songNameFound && !(userInput === trackArtist || MusicTriviaCommand.levenshtein(userInput, trackArtist) <= MAX_DISTANCE) && !message_guessed_artist) { //input matches title and artist
            react_with = '😴';
          } else if (!songNameFound) {
            songNameFound = true;
            message_guessed_song = true;
            userWhoFoundTitle = msg.author.toString();

            //Increase score of user
            message.guild.triviaData.triviaScore.set(
              msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
            );
            react_with = '✅';
          } // if song name already found
        }
        if (userInput === trackArtist || MusicTriviaCommand.levenshtein(userInput, trackArtist) <= MAX_DISTANCE) {
          if (songSingerFound && !message_guessed_song) {
            react_with = '😴';
          } else if (!songSingerFound && !message_guessed_song) {
            songSingerFound = true;
            message_guessed_artist = true;
            userWhoFoundArtist = msg.author.toString();

            //Increase score of user
            message.guild.triviaData.triviaScore.set(
              msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
            );
            react_with = '✅';
          }
        }
        if ((MusicTriviaCommand.levenshtein(userInput, trackArtist + ' ' + trackTitle) <= MAX_DISTANCE
          ||
          MusicTriviaCommand.levenshtein(userInput, trackTitle + ' ' + trackArtist) <= MAX_DISTANCE)
          && !message_guessed_song && !message_guessed_artist
        ) {
          if (songSingerFound && !songNameFound) {
            userWhoFoundTitle = msg.author.toString();
            message.guild.triviaData.triviaScore.set(
              msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
            );
            react_with = '✅';
          } else if (songNameFound && !songSingerFound) {
            userWhoFoundArtist = msg.author.toString();
            message.guild.triviaData.triviaScore.set(
              msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
            );
            react_with = '✅';
          } else {
            userWhoFoundArtist = msg.author.toString();
            userWhoFoundTitle = msg.author.toString();
            message.guild.triviaData.triviaScore.set(
              msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 2
            );
            react_with = '✅';
          }
          songNameFound = true;
          songSingerFound = true;
        }
        await msg.react(react_with);

        if (songNameFound && songSingerFound) {
          //One extra point if user guessed Title and Artist in two separate messages
          if (userWhoFoundTitle === userWhoFoundArtist) {
            message.guild.triviaData.triviaScore.set(
              msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
            );
          }
          return collector.stop();
        }
      });
      collector.on('end', async function() {
        /*
        The reason for this if statement is that we don't want to get an
        empty embed returned via chat by the bot if end-trivia command was called
        */
        if (message.guild.triviaData.wasTriviaEndCalled) {
          return classThis.playQuizSong(connection, queue, message, [song_count[0], song_count[1]], []);
        }

        let time_to_play = 30000; //alt. collector.options.time; We want songs to play 30s
        let start_time = dispatcher.startTime;
        let end_time = new Date().getTime();
        let percent_played = Math.round((((end_time - start_time) / time_to_play) + Number.EPSILON) * 100) / 100;
        let percent_played_formatted = Math.round((percent_played * 100 + Number.EPSILON) * 100) / 100;

        if (percent_played <= 0.69 && (!songNameFound || !songSingerFound) && !(message.guild.triviaData.triviaPass.size > 0)) {
          const embed = new MessageEmbed()
            .setColor('#44f1e1')
            .setTitle('⚠ Repeating current song')
            .setDescription(`Repeating current song because playback stopped too early after ${percent_played_formatted}%. Correct guesses will be saved.`);
          message.channel.send(embed);

          return classThis.playQuizSong(connection, queue, message, [song_count[0], song_count[1]], [songNameFound, songSingerFound, userWhoFoundTitle, userWhoFoundArtist]);
        }

        const sortedScoreMap = new Map(
          [...message.guild.triviaData.triviaScore.entries()].sort(function(
            a,
            b
          ) {
            return b[1] - a[1];
          })
        );

        const song = `${classThis.capitalize_Words(queue[0].singer)} - ${classThis.capitalize_Words(queue[0].title)}`;

        const embed = new MessageEmbed()
          .setColor('#44f1e1')
          .setTitle(`:musical_note: The song was:\n ${song}`)
          .setThumbnail(queue[0].image)
          .setFooter(`Song ${song_count[0]} of ${song_count[1]}`);
        classThis.setLeaderboardOnMessage(embed, Array.from(sortedScoreMap.entries()));
        message.channel.send(embed);

        message.guild.triviaData.triviaPass.clear();
        await queue.shift();
        return classThis.playQuizSong(connection ,queue, message, [song_count[0] += 1, song_count[1]], [false, false, null, null]);
      });
  }

  static setLeaderboardOnMessage(message, arr) {
    if (!message) return;
    if (!arr) return;
    if (!arr[0]) return; // issue #422

    let placements = '';
    let names = '';
    let points = '';

    for (let i = 0; i < arr.length; i++) {
      if (i === 0) {
        placements = '#' + (i + 1);
        names = arr[i][0];
        points = arr[i][1];
      } else {
        placements += '\n#' + (i + 1);
        names += '\n' + arr[i][0];
        points += '\n' + arr[i][1];
      }
    }

    message.addFields(
      { name: 'Placement', value: placements, inline: true },
      { name: 'User', value: names, inline: true },
      { name: 'Points', value: points, inline: true }
    );
  }

  // https://www.w3resource.com/javascript-exercises/javascript-string-exercise-9.php
  static capitalize_Words(str) {
    return str.replace(/\w\S*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  static levenshtein(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) {
      track[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j += 1) {
      track[j][0] = j;
    }
    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1, // deletion
          track[j - 1][i] + 1, // insertion
          track[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    return track[str2.length][str1.length];
  }

  /**
   * Shuffles array in place. ES6 version
   * @param {Array} a items An array containing the items.
   */
  static shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
};
