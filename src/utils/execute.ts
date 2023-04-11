import type { PackageManager } from '$types';
import { spawn } from 'cross-spawn';
import { logger } from './logger';
type Environment = Record<string, string | undefined>;

export const execute = async (options: {
	packageManager: PackageManager;
	commandArguments: string[];
	cwd?: string;
	questionAnswers?: {
		question: string;
		answer: string;
	}[];
	environment?: Environment;
	maxTimeout?: number;
}) => {
	const { commandArguments, packageManager } = options;
	if (packageManager === 'global') {
		return runCommand({
			...options,
			command: commandArguments[0],
			commandArguments: commandArguments.slice(1),
		});
	}
	if (packageManager === 'npm') {
		return runCommand({
			...options,
			command: 'npm',
			commandArguments: ['run', ...commandArguments],
		});
	}

	return runCommand({
		...options,
		command: packageManager,
		commandArguments,
	});
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

export const runCommand = async (options: {
	command: string;
	cwd?: string;
	commandArguments?: string[];
	environment?: Environment;
	silent?: boolean;
	questionAnswers?: {
		question: string;
		answer: string;
	}[];

	maxTimeout?: number;
}): Promise<void> => {
	logger.debug('runCommand', options);
	const {
		command,
		cwd,
		commandArguments = [],
		environment,
		silent,
		questionAnswers,
		maxTimeout,
	} = options;
	logger.debug(`Executing "${command} ${commandArguments.join(' ')}"...`);

	const child = spawn(command, commandArguments, {
		cwd,
		env: environment ?? process.env,
		stdio: silent ? undefined : questionAnswers ? 'pipe' : 'inherit',
	});

	let timeoutId: NodeJS.Timeout | undefined;
	if (maxTimeout) {
		timeoutId = setTimeout(() => {
			logger.error('Command timed out');
			child.kill(); // Kill the child process if it hasn't completed within the timeout
		}, maxTimeout);
	}

	if (questionAnswers) {
		let strData = '';
		let questionAnswer = questionAnswers.shift();
		let isWriting = false;
		// let questionTimeoutId: NodeJS.Timeout | undefined;
		const onData = (data: Buffer) => {
			if (!questionAnswer || isWriting) {
				return;
			}

			const minifyText = (html: string) => {
				return html
					.replace(/\s{2,}/g, ' ')
					.replace(/'/g, '"')
					.replace(/> class="paragraph-class</g, '')
					.replace(/(\r\n|\n|\r)/gm, '')
					.replace(/ +(?= )/g, '')
					.replace(/> </g, '><')
					.replace(/ \/>/g, '/>')
					.replace(/ >/g, '>')
					.trim();
			};

			strData += data.toString();

			if (
				minifyText(strData).includes(
					minifyText(questionAnswer.question),
				)
			) {
				logger.debug('Found question', {
					questionAnswer,
				});
				isWriting = true;

				try {
					child.stdin?.write(questionAnswer.answer);
					child.stdin?.write('\n');

					questionAnswer = questionAnswers.shift();
					strData = '';
				} catch (error) {
					logger.error('Error writing to stdin', error);
				}
				isWriting = false;

				return;
			}

			// questionTimeoutId = setTimeout(() => {
			// 	logger.debug('Checking for question', {
			// 		questionAnswer,
			// 		strData,
			// 		data: currentStrData,
			// 		equal: strData === currentStrData,
			// 	});
			// 	if (questionAnswer && strData === currentStrData) {
			// 		try {
			// 			child.stdin?.write(questionAnswer.answer + '\n');
			// 			questionAnswer = questionAnswers.shift();
			// 		} catch (error) {
			// 			logger.error('Error writing to stdin', error);
			// 		}
			// 	}
			// }, 1000);
		};

		child.stdout?.on('data', (data) => {
			onData(data);
		});
		child.stderr?.on('data', (data) => {
			onData(data);
		});
	}

	try {
		await new Promise<void>((resolve, reject) => {
			child.once('close', (code) => {
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

			child.once('error', (error) => {
				reject(error);
			});
			child.once('exit', (code) => {
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
			child.once('disconnect', () => {
				reject(
					new Error(
						`Command "${command} ${commandArguments.join(
							' ',
						)}" disconnected`,
					),
				);
			});
		});
	} catch (error) {
		logger.debug(error);
		throw error;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
};
