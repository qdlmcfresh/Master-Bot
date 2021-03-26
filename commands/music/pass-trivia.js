const Discord = require('discord.js');
const { Command } = require('discord.js-commando');

module.exports = class PassMusicTriviaCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'pass-trivia',
            aliases: [
                'pass',
                'skip-trivia'
            ],
            memberName: 'pass-trivia',
            group: 'music',
            description: 'Skip current song in trivia',
            guildOnly: true,
            clientPermissions: ['SPEAK', 'CONNECT']
        });
    }
    run(message) {
        if (!message.guild.triviaData.isTriviaRunning) {
            message.reply(':x: No trivia is currently running!');
            return;
        }

        if (message.guild.me.voice.channel !== message.member.voice.channel) {
            message.reply(':no_entry: Please join a voice channel and try again!');
            return;
        }

        if (!message.guild.triviaData.triviaScore.has(message.author.username)) {
            message.reply(
                ':stop_sign: You need to participate in the trivia in order to end it'
            );
            return;
        }

        message.guild.triviaData.triviaPass.add(message.author.id);
        message.react('☑');
        if (message.guild.triviaData.triviaPass.size >= message.guild.triviaData.triviaScore.size * 0.5) {
            if (message.guild.triviaData.collector) {
                console.log("Trying to stop collector");
                message.guild.triviaData.collector.stop();
            }
        }
        return;
    }
};