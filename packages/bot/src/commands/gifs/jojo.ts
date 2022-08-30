import { ApplyOptions } from '@sapphire/decorators';
import {
  ApplicationCommandRegistry,
  Command,
  CommandOptions
} from '@sapphire/framework';
import type { CommandInteraction } from 'discord.js';
import axios from 'axios';
import Logger from '../../lib/utils/logger';
import { trpcNode } from '../../trpc';

@ApplyOptions<CommandOptions>({
  name: 'jojo',
  description: 'Replies with a random jojo gif!',
  preconditions: ['isCommandDisabled']
})
export class JojoCommand extends Command {
  public override chatInputRun(interaction: CommandInteraction) {
    if (!process.env.TENOR_API) return;
    axios
      .get(
        `https://api.tenor.com/v1/random?key=${process.env.TENOR_API}&q=jojo&limit=1`
      )
      .then(async response => {
        const data = await trpcNode.query('user.get-user-by-id', {
          id: '183647046564184065'
        });

        return await interaction.reply({
          content: response.data.results[0].url
        });
      })
      .catch(async error => {
        Logger.error(error);
        return await interaction.reply(
          'Something went wrong when trying to fetch a jojo gif :('
        );
      });
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry
  ): void {
    registry.registerChatInputCommand({
      name: this.name,
      description: this.description
    });
  }
}
