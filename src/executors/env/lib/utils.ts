import { join } from 'node:path';
import type { BaseOptions } from '..';

type VercelCommand = 'add' | 'rm' | 'pull';

export const getCommandArguments = (
	options: BaseOptions & {
		key: string;
		value: string | undefined;
		command: VercelCommand;
	},
): string[] => {
	const {
		projectRoot,
		githubBranch,
		value,
		environment,
		key,
		temporaryDirectory,
		command,
	} = options;
	const commandArguments: string[] = [
		'vercel',
		'env',
		command,
		key,
		environment,
	];

	if (githubBranch) {
		commandArguments.push(githubBranch);
	}

	commandArguments.push(
		'--cwd',
		projectRoot,
		'--local-config',
		join(temporaryDirectory, 'vercel.json'),
	);

	if (!value) {
		commandArguments.push('--yes');
	}

	return commandArguments;
};
