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
    async run(message) {
        if (!message.guild.triviaData.isTriviaRunning) {
            await message.reply(':x: No trivia is currently running!');
            return;
        }

        if (message.guild.me.voice.channel !== message.member.voice.channel) {
            await message.reply(':no_entry: Please join a voice channel and try again!');
            return;
        }

        if (!message.guild.triviaData.triviaScore.has(message.author.toString())) {
            await message.reply(
              ':stop_sign: You need to participate in the trivia in order to end it'
            );
            return;
        }

        message.guild.triviaData.triviaPass.add(message.author.id);
        let size = message.guild.triviaData.triviaPass.size;
        let playerCount = Math.trunc(message.guild.triviaData.triviaScore.size * 0.5) + 1;
        const embed = new MessageEmbed()
            .setColor('#ff7373')
            .setTitle(`${size}/${playerCount} voted to skip this song.`);
        await message.channel.send(embed);
        if (size >= playerCount) {
            if (message.guild.triviaData.collector) {
                console.log("Trying to stop collector");
                message.guild.triviaData.collector.stop();
            }
        }
    }
};