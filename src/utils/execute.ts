import type { PackageManager } from '$types';
import { spawn } from 'cross-spawn';
import { logger } from './logger';
type Environment = Record<string, string | undefined>;

export const execute = async ({
	packageManager,
	commandArguments,
	cwd,
	autoPrompt,
	environment,
}: {
	packageManager: PackageManager;
	commandArguments: string[];
	cwd?: string;
	autoPrompt?: (data: string) => string | undefined;
	environment?: Environment;
}) => {
	if (packageManager === 'global') {
		await runCommand({
			command: commandArguments[0],
			commandArguments: commandArguments.slice(1),
			cwd,
			environment,
			autoPrompt,
		});
	} else if (packageManager === 'npm') {
		await runCommand({
			command: 'npm',
			commandArguments: ['run', ...commandArguments],
			cwd,
			autoPrompt,
			environment,
		});
	} else {
		await runCommand({
			command: packageManager,
			commandArguments,
			cwd,
			autoPrompt,
			environment,
		});
	}
};

/**
 * Run a command in a shell.
 *
 * @param command the command to execute
 * @param args the arguments to pass to the command
 * @param cwd the path in the monorepo to execute the command
 * @param env the environments ot pass to the command
 * @returns the result of the command
 */

export const runCommand = (options: {
	command: string;
	cwd?: string;
	commandArguments?: string[];
	environment?: Environment;
	silent?: boolean;
	autoPrompt?: (data: string) => string | undefined;
}): Promise<void> => {
	logger.debug('runCommand', options);
	const {
		command,
		cwd,
		commandArguments = [],
		environment,
		silent,
		autoPrompt,
	} = options;
	return new Promise((resolve, reject) => {
		logger.debug(`Executing "${command} ${commandArguments.join(' ')}"...`);
		const child = spawn(command, commandArguments, {
			cwd,
			env: environment ?? process.env,
			stdio: silent ? undefined : autoPrompt ? 'pipe' : 'inherit',
		});
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`Command "${command} ${commandArguments.join(
							' ',
						)}" failed with exit code ${code}`,
					),
				);
			}
		});

		if (autoPrompt) {
			child.stdout?.on('data', (data) => {
				const response = autoPrompt(data?.toString());
				if (response) {
					child.stdin?.write(response + '\n');
				}
			});
			child.stderr?.on('data', (data) => {
				const response = autoPrompt(data?.toString());
				if (response) {
					child.stdin?.write(response + '\n');
				}
			});
		}

		child.on('error', (error) => {
			logger.error(error);
			reject(error);
		});
		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`Command "${command} ${commandArguments.join(
							' ',
						)}" failed with exit code ${code}`,
					),
				);
			}
		});
		child.on('disconnect', () => {
			reject(
				new Error(
					`Command "${command} ${commandArguments.join(
						' ',
					)}" disconnected`,
				),
			);
		});
	});
};
