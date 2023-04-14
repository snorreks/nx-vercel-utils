import type { BaseOptions, EnvriomentData } from '..';
import { getCommandArguments } from './utils';
import { execute, logger } from '$utils';

const maxTimeout = 2 * 60 * 1000;

const deleteEnvVariable = async (
	options: BaseOptions & { key: string },
): Promise<boolean> => {
	const { projectRoot, packageManager, environment, key, githubBranch } =
		options;
	logger.debug('deleteEnvVariable', options);
	try {
		await execute({
			packageManager,
			commandArguments: getCommandArguments({
				...options,
				value: undefined,
				command: 'rm',
			}),
			questionAnswers: [
				{
					question: `Remove ${key} from which Environments?`,
					answer: githubBranch
						? `Preview (${githubBranch})`
						: environment,
				},
			],
			cwd: projectRoot,
			maxTimeout,
		});
		return true;
	} catch (error) {
		logger.debug('Error removing variable', error);
		return false;
	}
};

const addEnvVariable = async (
	options: BaseOptions & { key: string; value: string },
) => {
	const { projectRoot, packageManager, value, key } = options;
	logger.debug('addEnvVariable', options);
	await execute({
		packageManager,
		commandArguments: getCommandArguments({
			...options,
			command: 'add',
		}),
		cwd: projectRoot,
		questionAnswers: [
			{
				question: ` the value of ${key}? `,
				answer: value,
			},
			{
				question: `to which Git branch? (leave empty for all Preview branches)?`,
				answer: '',
			},
		],
		maxTimeout,
	});
};

export const uploadAndDeleteEnvVariable = async (
	options: BaseOptions,
	{ key, value, isNew }: EnvriomentData,
): Promise<void> => {
	if (!isNew) {
		await deleteEnvVariable({
			...options,
			key,
		});
	}

	await addEnvVariable({
		...options,
		key,
		value,
	});
};
