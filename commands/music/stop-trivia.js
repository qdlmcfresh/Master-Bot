const { Command } = require('discord.js-commando');

module.exports = class StopMusicTriviaCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'stop-trivia',
      aliases: [
        'stop-music-trivia',
        'end-trivia',
        'stop-trivia',
        'stop-quiz'
      ],
      memberName: 'stop-trivia',
      group: 'music',
      description: 'End the music trivia!',
      guildOnly: true,
    });
  }
  async run(message) {
    if (!message.guild.triviaData.triviaScore.has(message.author.toString())) {
      await message.reply(
        ':stop_sign: You need to participate in the trivia in order to end it'
      );
      return;
    }

    message.guild.triviaData.triviaQueue.length = 0;
    message.guild.triviaData.wasTriviaEndCalled = true;
    message.guild.triviaData.triviaScore.clear();
    message.guild.musicData.songDispatcher.end();
    await message.channel.send('🛑 K, stopping trivia');
  }
};
