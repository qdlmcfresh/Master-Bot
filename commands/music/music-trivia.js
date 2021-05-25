const Discord = require('discord.js');
const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const db = require('quick.db');
let { getData, getPreview, getTracks } = require('spotify-url-info');
const { prefix, spotifySecret, spotifyClientId, spotifyMarket } = require('../../config.json');
const Spotify = require('spotify-api.js');
const spotifyClient = new Spotify.Client();
const MAX_DISTANCE = 3;
const REGEX_PARENTHESES = /\(.*\)/;
const REGEX_DASH = /-.*/;
const REGEX_SPECIAL_CHARACTERS = /[^0-9a-zA-Z\s]+/;

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

  static async playQuizSong(queue, message, song_count) {
    let classThis = this;
    message.guild.triviaData.triviaPass.clear();
    message.member.voice.channel.join().then(async function(connection) {
      const dispatcher = await connection
        .play(queue[0].url)
        .on('start', async function() {
          console.log('Playing: ' + queue[0].singer + ': ' + queue[0].title + ' ' + queue[0].url);
          message.guild.musicData.songDispatcher = dispatcher;
          if (!db.get(`${message.guild.id}.serverSettings.volume`))
            dispatcher.setVolume(message.guild.musicData.volume);
          else
            dispatcher.setVolume(
              db.get(`${message.guild.id}.serverSettings.volume`)
            );

          let songNameFound = false;
          let songSingerFound = false;
          let userWhoFoundTitle = null;
          let userWhoFoundArtist = null;

          const filter = msg =>
            message.guild.triviaData.triviaScore.has(msg.author.toString());
          const collector = message.channel.createMessageCollector(filter, {
            time: 28000
          });
          message.guild.triviaData.collector = collector;

          let trackTitle = queue[0].title
            .split('feat.')[0]
            .split('ft.')[0]
            .toLowerCase()
            .replace(REGEX_DASH, '')
            .replace(REGEX_PARENTHESES, '')
            .replace(REGEX_SPECIAL_CHARACTERS, '')
            .trim();

          let trackArtist = queue[0].singer.toLowerCase().replace(REGEX_SPECIAL_CHARACTERS, '');

          collector.on('collect', await function(msg) {
            if (!message.guild.triviaData.triviaScore.has(msg.author.toString()))
              return;
            if (msg.content.startsWith(prefix)) {
              return;
            }
            let userInput = msg.content.toLowerCase()
              .replace(REGEX_DASH, '')
              .replace(REGEX_PARENTHESES, '')
              .replace(REGEX_SPECIAL_CHARACTERS, '')
              .trim();

            // if user guessed song name
            if (userInput === trackTitle || MusicTriviaCommand.levenshtein(userInput, trackTitle) <= MAX_DISTANCE) {
              if (songNameFound) {
                msg.react('😴');
                return;
              } // if song name already found
              songNameFound = true;
              userWhoFoundTitle = msg.author.toString();

              //Increase score of user
              message.guild.triviaData.triviaScore.set(
                msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
              );
              msg.react('✅');

              if (songNameFound && songSingerFound) {
                //One extra point if user guessed Title and Artist in two separate messages
                if (userWhoFoundTitle === userWhoFoundArtist) {
                  message.guild.triviaData.triviaScore.set(
                    msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
                  );
                }
                return collector.stop();
              }
            }
            // if user guessed singer
            else if (userInput === trackArtist || MusicTriviaCommand.levenshtein(userInput, trackArtist) <= MAX_DISTANCE) {
              if (songSingerFound) {
                msg.react('😴');
                return;
              }
              songSingerFound = true;
              userWhoFoundArtist = msg.author.toString();

              //Increase score of user
              message.guild.triviaData.triviaScore.set(
                msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
              );
              msg.react('✅');

              if (songNameFound && songSingerFound) {
                //One extra point if user guessed Title and Artist in two separate messages
                if (userWhoFoundTitle === userWhoFoundArtist) {
                  message.guild.triviaData.triviaScore.set(
                    msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
                  );
                }
                return collector.stop();
              }
            } else if (MusicTriviaCommand.levenshtein(userInput, trackArtist + ' ' + trackTitle) <= MAX_DISTANCE
              ||
              MusicTriviaCommand.levenshtein(userInput, trackTitle + ' ' + trackArtist) <= MAX_DISTANCE
            ) {
              if ((songSingerFound && !songNameFound) || (songNameFound && !songSingerFound)) {
                message.guild.triviaData.triviaScore.set(
                  msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 1
                );
                msg.react('✅');
                return collector.stop();
              }
              message.guild.triviaData.triviaScore.set(
                msg.author.toString(), message.guild.triviaData.triviaScore.get(msg.author.toString()) + 3
              );
              msg.react('✅');
              return collector.stop();
            } else {
              // wrong answer
              return msg.react('❌');
            }
          });
          collector.on('end', async function() {
            /*
            The reason for this if statement is that we don't want to get an
            empty embed returned via chat by the bot if end-trivia command was called
            */
            if (message.guild.triviaData.wasTriviaEndCalled) {
              message.guild.triviaData.wasTriviaEndCalled = false;
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

            const song = `${classThis.capitalize_Words(queue[0].singer)} - ${classThis.capitalize_Words(queue[0].title)}`;

            const embed = new MessageEmbed()
              .setColor('#44f1e1')
              .setTitle(`:musical_note: The song was:\n ${song}`)
              .setThumbnail(queue[0].image)
              .setFooter(`Song ${song_count[0]} of ${song_count[1]}`);
            classThis.setLeaderboardOnMessage(embed, Array.from(sortedScoreMap.entries()));

            message.channel.send(embed);
            await queue.shift();
            dispatcher.end();
            return;
          });
        })
        .on('error', async function(e) {
          message.reply(':x: Could not play that song!');
          console.log(e);
          if (queue.length > 1) {
            await queue.shift();
            await classThis.playQuizSong(queue, message, [song_count[0] += 1, song_count[1]]);
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
          classThis.setLeaderboardOnMessage(embed, Array.from(sortedScoreMap.entries()));
          message.channel.send(embed);
          message.guild.musicData.isPlaying = false;
          message.guild.triviaData.isTriviaRunning = false;
          message.guild.triviaData.triviaScore.clear();
          message.guild.musicData.songDispatcher = null;
          message.guild.me.voice.channel.leave();
          return;
        })
        .on('finish', function() {
          if (queue.length >= 1) {
            return classThis.playQuizSong(queue, message, [song_count[0] += 1, song_count[1]]);
          } else {
            if (message.guild.triviaData.wasTriviaEndCalled) {
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
            classThis.setLeaderboardOnMessage(embed, Array.from(sortedScoreMap.entries()));
            message.channel.send(embed);
            message.guild.musicData.isPlaying = false;
            message.guild.triviaData.isTriviaRunning = false;
            message.guild.triviaData.triviaScore.clear();
            message.guild.musicData.songDispatcher = null;
            message.guild.me.voice.channel.leave();
            return;
          }
        });
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

  async run(message, { numberOfSongs, playlist }) {
    // check if user is in a voice channel
    let voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      await message.reply(':no_entry: Please join a voice channel and try again!');
      return;
    }
    if (message.guild.musicData.isPlaying === true)
      return message.channel.send(':x: A quiz or a song is already running!');
    message.guild.musicData.isPlaying = true;
    message.guild.triviaData.isTriviaRunning = true;
    message.guild.triviaData.triviaQueue = [];

    await spotifyClient.login(spotifyClientId, spotifySecret);
    const playlistRegex = /\/playlist\/(.+)\?/;
    playlist = playlist.match(playlistRegex)[1];
    if (!playlist) {
      await message.reply('Invalid playlist!');
      return;
    } else {
      await message.reply('Collecting songs...');
    }
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
    let numberOfSkips = 0;
    for (let track of trackItems) {
      track = track.track;
      if (!track.id || songMap.has(track.id) || track.artists[0].name === null || track.name === null) {
        continue;
      }
      if (track.previewUrl === null) {
        //Try to get preview url via spotify-url-info
        let url = await getPreview(track.externalUrls.spotify);
        //console.log(url);
        if (!url) {
          numberOfSkips++;
          continue;
        }
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

    console.log('Had to skip ' + numberOfSkips + ' songs because of missing previewURL');

    if (songMap.size < numberOfSongs) {
      message.guild.musicData.isPlaying = false;
      message.guild.triviaData.isTriviaRunning = false;
      message.guild.triviaData.triviaQueue = [];
      return message.reply('Couldnt get enough tracks with preview, sorey');
    }
    const infoEmbed = new MessageEmbed()
      .setColor('#44f1e1')
      .setTitle(':notes: Starting Music Quiz!')
      .setDescription(
        `:notes: Get ready! There are ${numberOfSongs} songs, you have 30 seconds to guess either the singer/band or the name of the song. Good luck!
      You can end the trivia at any point by using the ${prefix}end-trivia command!`
      );
    await message.channel.send(infoEmbed);
    message.guild.triviaData.triviaQueue = Array.from(songMap.values());
    const channelInfo = Array.from(
      message.member.voice.channel.members.entries()
    );
    channelInfo.forEach(user => {
      if (user[1].user.bot) return;
      message.guild.triviaData.triviaScore.set(user[1].user.toString(), 0);
    });
    await MusicTriviaCommand.playQuizSong(
      message.guild.triviaData.triviaQueue,
      message,
      [1 ,numberOfSongs]
    );
  }
};
