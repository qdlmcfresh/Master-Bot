const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');

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
        const embed = new MessageEmbed()
            .setColor('#ff7373')
            .setTitle(`${message.guild.triviaData.triviaPass.size}/ ${Math.trunc(message.guild.triviaData.triviaPass.size * 0.5)}`);
        message.channel.send(embed);
        return;
    }
};